"""
Azure DevOps Service — creates work items via REST API.
Each zone has its own org URL, PAT token, and project.
"""

import base64
import json
import logging
from datetime import date, timedelta

import httpx

logger = logging.getLogger(__name__)


class DevOpsWorkItem:
    def __init__(self, work_item_id: int, url: str, html_url: str):
        self.work_item_id = work_item_id
        self.url = url
        self.html_url = html_url


class DevOpsResult:
    def __init__(self, success: bool, work_item: DevOpsWorkItem | None = None, error: str | None = None):
        self.success = success
        self.work_item = work_item
        self.error = error


async def create_work_item(
    org_url: str,
    pat_token: str,
    project: str,
    work_item_type: str,
    title: str,
    description: str,
    assigned_to: str | None = None,
    area_path: str | None = None,
    iteration_path: str | None = None,
    due_date: date | None = None,
    parent_id: int | None = None,
    tags: str | None = None,
    custom_fields: dict | None = None,
) -> DevOpsResult:
    """
    Create a work item in Azure DevOps.

    Args:
        org_url: Organization URL (e.g., https://dev.azure.com/ambevtech)
        pat_token: Personal Access Token
        project: Project name
        work_item_type: Type (Task, Bug, User Story)
        title: Work item title
        description: HTML description body
        assigned_to: Email of assignee
        area_path: Area path
        iteration_path: Iteration path
        due_date: Due date
        parent_id: Parent work item ID (for Epic/Feature linking)
        tags: Semicolon-separated tags
        custom_fields: Additional fields as {field_ref: value}
    """
    auth = base64.b64encode(f":{pat_token}".encode()).decode()
    base = org_url.rstrip("/")
    url = f"{base}/{project}/_apis/wit/workitems/${work_item_type}?api-version=7.1"

    # Build patch document
    operations = [
        {"op": "add", "path": "/fields/System.Title", "value": title},
        {"op": "add", "path": "/fields/System.Description", "value": description},
    ]

    if assigned_to:
        operations.append({"op": "add", "path": "/fields/System.AssignedTo", "value": assigned_to})

    if area_path:
        operations.append({"op": "add", "path": "/fields/System.AreaPath", "value": area_path})

    if iteration_path:
        operations.append({"op": "add", "path": "/fields/System.IterationPath", "value": iteration_path})

    if due_date:
        operations.append({"op": "add", "path": "/fields/Microsoft.VSTS.Scheduling.DueDate", "value": due_date.isoformat()})

    if tags:
        operations.append({"op": "add", "path": "/fields/System.Tags", "value": tags})

    if custom_fields:
        for field_ref, value in custom_fields.items():
            operations.append({"op": "add", "path": f"/fields/{field_ref}", "value": value})

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.patch(
                url,
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/json-patch+json",
                },
                content=json.dumps(operations),
            )

            if resp.status_code in (200, 201):
                data = resp.json()
                wi_id = data["id"]
                wi_url = data.get("url", "")
                html_url = data.get("_links", {}).get("html", {}).get("href", "")

                if not html_url:
                    html_url = f"{base}/{project}/_workitems/edit/{wi_id}"

                logger.info(f"[DevOps] Created work item #{wi_id}: {title}")

                # Link to parent (Epic/Feature) if specified
                if parent_id:
                    await _add_parent_link(client, base, project, auth, wi_id, parent_id)

                return DevOpsResult(
                    success=True,
                    work_item=DevOpsWorkItem(wi_id, wi_url, html_url),
                )

            logger.error(f"[DevOps] Failed to create work item: {resp.status_code} {resp.text[:500]}")
            return DevOpsResult(success=False, error=f"DevOps API returned {resp.status_code}: {resp.text[:300]}")

    except Exception as e:
        logger.error(f"[DevOps] Exception creating work item: {e}")
        return DevOpsResult(success=False, error=str(e))


async def _add_parent_link(
    client: httpx.AsyncClient,
    base: str,
    project: str,
    auth: str,
    child_id: int,
    parent_id: int,
) -> None:
    """Add a parent link between work items."""
    url = f"{base}/{project}/_apis/wit/workitems/{child_id}?api-version=7.1"
    operations = [
        {
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "System.LinkTypes.Hierarchy-Reverse",
                "url": f"{base}/{project}/_apis/wit/workitems/{parent_id}",
            },
        }
    ]
    try:
        resp = await client.patch(
            url,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json-patch+json",
            },
            content=json.dumps(operations),
        )
        if resp.status_code in (200, 201):
            logger.info(f"[DevOps] Linked work item #{child_id} to parent #{parent_id}")
        else:
            logger.warning(f"[DevOps] Failed to link parent: {resp.status_code}")
    except Exception as e:
        logger.warning(f"[DevOps] Exception linking parent: {e}")
