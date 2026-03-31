"""
BeyondTrust API Client - port of supabase/functions/_shared/beyondtrust-client.ts

Features:
- Exponential backoff (1.5x) on 429 and 5xx errors
- HTTP/1.1 proxy support for BeyondTrust Cloud compatibility
- Session cookie management (SignAppin/SignAppout)
"""

import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class BtApiResult:
    def __init__(self, status: int, body_text: str, json: Any = None, headers: dict | None = None):
        self.status = status
        self.body_text = body_text
        self.json = json
        self.headers = headers or {}


def build_ps_auth_header(key: str, username: str, password: str) -> str:
    return f"PS-Auth key={key}; runas={username}; pwd=[{password}];"


def build_base_url(bt_url: str) -> str:
    return bt_url.rstrip("/") + "/BeyondTrust/api/public/v3/"


async def bt_request(
    base_url: str,
    ps_auth: str,
    method: str,
    path: str,
    *,
    data: Any = None,
    params: dict | None = None,
    timeout_ms: int = 30000,
    retries: int = 5,
    proxy_url: str | None = None,
    session_cookie: str | None = None,
) -> BtApiResult:
    proxy = proxy_url or settings.http11_proxy_url
    target_url = base_url.rstrip("/") + "/" + path.lstrip("/")

    if params:
        from urllib.parse import urlencode
        target_url += "?" + urlencode({k: v for k, v in params.items() if v is not None})

    headers: dict[str, str] = {
        "Authorization": ps_auth,
        "Accept": "application/json",
    }

    if session_cookie:
        headers["Cookie"] = session_cookie

    if proxy:
        parsed = urlparse(target_url)
        fetch_url = proxy.rstrip("/") + parsed.path
        if parsed.query:
            fetch_url += "?" + parsed.query
        headers["X-Target-Host"] = parsed.netloc
        logger.info(f"[BT-API] Using HTTP/1.1 proxy: {proxy} -> {parsed.netloc}")
    else:
        fetch_url = target_url

    body: str | None = None
    if data is not None and data != "" and data is not None:
        import json as json_module
        body = json_module.dumps(data)
    elif method in ("POST", "PUT"):
        body = "{}"

    if method in ("POST", "PUT", "DELETE"):
        headers["Content-Type"] = "application/json"
        if body is not None:
            headers["Content-Length"] = str(len(body.encode()))
        else:
            body = "{}"
            headers["Content-Length"] = "2"

    last_err: Exception | None = None
    timeout = httpx.Timeout(timeout_ms / 1000)

    for attempt in range(1, retries + 1):
        try:
            logger.info(f"[BT-API] {method} {path} (attempt {attempt}/{retries})")

            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, fetch_url, headers=headers, content=body)

            body_text = resp.text
            json_data = None
            try:
                import json as json_module
                json_data = json_module.loads(body_text) if body_text else None
            except (ValueError, TypeError):
                pass

            should_retry = resp.status_code == 429 or (500 <= resp.status_code <= 599)

            if not should_retry or attempt == retries:
                return BtApiResult(
                    status=resp.status_code,
                    body_text=body_text,
                    json=json_data,
                    headers=dict(resp.headers),
                )

            backoff = round(1500 * (1.5 ** (attempt - 1)))
            logger.info(f"[BT-API] Retry {attempt}/{retries} after {backoff}ms (status: {resp.status_code})")
            await asyncio.sleep(backoff / 1000)

        except Exception as e:
            last_err = e
            if attempt == retries:
                raise
            backoff = round(1500 * (1.5 ** (attempt - 1)))
            logger.info(f"[BT-API] Retry {attempt}/{retries} after {backoff}ms (error: {e})")
            await asyncio.sleep(backoff / 1000)

    raise last_err or Exception("Unknown error")
