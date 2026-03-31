"""
Password Failures Service - CSV parsing and helpers.
Port of supabase/functions/import-password-failures/index.ts
"""

import csv
import io
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def parse_csv_line(line: str) -> list[str]:
    """Parse CSV line handling quoted fields with commas."""
    reader = csv.reader(io.StringIO(line))
    for row in reader:
        return [c.strip() for c in row]
    return []


def resolve_zone_id(workgroup_name: str, zones: list[dict]) -> str | None:
    """Resolve zone_id from workgroup name prefix."""
    if not workgroup_name:
        return None
    upper_name = workgroup_name.upper()
    sorted_zones = sorted(zones, key=lambda z: len(z["code"]), reverse=True)
    for zone in sorted_zones:
        if upper_name.startswith(zone["code"].upper()):
            return zone["id"]
    if upper_name == "DEFAULT WORKGROUP":
        ghq = next((z for z in zones if z["code"].upper() == "GHQ"), None)
        if ghq:
            return ghq["id"]
    return None


def parse_date(date_str: str | None) -> str | None:
    """Parse date from various formats to ISO string."""
    if not date_str or not date_str.strip():
        return None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.isoformat()
    except (ValueError, TypeError):
        pass
    try:
        parts = date_str.split("/")
        if len(parts) == 3:
            month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
            return datetime(year, month, day).isoformat()
    except (ValueError, IndexError):
        pass
    return None


def parse_failure_reason(result: str | None) -> str:
    """Parse failure reason from result string."""
    if not result:
        return "Unknown error"
    lowered = result.lower()
    if "access denied" in lowered or "permission" in lowered:
        return "Access Denied"
    if "timeout" in lowered or "timed out" in lowered:
        return "Connection Timeout"
    if "password" in lowered and "policy" in lowered:
        return "Password Policy Violation"
    if "connection" in lowered or "network" in lowered:
        return "Connection Error"
    if "authentication" in lowered or "auth" in lowered:
        return "Authentication Failed"
    if "not found" in lowered:
        return "Account Not Found"
    if len(result) > 50:
        return result[:50] + "..."
    return result


def parse_csv_records(
    csv_text: str,
    zones: list[dict],
    job_id: str,
    batch_date: str,
) -> tuple[list[dict], dict]:
    """Parse CSV text and return (records, stats)."""
    lines = csv_text.splitlines()
    stats = {
        "totalLines": 0,
        "filtered": 0,
        "inserted": 0,
        "updated": 0,
        "deleted": 0,
        "skipped": 0,
        "byWorkgroup": {},
    }

    if len(lines) < 2:
        return [], stats

    headers = parse_csv_line(lines[0])
    header_lower = [h.lower() for h in headers]

    col_index = {
        "accountName": header_lower.index("accountname") if "accountname" in header_lower else -1,
        "domainName": header_lower.index("domainname") if "domainname" in header_lower else -1,
        "autoManagement": header_lower.index("automanagementflag") if "automanagementflag" in header_lower else -1,
        "lastChangeDate": header_lower.index("lastchangedate") if "lastchangedate" in header_lower else -1,
        "assetName": header_lower.index("assetname") if "assetname" in header_lower else -1,
        "platformName": header_lower.index("platformname") if "platformname" in header_lower else -1,
        "result": header_lower.index("result") if "result" in header_lower else -1,
        "workgroupName": header_lower.index("workgroupname") if "workgroupname" in header_lower else -1,
    }

    required = ["accountName", "result", "autoManagement", "workgroupName"]
    missing = [c for c in required if col_index.get(c, -1) == -1]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    records = []

    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        stats["totalLines"] += 1
        cols = parse_csv_line(line)

        auto_managed = (cols[col_index["autoManagement"]] or "").lower() == "true"
        result_val = (cols[col_index["result"]] or "").upper()

        record_type = None
        if auto_managed and result_val == "F":
            record_type = "failure"
        elif not auto_managed:
            record_type = "automanage_disabled"

        if not record_type:
            stats["skipped"] += 1
            continue

        account_name = (cols[col_index["accountName"]] or "").strip()
        if not account_name:
            stats["skipped"] += 1
            continue

        asset_name = (cols[col_index["assetName"]] or "").strip() if col_index["assetName"] >= 0 else ""
        workgroup_name = (cols[col_index["workgroupName"]] or "").strip() or "Unknown"

        stats["filtered"] += 1
        stats["byWorkgroup"][workgroup_name] = stats["byWorkgroup"].get(workgroup_name, 0) + 1

        domain_val = (cols[col_index["domainName"]] or "").strip() if col_index["domainName"] >= 0 else None
        platform_val = (cols[col_index["platformName"]] or "").strip() if col_index["platformName"] >= 0 else None
        last_change = parse_date(cols[col_index["lastChangeDate"]]) if col_index["lastChangeDate"] >= 0 else None

        records.append({
            "account_name": account_name,
            "domain_name": domain_val or None,
            "system_name": asset_name or "",
            "platform_name": platform_val or None,
            "workgroup_name": workgroup_name,
            "zone_id": resolve_zone_id(workgroup_name, zones),
            "last_change_attempt": last_change,
            "failure_reason": "Password Change Failed" if record_type == "failure" else "Automanage Disabled",
            "import_source": "csv",
            "import_batch_date": batch_date,
            "synced_at": batch_date,
            "record_type": record_type,
            "last_import_job_id": job_id,
        })

    return records, stats
