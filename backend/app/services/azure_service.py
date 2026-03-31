"""
Azure Service - port of supabase/functions/sync-azure-vms/index.ts

Features:
- OAuth2 client_credentials flow for Azure AD (ARM + Graph)
- List VMs from all subscriptions
- Fetch power state (instance view)
- Detect domain status: 1) Tags, 2) Graph API, 3) Run Command (LRO polling)
- Fetch NIC for private IP
- Per-zone credentials (suffix _ZONE_CODE in secrets)
- Batch parallel processing with concurrency control
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

AZURE_MGMT_API = "https://management.azure.com"
AZURE_GRAPH_API = "https://graph.microsoft.com/v1.0"


async def get_azure_arm_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Get OAuth2 access token for Azure Resource Manager API."""
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            token_url,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://management.azure.com/.default",
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code != 200:
            raise Exception(f"Azure ARM auth failed: {resp.status_code} - {resp.text}")
        return resp.json()["access_token"]


async def get_graph_access_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    """Get OAuth2 access token for Microsoft Graph API."""
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            token_url,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code != 200:
            raise Exception(f"Graph auth failed: {resp.status_code} - {resp.text}")
        return resp.json()["access_token"]


async def list_subscriptions(arm_token: str) -> list[dict]:
    """List all Azure subscriptions accessible with the token."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{AZURE_MGMT_API}/subscriptions?api-version=2020-01-01",
            headers={"Authorization": f"Bearer {arm_token}"},
        )
        if resp.status_code != 200:
            raise Exception(f"Failed to fetch subscriptions: {resp.status_code}")
        return resp.json().get("value", [])


async def fetch_vms_from_subscription(
    subscription_id: str,
    subscription_name: str,
    arm_token: str,
) -> list[dict]:
    """Fetch all VMs from a single Azure subscription."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{AZURE_MGMT_API}/subscriptions/{subscription_id}/providers/Microsoft.Compute/virtualMachines?api-version=2024-03-01",
                headers={"Authorization": f"Bearer {arm_token}"},
            )
            if resp.status_code != 200:
                logger.error(f"Failed to fetch VMs from subscription {subscription_id}: {resp.status_code}")
                return []

            vms = resp.json().get("value", [])
            results = []
            for vm in vms:
                rg_match = _extract_resource_group(vm.get("id", ""))
                results.append({
                    "vm": vm,
                    "subscription_id": subscription_id,
                    "subscription_name": subscription_name,
                    "resource_group": rg_match,
                })
            return results
    except Exception as e:
        logger.error(f"Error fetching VMs from subscription {subscription_id}: {e}")
        return []


def _extract_resource_group(vm_id: str) -> str:
    """Extract resource group name from Azure VM ID."""
    import re
    match = re.search(r"resourceGroups/([^/]+)", vm_id, re.IGNORECASE)
    return match.group(1) if match else "Unknown"


async def fetch_power_state(
    subscription_id: str,
    resource_group: str,
    vm_name: str,
    arm_token: str,
) -> str:
    """Fetch VM power state from instance view."""
    try:
        url = (
            f"{AZURE_MGMT_API}/subscriptions/{subscription_id}"
            f"/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Compute/virtualMachines/{vm_name}"
            f"/instanceView?api-version=2024-03-01"
        )
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {arm_token}"})

        if resp.status_code != 200:
            logger.info(f"Failed to get instance view for {vm_name}: {resp.status_code}")
            return "unknown"

        data = resp.json()
        statuses = data.get("statuses", [])
        for s in statuses:
            code = s.get("code", "")
            if code.startswith("PowerState/"):
                state = code.split("/")[1]
                logger.info(f"Power state for {vm_name}: {state}")
                return state
        return "unknown"
    except Exception as e:
        logger.error(f"Error fetching power state for {vm_name}: {e}")
        return "unknown"


async def fetch_nic_ip(vm: dict, arm_token: str) -> str | None:
    """Fetch private IP from the VM's first network interface."""
    nics = vm.get("properties", {}).get("networkProfile", {}).get("networkInterfaces", [])
    if not nics:
        return None
    try:
        nic_id = nics[0].get("id", "")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{AZURE_MGMT_API}{nic_id}?api-version=2023-04-01",
                headers={"Authorization": f"Bearer {arm_token}"},
            )
        if resp.status_code != 200:
            return None
        nic_data = resp.json()
        ip_configs = nic_data.get("properties", {}).get("ipConfigurations", [])
        if ip_configs:
            return ip_configs[0].get("properties", {}).get("privateIPAddress")
        return None
    except Exception:
        return None


async def detect_domain_via_graph(
    vm_name: str,
    graph_token: str,
) -> dict:
    """Detect domain status via Microsoft Graph API (works even with VM powered off)."""
    if not graph_token:
        return {"status": "standalone", "domain_name": None}

    try:
        encoded_name = quote(vm_name, safe="")
        url = (
            f"{AZURE_GRAPH_API}/devices"
            f"?$filter=displayName eq '{encoded_name}'"
            f"&$select=id,displayName,trustType,onPremisesSyncEnabled,onPremisesDomainName"
        )

        logger.info(f"{vm_name}: Querying Graph API for device...")

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {graph_token}",
                    "ConsistencyLevel": "eventual",
                },
            )

        if resp.status_code != 200:
            logger.info(f"{vm_name}: Graph API error {resp.status_code}")
            return {"status": "standalone", "domain_name": None}

        data = resp.json()
        devices = data.get("value", [])

        if not devices:
            logger.info(f"{vm_name}: Device not found in Entra ID - assuming standalone")
            return {"status": "standalone", "domain_name": None}

        device = devices[0]
        trust_type = device.get("trustType")
        on_prem_sync = device.get("onPremisesSyncEnabled")
        on_prem_domain = device.get("onPremisesDomainName")

        logger.info(
            f"{vm_name}: Found in Graph API - trustType={trust_type}, "
            f"onPremisesDomainName={on_prem_domain}, syncEnabled={on_prem_sync}"
        )

        if trust_type == "ServerAd" or on_prem_sync is True:
            return {
                "status": "domain_joined",
                "domain_name": on_prem_domain or "Unknown Domain",
            }

        return {"status": "standalone", "domain_name": None}
    except Exception as e:
        logger.error(f"{vm_name}: Graph API error - {e}")
        return {"status": "standalone", "domain_name": None}


async def detect_domain_via_run_command(
    subscription_id: str,
    resource_group: str,
    vm_name: str,
    arm_token: str,
    power_state: str,
) -> dict:
    """Detect domain status via Azure Run Command (LRO polling). Only works on running VMs."""
    if power_state != "running":
        logger.info(f"VM {vm_name} is {power_state}, skipping Run Command domain detection")
        return {"status": "standalone", "domain_name": None}

    try:
        url = (
            f"{AZURE_MGMT_API}/subscriptions/{subscription_id}"
            f"/resourceGroups/{resource_group}"
            f"/providers/Microsoft.Compute/virtualMachines/{vm_name}"
            f"/runCommand?api-version=2024-03-01"
        )

        logger.info(f"Running domain detection command on {vm_name}...")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {arm_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "commandId": "RunPowerShellScript",
                    "script": ["(Get-WmiObject Win32_ComputerSystem).Domain"],
                },
            )

        if resp.status_code not in (200, 202):
            logger.info(f"Run Command returned {resp.status_code} for {vm_name}")
            return {"status": "standalone", "domain_name": None}

        # Get polling URL from headers
        async_url = resp.headers.get("Azure-AsyncOperation") or resp.headers.get("Location")

        if not async_url:
            text = resp.text.strip()
            logger.info(f"Direct response for {vm_name}: \"{text}\"")
            if text and text.lower() != "workgroup":
                return {"status": "domain_joined", "domain_name": text}
            return {"status": "standalone", "domain_name": None}

        logger.info(f"Polling for Run Command result on {vm_name}...")

        # Poll with max 30 seconds (15 attempts x 2s)
        async with httpx.AsyncClient(timeout=15) as client:
            for attempt in range(15):
                await asyncio.sleep(2)

                poll_resp = await client.get(
                    async_url,
                    headers={"Authorization": f"Bearer {arm_token}"},
                )

                if poll_resp.status_code != 200:
                    logger.info(f"Poll failed for {vm_name}: {poll_resp.status_code}")
                    continue

                poll_data = poll_resp.json()
                status = poll_data.get("status", "")
                logger.info(f"Poll attempt {attempt + 1} for {vm_name}: status={status}")

                if status == "Succeeded":
                    output = _extract_run_command_output(poll_data)
                    logger.info(f"Domain result for {vm_name}: \"{output}\"")
                    if not output or output.lower() == "workgroup":
                        return {"status": "standalone", "domain_name": None}
                    return {"status": "domain_joined", "domain_name": output}

                if status == "Failed":
                    logger.info(f"Run Command failed for {vm_name}")
                    return {"status": "standalone", "domain_name": None}

        logger.info(f"Timeout waiting for Run Command on {vm_name}")
        return {"status": "standalone", "domain_name": None}

    except Exception as e:
        logger.error(f"Error detecting domain for {vm_name}: {e}")
        return {"status": "standalone", "domain_name": None}


def _extract_run_command_output(poll_data: dict) -> str:
    """Extract output from Run Command poll result (varies by API version)."""
    props = poll_data.get("properties", {})

    # Try multiple locations
    value = props.get("output", {}).get("value", [])
    if value:
        return value[0].get("message", "").strip()

    instance_output = props.get("instanceView", {}).get("output", "")
    if instance_output:
        return instance_output.strip()

    value2 = poll_data.get("output", {}).get("value", [])
    if value2:
        return value2[0].get("message", "").strip()

    return ""


async def process_single_vm(
    vm_entry: dict,
    arm_token: str,
    graph_token: str,
    zone_id: str | None,
    timestamp: str,
) -> dict:
    """Process a single VM: fetch IP, power state, and domain detection."""
    vm = vm_entry["vm"]
    subscription_id = vm_entry["subscription_id"]
    subscription_name = vm_entry["subscription_name"]
    resource_group = vm_entry["resource_group"]
    vm_name = vm.get("name", "unknown")

    # 1. Fetch IP address
    ip_address = await fetch_nic_ip(vm, arm_token)

    # 2. Fetch Power State
    power_state = await fetch_power_state(subscription_id, resource_group, vm_name, arm_token)

    # 3. Domain detection with priority order:
    #    1) Tags (fastest, manually configured)
    #    2) Microsoft Graph API (works with VM off!)
    #    3) Azure Run Command (fallback, requires VM running)
    domain_status = "standalone"
    domain_name: str | None = None
    tags = vm.get("tags", {}) or {}

    # Priority 1: Check tags
    tag_domain_status = (
        tags.get("domain_status")
        or tags.get("DomainStatus")
        or tags.get("domain-status")
        or ""
    ).lower()

    tag_domain_name = tags.get("domain_name") or tags.get("DomainName")

    if tag_domain_status == "domain_joined":
        domain_status = "domain_joined"
        domain_name = tag_domain_name
        logger.info(f"{vm_name}: Using domain from tag: {domain_name}")
    elif not tag_domain_status:
        # Priority 2: Try Microsoft Graph API
        logger.info(f"{vm_name}: No domain tag, detecting via Graph API...")
        graph_result = await detect_domain_via_graph(vm_name, graph_token)

        if graph_result["status"] == "domain_joined":
            domain_status = graph_result["status"]
            domain_name = graph_result["domain_name"]
            logger.info(f"{vm_name}: Detected via Graph API - domain: {domain_name}")
        elif power_state == "running":
            # Priority 3: Fallback to Run Command
            logger.info(f"{vm_name}: Not in Entra ID, trying Run Command fallback...")
            run_cmd_result = await detect_domain_via_run_command(
                subscription_id, resource_group, vm_name, arm_token, power_state
            )
            domain_status = run_cmd_result["status"]
            domain_name = run_cmd_result["domain_name"]

    properties = vm.get("properties", {})
    return {
        "azure_vm_id": vm.get("id"),
        "name": vm_name,
        "ip_address": ip_address,
        "subscription": subscription_id,
        "subscription_name": subscription_name,
        "resource_group": resource_group,
        "os_type": properties.get("storageProfile", {}).get("osDisk", {}).get("osType", "Unknown"),
        "power_state": power_state,
        "domain_status": domain_status,
        "domain_name": domain_name,
        "location": vm.get("location"),
        "vm_size": properties.get("hardwareProfile", {}).get("vmSize"),
        "last_synced_at": timestamp,
        "zone_id": zone_id,
    }


async def fetch_vm_details_in_batches(
    vms: list[dict],
    arm_token: str,
    graph_token: str,
    zone_id: str | None,
    batch_size: int = 10,
    progress_callback: Any = None,
) -> list[dict]:
    """Process VMs in parallel batches with concurrency control."""
    results: list[dict] = []
    timestamp = datetime.now(timezone.utc).isoformat()

    for i in range(0, len(vms), batch_size):
        batch = vms[i : i + batch_size]

        batch_results = await asyncio.gather(
            *[
                process_single_vm(entry, arm_token, graph_token, zone_id, timestamp)
                for entry in batch
            ]
        )

        results.extend(batch_results)

        processed_count = min(i + batch_size, len(vms))
        logger.info(f"Processed {processed_count}/{len(vms)} VMs")

        if progress_callback:
            await progress_callback(processed_count)

    return results
