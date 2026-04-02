"""
Credential Analyzer — tests managed account password changes via BeyondTrust API
and captures the detailed error response for AI analysis.

Supports shared BT sessions (login once, test many accounts, logout once).
"""

import logging
import traceback

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.beyondtrust_service import (
    bt_login, bt_logout, bt_request,
    build_base_url, build_ps_auth_header,
)
from app.services.credentials_service import get_secret

logger = logging.getLogger(__name__)


class CredentialTestResult:
    def __init__(self, success: bool, status_code: int, error_raw: str, account_data: dict | None = None):
        self.success = success
        self.status_code = status_code
        self.error_raw = error_raw
        self.account_data = account_data


# ─── Session management (login once, test many, logout once) ──────────────


async def bt_session_login(db: AsyncSession) -> dict | None:
    """
    Open a BeyondTrust API session. Returns session dict or None on failure.
    The session should be passed to test_credential_with_session() and
    closed with bt_session_logout() when done.
    """
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_key = await get_secret(db, "beyondtrust_ps_auth")
    bt_user = await get_secret(db, "beyondtrust_username")
    bt_pwd = await get_secret(db, "beyondtrust_password")

    if not all([bt_url, bt_key, bt_user, bt_pwd]):
        logger.error("[CredentialAnalyzer] BeyondTrust credentials not configured")
        return None

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_key, bt_user, bt_pwd)

    login = await bt_login(base_url, ps_auth)
    if not login["success"]:
        logger.error(f"[CredentialAnalyzer] BT login failed: {login.get('error')}")
        return None

    logger.info("[CredentialAnalyzer] BT session opened successfully")
    return {
        "base_url": base_url,
        "ps_auth": ps_auth,
        "cookie": login.get("session_cookie", ""),
    }


async def bt_session_logout(session: dict) -> None:
    """Close BeyondTrust API session."""
    try:
        await bt_logout(session["base_url"], session["ps_auth"], session["cookie"])
        logger.info("[CredentialAnalyzer] BT session closed")
    except Exception:
        pass


async def test_credential_with_session(session: dict, managed_account_id: int) -> CredentialTestResult:
    """
    Test a managed account password change using an existing BT session.
    Captures the full error response including FA connection details.
    """
    base_url = session["base_url"]
    ps_auth = session["ps_auth"]
    cookie = session["cookie"]

    try:
        # Get account details first
        acct_resp = await bt_request(base_url, ps_auth, "GET", f"ManagedAccounts/{managed_account_id}", session_cookie=cookie)
        account_data = acct_resp.json if acct_resp.status == 200 else None

        # Attempt password change — triggers the full rotation pipeline
        # BT will: FA login to target → change password → report back
        # Timeout 120s because BT may take long to test multiple hosts
        change_resp = await bt_request(
            base_url, ps_auth, "POST",
            f"ManagedAccounts/{managed_account_id}/Credentials/Change",
            session_cookie=cookie,
            timeout_ms=120000,
        )

        if change_resp.status == 204:
            return CredentialTestResult(
                success=True,
                status_code=204,
                error_raw="Password changed successfully",
                account_data=account_data,
            )

        # Failure — capture detailed error from BeyondTrust
        error_text = _extract_error_text(change_resp)

        if not error_text or error_text.strip() == "":
            error_text = f"BeyondTrust returned HTTP {change_resp.status} with no error details."

        logger.info(f"[CredentialAnalyzer] MA {managed_account_id} change failed: status={change_resp.status}, error_length={len(error_text)}")

        return CredentialTestResult(
            success=False,
            status_code=change_resp.status,
            error_raw=error_text,
            account_data=account_data,
        )

    except Exception as e:
        error_detail = f"Exception testing MA {managed_account_id}: {type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        logger.error(f"[CredentialAnalyzer] {error_detail}")
        return CredentialTestResult(False, 0, error_detail)


# ─── Legacy standalone function (login/test/logout per call) ──────────────


async def test_credential_change(db: AsyncSession, managed_account_id: int) -> CredentialTestResult:
    """
    Standalone version: opens session, tests one account, closes session.
    Prefer bt_session_login + test_credential_with_session for batch operations.
    """
    session = await bt_session_login(db)
    if not session:
        return CredentialTestResult(False, 0, "BeyondTrust credentials not configured or login failed")

    try:
        return await test_credential_with_session(session, managed_account_id)
    finally:
        await bt_session_logout(session)


# ─── Helpers ──────────────────────────────────────────────────────────────


def _extract_error_text(resp) -> str:
    """Extract human-readable error text from BT API response."""
    if resp.json and isinstance(resp.json, str):
        return resp.json

    if resp.body_text:
        text = resp.body_text.strip('"').replace("\\r\\n", "\n").replace("\\n", "\n")
        if text:
            return text

    return ""
