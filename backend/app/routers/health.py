from datetime import datetime, timezone

import httpx
from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/outbound-ip")
async def get_outbound_ip():
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get("https://api.ipify.org?format=json")
            data = resp.json()
            return {"ip": data.get("ip", "unknown")}
        except Exception as e:
            return {"ip": "unknown", "error": str(e)}
