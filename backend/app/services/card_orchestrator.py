"""
Card Orchestrator — coordinates the full flow:
1. Group failures by managed_system_id per zone (ALL systems, no limit)
2. Collect ALL managed accounts per system
3. Test one credential per system via BeyondTrust
4. Ping target host to check reachability
5. Send error + ping result to Anthropic for AI analysis
6. Look up platform owner for the zone
7. Find or create monthly PBI in Azure DevOps
8. Create Task under the PBI
9. Save everything to database
"""

import asyncio
import logging
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func, and_, distinct, cast, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credential_failure_analysis import CredentialFailureAnalysis
from app.models.devops_card import DevopsCard
from app.models.password_failure import PasswordFailure
from app.models.platform_owner import PlatformOwner
from app.models.zone_ai_config import ZoneAiConfig
from app.services.anthropic_service import analyze_credential_failure
from app.services.credentials_service import get_secret
from app.services.devops_service import create_work_item, find_work_item_by_title

logger = logging.getLogger(__name__)

# Month names in Portuguese for PBI titles
MONTH_NAMES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}


async def ping_host(hostname: str, timeout: int = 3) -> dict:
    """
    Ping a host to check if it's alive.
    Returns dict with: alive (bool), latency_ms (float|None), detail (str).
    Works on Linux (AKS pod) — uses ping -c 1 -W <timeout>.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", str(timeout), hostname,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 5)
        output = stdout.decode("utf-8", errors="replace")

        if proc.returncode == 0:
            match = re.search(r"time[=<]([\d.]+)\s*ms", output)
            latency = float(match.group(1)) if match else None
            detail = f"Host respondeu ao ping" + (f" em {latency}ms" if latency else "")
            logger.info(f"[Ping] {hostname}: alive, latency={latency}ms")
            return {"alive": True, "latency_ms": latency, "detail": detail}
        else:
            detail = f"Host não respondeu ao ping (timeout {timeout}s)"
            logger.info(f"[Ping] {hostname}: not reachable (rc={proc.returncode})")
            return {"alive": False, "latency_ms": None, "detail": detail}

    except asyncio.TimeoutError:
        detail = f"Ping timeout após {timeout + 5}s"
        logger.warning(f"[Ping] {hostname}: process timeout")
        return {"alive": False, "latency_ms": None, "detail": detail}
    except Exception as e:
        detail = f"Erro ao executar ping: {type(e).__name__}: {e}"
        logger.warning(f"[Ping] {hostname}: {detail}")
        return {"alive": False, "latency_ms": None, "detail": detail}


class OrchestratorResult:
    def __init__(self):
        self.systems_processed = 0
        self.cards_created = 0
        self.pbi_id = None
        self.pbi_title = None
        self.errors = []
        self.details = []


async def _get_or_create_monthly_pbi(
    db: AsyncSession,
    config: ZoneAiConfig,
    devops_org_url: str,
    devops_pat: str,
    zone_code: str,
) -> int | None:
    """
    Find or create the monthly PBI for credential analysis.
    Title pattern: [PS] Análise de Credenciais - <Mês>/<Ano> - <ZoneCode>
    Returns the PBI work item ID or None on failure.
    """
    today = date.today()
    month_name = MONTH_NAMES_PT.get(today.month, str(today.month))
    pbi_title = f"[PS] Análise de Credenciais - {month_name}/{today.year} - {zone_code}"

    # Search for existing PBI
    existing = await find_work_item_by_title(
        org_url=devops_org_url,
        pat_token=devops_pat,
        project=config.devops_project,
        title=pbi_title,
        work_item_type="Product Backlog Item",
    )

    if existing:
        logger.info(f"[Orchestrator] Found existing monthly PBI #{existing.work_item_id}: {pbi_title}")
        return existing.work_item_id

    # Create new PBI
    pbi_description = (
        f"<h3>Análise Mensal de Credenciais - Password Safe</h3>"
        f"<p>PBI gerado automaticamente para agrupar as tasks de análise de credenciais "
        f"do mês de <b>{month_name}/{today.year}</b> na zona <b>{zone_code}</b>.</p>"
        f"<p>Cada task abaixo representa um sistema com falha de rotação de senha "
        f"que precisa de ação corretiva.</p>"
    )

    parent_id = config.devops_feature_id or config.devops_epic_id

    pbi_result = await create_work_item(
        org_url=devops_org_url,
        pat_token=devops_pat,
        project=config.devops_project,
        work_item_type="Product Backlog Item",
        title=pbi_title,
        description=pbi_description,
        due_date=date(today.year, today.month + 1 if today.month < 12 else 1,
                      1 if today.month < 12 else 1) - timedelta(days=1)
            if today.month < 12
            else date(today.year + 1, 1, 1) - timedelta(days=1),
        parent_id=parent_id,
        tags="SecOps;2026",
    )

    if pbi_result.success:
        logger.info(f"[Orchestrator] Created monthly PBI #{pbi_result.work_item.work_item_id}: {pbi_title}")
        return pbi_result.work_item.work_item_id
    else:
        logger.error(f"[Orchestrator] Failed to create monthly PBI: {pbi_result.error}")
        return None


async def run_zone_analysis(db: AsyncSession, zone_id: str, dry_run: bool = False) -> OrchestratorResult:
    """
    Run the full analysis flow for a single zone.
    Processes ALL systems with failures (no limit).
    Creates a monthly PBI and Tasks under it.
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
    anthropic_base_url = await get_secret(db, f"zone_{zone_id}_anthropic_base_url")
    devops_org_url = await get_secret(db, f"zone_{zone_id}_devops_org_url")
    devops_pat = await get_secret(db, f"zone_{zone_id}_devops_pat_token")

    if not anthropic_key:
        result.errors.append("Anthropic API Key not configured for this zone")
        return result

    if not dry_run and (not devops_org_url or not devops_pat or not config.devops_project):
        result.errors.append("Azure DevOps not fully configured for this zone")
        return result

    # 3. Get systems that already have an open card OR a recent card (last 7 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    existing_cards_q = select(DevopsCard.managed_system_id).where(
        DevopsCard.zone_id == zone_id,
        (DevopsCard.status.in_(["created", "synced", "pending_retry", "error"]))
        | (DevopsCard.created_at >= cutoff),
    )
    existing_systems = {row[0] for row in (await db.execute(existing_cards_q)).all()}

    # 4. Get failures grouped by managed_system_id — NO LIMIT, fetch ALL systems
    failures_q = (
        select(
            PasswordFailure.managed_system_id,
            func.min(PasswordFailure.system_name).label("system_name"),
            func.min(PasswordFailure.managed_account_id).label("sample_account_id"),
            func.min(PasswordFailure.platform_name).label("platform_name"),
            func.min(PasswordFailure.workgroup_name).label("workgroup_name"),
            func.array_agg(distinct(PasswordFailure.account_name)).label("account_names"),
            func.array_agg(distinct(PasswordFailure.managed_account_id)).label("account_ids"),
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
    )

    # Exclude systems with existing open/recent cards
    if existing_systems:
        failures_q = failures_q.where(
            PasswordFailure.managed_system_id.notin_(existing_systems)
        )

    systems = (await db.execute(failures_q)).all()

    if not systems:
        result.errors.append("No new systems to analyze (all already have open/recent cards)")
        return result

    logger.info(f"[Orchestrator] Zone {zone_id}: {len(systems)} systems to process (skipped {len(existing_systems)} with existing cards)")

    # 5. Load platform owners for this zone
    owners_q = select(PlatformOwner).where(PlatformOwner.zone_id == zone_id, PlatformOwner.is_active.is_(True))
    owners = {po.platform_type.lower(): po for po in (await db.execute(owners_q)).scalars().all()}

    # 6. Find or create monthly PBI (only if not dry_run)
    monthly_pbi_id = None
    if not dry_run:
        # Get zone code for the PBI title
        from app.models.zone import Zone
        zone_r = await db.execute(select(Zone.code).where(Zone.id == zone_id))
        zone_code = zone_r.scalar() or "UNKNOWN"

        monthly_pbi_id = await _get_or_create_monthly_pbi(
            db, config, devops_org_url, devops_pat, zone_code
        )
        if not monthly_pbi_id:
            result.errors.append("Failed to find or create monthly PBI in Azure DevOps")
            return result

        result.pbi_id = monthly_pbi_id
        today = date.today()
        result.pbi_title = f"[PS] Análise de Credenciais - {MONTH_NAMES_PT.get(today.month)}/{today.year} - {zone_code}"

    # 7. Open a single BeyondTrust session for all systems
    from app.services.credential_analyzer import bt_session_login, bt_session_logout

    bt_session = await bt_session_login(db)
    if not bt_session:
        result.errors.append("Failed to open BeyondTrust session")
        return result

    try:
        # 8. Process each system (already deduped by query)
        for sys_row in systems:
            ms_id = sys_row.managed_system_id
            result.systems_processed += 1

            try:
                detail = await _process_system(
                    db=db,
                    zone_id=zone_id,
                    config=config,
                    ms_id=ms_id,
                    system_name=sys_row.system_name,
                    sample_account_id=sys_row.sample_account_id,
                    account_names=sys_row.account_names or [],
                    account_ids=sys_row.account_ids or [],
                    platform_name=sys_row.platform_name or "Unknown",
                    workgroup_name=sys_row.workgroup_name or "Unknown",
                    failure_ids=[str(fid) for fid in sys_row.failure_ids],
                    failure_count=sys_row.failure_count,
                    owners=owners,
                    anthropic_key=anthropic_key,
                    anthropic_base_url=anthropic_base_url,
                    devops_org_url=devops_org_url,
                    devops_pat=devops_pat,
                    dry_run=dry_run,
                    bt_session=bt_session,
                    monthly_pbi_id=monthly_pbi_id,
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
    account_names: list[str],
    account_ids: list[int],
    platform_name: str,
    workgroup_name: str,
    failure_ids: list[str],
    failure_count: int,
    owners: dict,
    anthropic_key: str,
    anthropic_base_url: str | None = None,
    devops_org_url: str | None = None,
    devops_pat: str | None = None,
    dry_run: bool = False,
    bt_session: dict | None = None,
    monthly_pbi_id: int | None = None,
) -> dict:
    """Process a single managed system: test → ping (by IP) → analyze → create task under PBI."""
    from app.services.credential_analyzer import test_credential_with_session, get_managed_system_ip

    sample_account_name = account_names[0] if account_names else "Unknown"

    detail = {
        "system": system_name,
        "managed_system_id": ms_id,
        "account_tested": sample_account_name,
        "accounts_total": len(account_names),
        "account_names": account_names,
        "failure_count": failure_count,
    }

    # Step 1: Test credential via BeyondTrust (using shared session, test ONE account)
    logger.info(f"[Orchestrator] Testing MA {sample_account_id} ({sample_account_name}@{system_name})")
    test_result = await test_credential_with_session(bt_session, sample_account_id)
    detail["bt_status"] = test_result.status_code
    detail["bt_success"] = test_result.success

    if test_result.success:
        detail["skipped"] = "credential change succeeded — no card needed"
        return detail

    # Step 2: Get IP from BeyondTrust, then ping by IP
    #   Priority: 1) BT ManagedSystem IPAddress  2) IP from BT error text  3) skip ping
    ping_target = None

    # Try BT API first
    system_ip = await get_managed_system_ip(bt_session, ms_id)
    if system_ip:
        ping_target = system_ip
    else:
        # Fallback: extract IP from BT error response (e.g., "Defined hosts: -,10.0.1.50" or "Host=10.0.1.50")
        ip_match = re.search(r'(?:Host[=:]|hosts:\s*-,)\s*([\d.]+)', test_result.error_raw or "")
        if ip_match:
            ping_target = ip_match.group(1)
            logger.info(f"[Orchestrator] Extracted IP {ping_target} from BT error for {system_name}")

    if ping_target:
        logger.info(f"[Orchestrator] Pinging {system_name} via IP {ping_target}")
        ping_result = await ping_host(ping_target)
        ping_result["target"] = ping_target
    else:
        logger.info(f"[Orchestrator] No IP found for {system_name}, skipping ping")
        ping_result = {"alive": None, "latency_ms": None, "detail": "IP não disponível para teste de ping", "target": None}

    detail["ping_target"] = ping_target
    detail["ping_alive"] = ping_result["alive"]
    detail["ping_latency_ms"] = ping_result["latency_ms"]

    # Step 3: Send to Anthropic for analysis
    logger.info(f"[Orchestrator] Analyzing error for {system_name} via Anthropic ({len(account_names)} accounts)")
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
        ping_result=ping_result,
        base_url=anthropic_base_url,
        db=db,
        zone_id=zone_id,
    )

    if "error" in ai_result:
        detail["ai_error"] = ai_result["error"]
        return detail

    detail["ai_category"] = ai_result.get("category")
    detail["ai_confidence"] = ai_result.get("confidence")

    # Step 4: Save analysis
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

    # Step 5: Find platform owner
    suggested_platform = (ai_result.get("platform_type") or "").lower()
    owner = owners.get(suggested_platform)
    if not owner:
        for key, po in owners.items():
            if key in suggested_platform or suggested_platform in key:
                owner = po
                break
    if not owner and owners:
        owner = next(iter(owners.values()))
        logger.info(f"[Orchestrator] No platform match for '{suggested_platform}', using fallback owner: {owner.owner1_email}")

    assigned_to = owner.owner1_email if owner else None
    owner1 = owner.owner1_email if owner else None
    owner2 = owner.owner2_email if owner else None
    area_path = owner.devops_area_path if owner else None
    iteration_path = owner.devops_iteration_path if owner else None

    # Step 6: Build card description with ALL accounts listed
    card_title = ai_result.get("card_title", f"[PS] Falha de credencial em {system_name}")

    # If multiple accounts, append count to title
    if len(account_names) > 1:
        card_title = f"{card_title} ({len(account_names)} contas)"

    card_description = ai_result.get(
        "card_description",
        f"<p>Falha de rotação de senha no sistema {system_name}</p>",
    )

    # Append platform type if not already present
    ai_platform = ai_result.get("platform_type") or platform_name
    if ai_platform and "Plataforma:" not in card_description:
        card_description = card_description.replace(
            "</ul>",
            f"<li>Plataforma: {ai_platform}</li></ul>",
        )

    # Append ALL accounts list to description
    accounts_html = "<h3>Contas Afetadas</h3><ul>"
    for acct_name in sorted(account_names):
        accounts_html += f"<li>{acct_name}</li>"
    accounts_html += "</ul>"
    card_description += accounts_html

    due = date.today() + timedelta(days=15)

    # Step 7: Create Task under the monthly PBI
    devops_result = await create_work_item(
        org_url=devops_org_url,
        pat_token=devops_pat,
        project=config.devops_project,
        work_item_type="Task",
        title=card_title,
        description=card_description,
        assigned_to=assigned_to,
        area_path=area_path,
        iteration_path=iteration_path,
        due_date=due,
        parent_id=monthly_pbi_id,
        tags="SecOps;2026",
    )

    # Step 8: Save card
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
            "accounts": account_names,
            "ai_category": ai_result.get("category"),
            "pbi_id": monthly_pbi_id,
            "devops_work_item_id": devops_result.work_item.work_item_id if devops_result.success else None,
        },
    )

    await db.commit()

    detail["card_title"] = card_title
    return detail
