"""
Card Orchestrator — coordinates the full flow:
1. Group failures by managed_system_id per zone
2. Test one credential per system via BeyondTrust
3. Send error to Anthropic for AI analysis
4. Look up platform owner for the zone
5. Create work item in Azure DevOps
6. Save everything to database
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential_failure_analysis import CredentialFailureAnalysis
from app.models.devops_card import DevopsCard
from app.models.password_failure import PasswordFailure
from app.models.platform_owner import PlatformOwner
from app.models.zone_ai_config import ZoneAiConfig
from app.services.anthropic_service import analyze_credential_failure
from app.services.credentials_service import get_secret
from app.services.devops_service import create_work_item

logger = logging.getLogger(__name__)


class OrchestratorResult:
    def __init__(self):
        self.systems_processed = 0
        self.cards_created = 0
        self.errors = []
        self.details = []


async def run_zone_analysis(db: AsyncSession, zone_id: str, dry_run: bool = False) -> OrchestratorResult:
    """
    Run the full analysis flow for a single zone.
    If dry_run=True, performs analysis but does not create DevOps cards.
    """
    result = OrchestratorResult()

    # 1. Load zone config
    config_r = await db.execute(select(ZoneAiConfig).where(ZoneAiConfig.zone_id == zone_id))
    config = config_r.scalar_one_or_none()

    if not config or not config.is_enabled:
        result.errors.append("Zone AI analysis is not enabled")
        return result

    # 2. Load secrets
    anthropic_key = await get_secret(db, f"zone_{zone_id}_anthropic_api_key")
    devops_org_url = await get_secret(db, f"zone_{zone_id}_devops_org_url")
    devops_pat = await get_secret(db, f"zone_{zone_id}_devops_pat_token")

    if not anthropic_key:
        result.errors.append("Anthropic API Key not configured for this zone")
        return result

    if not dry_run and (not devops_org_url or not devops_pat or not config.devops_project):
        result.errors.append("Azure DevOps not fully configured for this zone")
        return result

    # 3. Get failures grouped by managed_system_id (only those with managed_account_id)
    failures_q = (
        select(
            PasswordFailure.managed_system_id,
            func.min(PasswordFailure.system_name).label("system_name"),
            func.min(PasswordFailure.managed_account_id).label("sample_account_id"),
            func.min(PasswordFailure.account_name).label("sample_account_name"),
            func.min(PasswordFailure.platform_name).label("platform_name"),
            func.min(PasswordFailure.workgroup_name).label("workgroup_name"),
            func.array_agg(PasswordFailure.id).label("failure_ids"),
            func.count().label("failure_count"),
        )
        .where(
            PasswordFailure.zone_id == zone_id,
            PasswordFailure.record_type == "failure",
            PasswordFailure.managed_account_id.isnot(None),
            PasswordFailure.managed_system_id.isnot(None),
        )
        .group_by(PasswordFailure.managed_system_id)
        .order_by(func.count().desc())
        .limit(config.max_cards_per_run)
    )

    systems = (await db.execute(failures_q)).all()

    if not systems:
        result.errors.append("No failures with managed_account_id found for this zone")
        return result

    # 4. Filter out systems that already have an open card OR a recent card (last 7 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    existing_cards_q = select(DevopsCard.managed_system_id).where(
        DevopsCard.zone_id == zone_id,
        # Open cards (any status) OR recently created cards
        (DevopsCard.status.in_(["created", "synced", "pending_retry", "error"]))
        | (DevopsCard.created_at >= cutoff),
    )
    existing_systems = {row[0] for row in (await db.execute(existing_cards_q)).all()}

    # 5. Load platform owners for this zone
    owners_q = select(PlatformOwner).where(PlatformOwner.zone_id == zone_id, PlatformOwner.is_active.is_(True))
    owners = {po.platform_type.lower(): po for po in (await db.execute(owners_q)).scalars().all()}

    # 6. Open a single BeyondTrust session for all systems
    from app.services.credential_analyzer import bt_session_login, bt_session_logout, test_credential_with_session

    bt_session = await bt_session_login(db)
    if not bt_session:
        result.errors.append("Failed to open BeyondTrust session")
        return result

    try:
        # 7. Process each system using shared session
        for sys_row in systems:
            ms_id = sys_row.managed_system_id
            if ms_id in existing_systems:
                result.details.append({"system": sys_row.system_name, "skipped": "card already exists"})
                continue

            result.systems_processed += 1

            try:
                detail = await _process_system(
                    db=db,
                    zone_id=zone_id,
                    config=config,
                    ms_id=ms_id,
                    system_name=sys_row.system_name,
                    sample_account_id=sys_row.sample_account_id,
                    sample_account_name=sys_row.sample_account_name,
                    platform_name=sys_row.platform_name or "Unknown",
                    workgroup_name=sys_row.workgroup_name or "Unknown",
                    failure_ids=[str(fid) for fid in sys_row.failure_ids],
                    failure_count=sys_row.failure_count,
                    owners=owners,
                    anthropic_key=anthropic_key,
                    devops_org_url=devops_org_url,
                    devops_pat=devops_pat,
                    dry_run=dry_run,
                    bt_session=bt_session,
                )
                result.details.append(detail)
                if detail.get("card_created"):
                    result.cards_created += 1

            except Exception as e:
                logger.error(f"[Orchestrator] Error processing system {sys_row.system_name}: {e}")
                result.errors.append(f"System {sys_row.system_name}: {str(e)}")
    finally:
        await bt_session_logout(bt_session)

    return result


async def _process_system(
    db: AsyncSession,
    zone_id: str,
    config: ZoneAiConfig,
    ms_id: int,
    system_name: str,
    sample_account_id: int,
    sample_account_name: str,
    platform_name: str,
    workgroup_name: str,
    failure_ids: list[str],
    failure_count: int,
    owners: dict,
    anthropic_key: str,
    devops_org_url: str | None,
    devops_pat: str | None,
    dry_run: bool,
    bt_session: dict | None = None,
) -> dict:
    """Process a single managed system: test → analyze → create card."""
    from app.services.credential_analyzer import test_credential_with_session

    detail = {
        "system": system_name,
        "managed_system_id": ms_id,
        "account_tested": sample_account_name,
        "failure_count": failure_count,
    }

    # Step 1: Test credential via BeyondTrust (using shared session)
    logger.info(f"[Orchestrator] Testing MA {sample_account_id} ({sample_account_name}@{system_name})")
    test_result = await test_credential_with_session(bt_session, sample_account_id)
    detail["bt_status"] = test_result.status_code
    detail["bt_success"] = test_result.success

    if test_result.success:
        detail["skipped"] = "credential change succeeded — no card needed"
        return detail

    # Step 2: Send to Anthropic for analysis (with zone-specific few-shot examples)
    logger.info(f"[Orchestrator] Analyzing error for {system_name} via Anthropic")
    ai_result = await analyze_credential_failure(
        api_key=anthropic_key,
        model=config.anthropic_model,
        error_raw=test_result.error_raw,
        hostname=system_name,
        platform=platform_name,
        workgroup=workgroup_name,
        account_name=sample_account_name,
        managed_account_id=sample_account_id,
        account_data=test_result.account_data,
        db=db,
        zone_id=zone_id,
    )

    if "error" in ai_result:
        detail["ai_error"] = ai_result["error"]
        return detail

    detail["ai_category"] = ai_result.get("category")
    detail["ai_confidence"] = ai_result.get("confidence")

    # Step 3: Save analysis
    # Get the first failure ID for the FK reference
    first_failure_id = failure_ids[0] if failure_ids else None
    analysis = CredentialFailureAnalysis(
        password_failure_id=first_failure_id,
        zone_id=zone_id,
        managed_account_id=sample_account_id,
        error_raw=test_result.error_raw,
        ai_diagnosis=ai_result.get("diagnosis"),
        ai_category=ai_result.get("category"),
        ai_confidence=ai_result.get("confidence"),
        suggested_action=ai_result.get("suggested_action"),
        suggested_platform_type=ai_result.get("platform_type"),
        card_title=ai_result.get("card_title"),
        card_description=ai_result.get("card_description"),
    )
    db.add(analysis)
    await db.flush()

    if dry_run:
        detail["dry_run"] = True
        detail["card_title"] = ai_result.get("card_title")
        await db.commit()
        return detail

    # Step 4: Find platform owner
    suggested_platform = (ai_result.get("platform_type") or "").lower()
    owner = owners.get(suggested_platform)
    # Fallback: partial match (e.g. "windows server" matches "windows")
    if not owner:
        for key, po in owners.items():
            if key in suggested_platform or suggested_platform in key:
                owner = po
                break
    # Fallback: first available owner for the zone when no match found
    if not owner and owners:
        owner = next(iter(owners.values()))
        logger.info(f"[Orchestrator] No platform match for '{suggested_platform}', using fallback owner: {owner.owner1_email}")

    assigned_to = owner.owner1_email if owner else None
    owner1 = owner.owner1_email if owner else None
    owner2 = owner.owner2_email if owner else None
    area_path = owner.devops_area_path if owner else None
    iteration_path = owner.devops_iteration_path if owner else None

    # Step 5: Create DevOps work item
    card_title = ai_result.get("card_title", f"[PS] Falha de credencial em {system_name}")
    card_description = ai_result.get("card_description", f"<p>Falha de rotação de senha no sistema {system_name}</p>")

    # Append platform type to Dados Técnicos if not already present
    ai_platform = ai_result.get("platform_type") or platform_name
    if ai_platform and f"Plataforma:" not in card_description:
        card_description = card_description.replace(
            "</ul>",
            f"<li>Plataforma: {ai_platform}</li></ul>",
        )

    due = date.today() + timedelta(days=15)

    # Determine parent ID (Feature > Epic)
    parent_id = config.devops_feature_id or config.devops_epic_id

    devops_result = await create_work_item(
        org_url=devops_org_url,
        pat_token=devops_pat,
        project=config.devops_project,
        work_item_type=config.devops_work_item_type,
        title=card_title,
        description=card_description,
        assigned_to=assigned_to,
        area_path=area_path,
        iteration_path=iteration_path,
        due_date=due,
        parent_id=parent_id,
        tags="SecOps;2026",
    )

    # Step 6: Save card
    card = DevopsCard(
        zone_id=zone_id,
        managed_system_id=ms_id,
        system_name=system_name,
        failure_ids=failure_ids,
        title=card_title,
        description=card_description,
        assigned_to=assigned_to,
        owner1=owner1,
        owner2=owner2,
        due_date=due,
        ai_classification=ai_result,
    )

    if devops_result.success:
        card.devops_work_item_id = devops_result.work_item.work_item_id
        card.devops_url = devops_result.work_item.html_url
        card.status = "created"
        detail["card_created"] = True
        detail["devops_work_item_id"] = devops_result.work_item.work_item_id
        detail["devops_url"] = devops_result.work_item.html_url
    else:
        card.status = "error"
        card.error_message = devops_result.error
        detail["devops_error"] = devops_result.error

    db.add(card)

    # Audit log
    from app.services.audit_service import log_action
    await log_action(
        db,
        action="card_created" if devops_result.success else "card_creation_failed",
        resource_type="devops_card",
        resource_id=str(card.id) if card.id else None,
        zone_id=zone_id,
        details={
            "system": system_name,
            "managed_system_id": ms_id,
            "ai_category": ai_result.get("category"),
            "devops_work_item_id": devops_result.work_item.work_item_id if devops_result.success else None,
        },
    )

    await db.commit()

    detail["card_title"] = card_title
    return detail
