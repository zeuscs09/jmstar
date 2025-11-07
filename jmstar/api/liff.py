from __future__ import annotations

from typing import Any, Dict, List, Optional

import frappe  # type: ignore
from frappe import _  # type: ignore
from frappe.utils import cint, get_datetime_str  # type: ignore
from frappe.utils.file_manager import save_file  # type: ignore

from jmstar.jmstar.doctype.star_ledger_entry.star_ledger_entry import (
    STAR_TYPE_ADJUST,
    STAR_TYPE_EARN,
    STAR_TYPE_REDEEM,
    StarLedgerEntry,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_request_data() -> Dict[str, Any]:
    try:
        data = frappe.get_request_data()  # Parses JSON bodies as dict
    except Exception:  # pragma: no cover - fallback for unexpected payloads
        data = frappe.local.form_dict
    return frappe._dict(data)


def _resolve_liff_environment(explicit: Optional[str] = None) -> Optional[str]:
    if explicit:
        return explicit

    conf = getattr(frappe.local, "conf", None) or getattr(frappe, "conf", {})
    for key in ("liff_environment", "environment", "env"):
        value = conf.get(key) if conf else None
        if value:
            return value
    if _is_localhost_request():
        return "mock"
    return None


def _is_localhost_request() -> bool:
    request = getattr(frappe.local, "request", None)
    host = ""
    if request:
        host = getattr(request, "host", "") or request.headers.get("Host", "")

    if not host:
        host = getattr(frappe.local, "site", "")

    if not host:
        return False

    host = host.lower()
    localhost_hosts = {"localhost", "127.0.0.1", "0.0.0.0"}
    if host in localhost_hosts:
        return True

    return host.endswith(".localhost")


def _get_active_liff_config(environment: Optional[str] = None) -> Optional[Dict[str, Any]]:
    filters: Dict[str, Any] = {"is_active": 1}
    if environment:
        filters["environment"] = environment

    configs = frappe.get_all(
        "Liff App Config",
        filters=filters,
        fields=[
            "name",
            "app_name",
            "environment",
            "liff_id",
            "channel_id",
            "channel_secret",
            "callback_url",
            "allowed_paths",
            "description",
        ],
        order_by="modified desc",
        limit=1,
    )

    if configs:
        return frappe._dict(configs[0])

    if environment:
        # Retry without environment filter as a graceful fallback
        return _get_active_liff_config(environment=None)

    return None


def _require(param: Any, label: str) -> Any:
    if param in (None, ""):
        frappe.throw(_("{0} is required.").format(label))
    return param


def _get_or_create_guardian(
    line_uid: str,
    display_name: Optional[str] = None,
    avatar: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    preferred_language: Optional[str] = None,
) -> frappe.model.document.Document:
    guardian_name = frappe.db.get_value("Guardian", {"line_uid": line_uid})
    guardian_doc = (
        frappe.get_doc("Guardian", guardian_name) if guardian_name else None
    )

    if guardian_doc:
        updated_fields: Dict[str, Any] = {}
        if display_name and guardian_doc.display_name != display_name:
            updated_fields["display_name"] = display_name
        if avatar and guardian_doc.avatar != avatar:
            updated_fields["avatar"] = avatar
        if phone and guardian_doc.phone != phone:
            updated_fields["phone"] = phone
        if email and guardian_doc.email != email:
            updated_fields["email"] = email
        if preferred_language and guardian_doc.preferred_language != preferred_language:
            updated_fields["preferred_language"] = preferred_language

        if updated_fields:
            guardian_doc.update(updated_fields)
            guardian_doc.save(ignore_permissions=True)

        return guardian_doc

    guardian_doc = frappe.get_doc(
        {
            "doctype": "Guardian",
            "line_uid": line_uid,
            "display_name": display_name or line_uid,
            "avatar": avatar,
            "phone": phone,
            "email": email,
            "preferred_language": preferred_language,
        }
    )
    guardian_doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return guardian_doc


def _ensure_child_owned_by_guardian(child_id: str, guardian_name: str) -> frappe._dict:
    child = frappe.db.get_value(
        "Child",
        {"name": child_id, "guardian": guardian_name},
        [
            "name",
            "child_name",
            "display_name",
            "nickname",
            "date_of_birth",
            "avatar",
            "available_stars",
            "total_stars",
        ],
        as_dict=True,
    )
    if not child:
        frappe.throw(_("Child not found for this guardian."))
    return child


def _serialize_guardian(doc) -> Dict[str, Any]:
    return {
        "name": doc.name,
        "line_uid": doc.line_uid,
        "display_name": doc.display_name,
        "avatar": doc.avatar,
        "phone": doc.phone,
        "email": doc.email,
        "preferred_language": doc.preferred_language,
    }


def _serialize_child(child: frappe._dict) -> Dict[str, Any]:
    child = frappe._dict(child)
    return {
        "name": child.name,
        "child_name": child.child_name,
        "display_name": child.display_name,
        "nickname": child.nickname,
        "date_of_birth": child.date_of_birth,
        "avatar": child.avatar,
        "available_stars": child.available_stars or 0,
        "total_stars": child.total_stars or 0,
    }


def _list_children(guardian_name: str) -> List[Dict[str, Any]]:
    children = frappe.get_all(
        "Child",
        filters={"guardian": guardian_name},
        fields=[
            "name",
            "child_name",
            "display_name",
            "nickname",
            "date_of_birth",
            "avatar",
            "available_stars",
            "total_stars",
        ],
        order_by="modified desc",
    )
    return [_serialize_child(child) for child in children]


def _list_activities(include_inactive: bool = False) -> List[Dict[str, Any]]:
    filters = {}
    if not include_inactive:
        filters["is_active"] = 1

    activities = frappe.get_all(
        "Star Activity",
        filters=filters,
        fields=[
            "name",
            "activity_name",
            "category",
            "default_star_value",
            "is_active",
            "color",
            "description",
        ],
        order_by="activity_name asc",
    )
    for activity in activities:
        activity.default_star_value = cint(activity.default_star_value or 0)
    return activities


def _serialize_ledger_entry(entry) -> Dict[str, Any]:
    return {
        "name": entry.name,
        "child": entry.child,
        "guardian": entry.guardian,
        "transaction_type": entry.transaction_type,
        "activity": entry.activity,
        "stars": entry.stars,
        "balance_after": entry.balance_after,
        "notes": entry.notes,
        "redemption_use": entry.redemption_use,
        "posting_datetime": get_datetime_str(entry.posting_datetime),
    }


def _hydrate_activity_name(entries: List[Dict[str, Any]]) -> None:
    activity_ids = {entry.get("activity") for entry in entries if entry.get("activity")}
    if not activity_ids:
        return

    lookup = {
        activity.name: activity.activity_name
        for activity in frappe.get_all(
            "Star Activity", filters={"name": ("in", list(activity_ids))}, fields=["name", "activity_name"]
        )
    }
    for entry in entries:
        if entry.get("activity"):
            entry["activity_name"] = lookup.get(entry["activity"])


# ---------------------------------------------------------------------------
# Public API (whitelisted) --------------------------------------------------
# ---------------------------------------------------------------------------


TEST_LINE_UID = "TEST-LINE-UID-001"
TEST_DISPLAY_NAME = "Test Guardian"
AVATAR_MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_config(environment: Optional[str] = None) -> Dict[str, Any]:
    resolved_env = _resolve_liff_environment(environment or frappe.form_dict.get("environment"))
    config = _get_active_liff_config(resolved_env)

    if not config:
        if _is_localhost_request():
            return {
                "app_name": "JMStar Mock",
                "environment": resolved_env or "mock",
                "liff_id": None,
                "channel_id": None,
                "callback_url": None,
                "allowed_paths": [],
                "description": "Local mock configuration",
            }

        frappe.throw(_("ยังไม่มีการตั้งค่า LIFF ที่พร้อมใช้งาน"))

    allowed_paths_raw = config.get("allowed_paths") or ""
    allowed_paths = [
        path.strip()
        for path in allowed_paths_raw.splitlines()
        if path and path.strip()
    ]

    return {
        "app_name": config.get("app_name"),
        "environment": config.get("environment"),
        "liff_id": config.get("liff_id"),
        "channel_id": config.get("channel_id"),
        "callback_url": config.get("callback_url"),
        "allowed_paths": allowed_paths,
        "description": config.get("description"),
    }


@frappe.whitelist(allow_guest=True, methods=["POST", "GET"])
def authenticate() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = data.get("line_uid") or frappe.form_dict.get("line_uid")

    if not line_uid and (data.get("mock") or frappe.form_dict.get("mock")):
        line_uid = TEST_LINE_UID
        data["line_uid"] = line_uid
        data.setdefault("display_name", TEST_DISPLAY_NAME)
        data.setdefault("avatar", None)

    line_uid = _require(line_uid, "line_uid")

    guardian = _get_or_create_guardian(
        line_uid=line_uid,
        display_name=data.get("display_name"),
        avatar=data.get("avatar"),
        phone=data.get("phone"),
        email=data.get("email"),
        preferred_language=data.get("preferred_language"),
    )

    return {
        "guardian": _serialize_guardian(guardian),
        "children": _list_children(guardian.name),
        "activities": _list_activities(),
    }


@frappe.whitelist(allow_guest=True, methods=["GET"])
def children(line_uid: Optional[str] = None) -> Dict[str, Any]:
    line_uid = _require(line_uid or frappe.form_dict.get("line_uid"), "line_uid")
    guardian_name = frappe.db.get_value("Guardian", {"line_uid": line_uid})
    if not guardian_name:
        return {"children": []}

    return {"children": _list_children(guardian_name)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def save_child() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = _require(data.get("line_uid"), "line_uid")
    guardian = _get_or_create_guardian(line_uid)

    child_id = data.get("child_id")
    child_name = data.get("child_name")
    payload = {
        "child_name": child_name,
        "display_name": child_name,
        "date_of_birth": data.get("date_of_birth"),
        "avatar": data.get("avatar"),
    }

    if child_id:
        child_doc = frappe.get_doc("Child", child_id)
        if child_doc.guardian != guardian.name:
            frappe.throw(_("Cannot update child that belongs to another guardian."))

        child_doc.update({k: v for k, v in payload.items() if v is not None})
        child_doc.save(ignore_permissions=True)
    else:
        _require(payload.get("child_name"), "child_name")
        payload.update({"doctype": "Child", "guardian": guardian.name})
        child_doc = frappe.get_doc(payload)
        child_doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return {"child": _serialize_child(child_doc.as_dict())}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def upload_child_avatar() -> Dict[str, Any]:
    line_uid = _require(frappe.form_dict.get("line_uid"), "line_uid")
    guardian = _get_or_create_guardian(line_uid)

    uploaded = frappe.request.files.get("file")  # type: ignore[attr-defined]
    if not uploaded:
        frappe.throw(_("กรุณาเลือกรูปที่ต้องการอัปโหลด"))

    content_type = getattr(uploaded, "content_type", "")
    if content_type and not content_type.startswith("image/"):
        frappe.throw(_("รองรับเฉพาะไฟล์รูปภาพเท่านั้น"))

    file_stream = uploaded.stream.read()
    if not file_stream:
        frappe.throw(_("ไฟล์ว่างเปล่า กรุณาลองใหม่"))

    if len(file_stream) > AVATAR_MAX_FILE_SIZE:
        frappe.throw(_("ขนาดไฟล์ต้องไม่เกิน 4 MB"))

    saved_file = save_file(
        fname=uploaded.filename,
        content=file_stream,
        dt="Guardian",
        dn=guardian.name,
        is_private=0,
    )

    return {"file_url": saved_file.file_url, "file_name": saved_file.file_name}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def save_activity() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = _require(data.get("line_uid"), "line_uid")
    _get_or_create_guardian(line_uid)

    activity_id = data.get("activity_id")
    payload = {
        "activity_name": data.get("activity_name"),
        "category": data.get("category"),
        "default_star_value": cint(data.get("default_star_value", 0)),
        "is_active": cint(data.get("is_active", 1)),
        "description": data.get("description"),
        "color": data.get("color"),
    }

    if activity_id:
        activity_doc = frappe.get_doc("Star Activity", activity_id)
        activity_doc.update({k: v for k, v in payload.items() if v is not None})
        activity_doc.save(ignore_permissions=True)
    else:
        _require(payload.get("activity_name"), "activity_name")
        payload.update({"doctype": "Star Activity"})
        activity_doc = frappe.get_doc(payload)
        activity_doc.insert(ignore_permissions=True)

    frappe.db.commit()
    activity = frappe._dict(activity_doc.as_dict())
    activity.default_star_value = cint(activity.default_star_value or 0)
    return {"activity": activity}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def activities(include_inactive: int | None = None) -> Dict[str, Any]:
    include_flag = bool(int(include_inactive)) if include_inactive is not None else False
    return {"activities": _list_activities(include_flag)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def add_stars() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = _require(data.get("line_uid"), "line_uid")
    child_id = _require(data.get("child"), "child")

    guardian = _get_or_create_guardian(line_uid)
    child = _ensure_child_owned_by_guardian(child_id, guardian.name)

    activity_id = data.get("activity")
    stars = data.get("stars")
    if not stars and activity_id:
        stars = frappe.db.get_value("Star Activity", activity_id, "default_star_value")
    stars = _require(stars, "stars")

    entry = StarLedgerEntry.create_entry(
        child=child.name,
        guardian=guardian.name,
        transaction_type=STAR_TYPE_EARN,
        activity=activity_id,
        stars=int(stars),
        notes=data.get("notes"),
    )

    return {
        "entry": _serialize_ledger_entry(entry),
        "available_stars": entry.balance_after,
    }


@frappe.whitelist(allow_guest=True, methods=["POST"])
def redeem_stars() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = _require(data.get("line_uid"), "line_uid")
    child_id = _require(data.get("child"), "child")
    stars = int(_require(data.get("stars"), "stars"))

    guardian = _get_or_create_guardian(line_uid)
    child = _ensure_child_owned_by_guardian(child_id, guardian.name)

    entry = StarLedgerEntry.create_entry(
        child=child.name,
        guardian=guardian.name,
        transaction_type=STAR_TYPE_REDEEM,
        stars=stars,
        notes=data.get("notes"),
        redemption_use=data.get("redemption_use"),
    )

    return {
        "entry": _serialize_ledger_entry(entry),
        "available_stars": entry.balance_after,
    }


@frappe.whitelist(allow_guest=True, methods=["GET"])
def history(child: Optional[str] = None, line_uid: Optional[str] = None, limit: int = 30) -> Dict[str, Any]:
    line_uid = _require(line_uid or frappe.form_dict.get("line_uid"), "line_uid")
    child_id = _require(child or frappe.form_dict.get("child"), "child")
    limit = int(limit or 30)

    guardian_name = frappe.db.get_value("Guardian", {"line_uid": line_uid})
    if not guardian_name:
        frappe.throw(_("Guardian not found."))

    _ensure_child_owned_by_guardian(child_id, guardian_name)

    entries = frappe.get_all(
        "Star Ledger Entry",
        filters={"child": child_id, "guardian": guardian_name},
        fields=[
            "name",
            "posting_datetime",
            "transaction_type",
            "activity",
            "stars",
            "balance_after",
            "notes",
            "redemption_use",
        ],
        order_by="posting_datetime desc",
        limit=limit,
    )

    for entry in entries:
        entry.posting_datetime = get_datetime_str(entry.posting_datetime)

    _hydrate_activity_name(entries)

    return {"entries": entries}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def adjust_stars() -> Dict[str, Any]:
    data = _get_request_data()
    line_uid = _require(data.get("line_uid"), "line_uid")
    child_id = _require(data.get("child"), "child")
    stars = int(_require(data.get("stars"), "stars"))

    guardian = _get_or_create_guardian(line_uid)
    child = _ensure_child_owned_by_guardian(child_id, guardian.name)

    entry = StarLedgerEntry.create_entry(
        child=child.name,
        guardian=guardian.name,
        transaction_type=STAR_TYPE_ADJUST,
        stars=stars,
        notes=data.get("notes"),
    )

    return {
        "entry": _serialize_ledger_entry(entry),
        "available_stars": entry.balance_after,
    }

