"""
Credential Analyzer — tests a managed account password change via BeyondTrust API
and captures the detailed error response for AI analysis.
"""

import logging

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


async def test_credential_change(db: AsyncSession, managed_account_id: int) -> CredentialTestResult:
    """
    Attempt a password change on a managed account via BeyondTrust API.
    Captures the full error response for AI analysis.

    Returns CredentialTestResult with error_raw containing the BT diagnostic message.
    """
    bt_url = await get_secret(db, "beyondtrust_url")
    bt_key = await get_secret(db, "beyondtrust_ps_auth")
    bt_user = await get_secret(db, "beyondtrust_username")
    bt_pwd = await get_secret(db, "beyondtrust_password")

    if not all([bt_url, bt_key, bt_user, bt_pwd]):
        return CredentialTestResult(False, 0, "BeyondTrust credentials not configured")

    base_url = build_base_url(bt_url)
    ps_auth = build_ps_auth_header(bt_key, bt_user, bt_pwd)

    # Login
    login = await bt_login(base_url, ps_auth)
    if not login["success"]:
        return CredentialTestResult(False, 0, f"BT login failed: {login.get('error', 'unknown')}")

    cookie = login.get("session_cookie", "")

    try:
        # Get account details first
        acct_resp = await bt_request(base_url, ps_auth, "GET", f"ManagedAccounts/{managed_account_id}", session_cookie=cookie)
        account_data = acct_resp.json if acct_resp.status == 200 else None

        # Attempt password change — this triggers the actual rotation and returns detailed error on failure
        change_resp = await bt_request(
            base_url, ps_auth, "POST",
            f"ManagedAccounts/{managed_account_id}/Credentials/Change",
            session_cookie=cookie,
        )

        if change_resp.status == 204:
            # Success — password was changed
            return CredentialTestResult(
                success=True,
                status_code=204,
                error_raw="Password changed successfully",
                account_data=account_data,
            )

        # Failure — capture detailed error
        error_text = ""
        if change_resp.json and isinstance(change_resp.json, str):
            error_text = change_resp.json
        elif change_resp.body_text:
            # Strip JSON quotes if present
            error_text = change_resp.body_text.strip('"').replace("\\r\\n", "\n").replace("\\n", "\n")

        logger.info(f"[CredentialAnalyzer] MA {managed_account_id} change failed: status={change_resp.status}")

        return CredentialTestResult(
            success=False,
            status_code=change_resp.status,
            error_raw=error_text,
            account_data=account_data,
        )

    except Exception as e:
        logger.error(f"[CredentialAnalyzer] Error testing MA {managed_account_id}: {e}")
        return CredentialTestResult(False, 0, f"Exception: {str(e)}")

    finally:
        await bt_logout(base_url, ps_auth, cookie)
