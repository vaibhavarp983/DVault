"""Deterministic, safe previews for synthetic invoices, orders, threads, consent records, and tables."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from app.privacy import mask_value

SYNTHETIC_HEADER = "SYNTHETIC DEMO DATA ONLY"
BUSINESS_NAME = "Aranya Coaching Centre"

KIND_BY_DOCUMENT_TYPE = {
    "crm_export": "table",
    "spreadsheet": "table",
    "message_export": "conversation",
    "invoice": "invoice",
    "purchase_order": "purchase-order",
    "enquiry_form": "form",
    "consent_record": "consent-record",
    "rights_request": "rights-request",
    "email": "email-thread",
    "internal_note": "note",
    "operational_report": "report",
}

CONVERSATION_RE = re.compile(r"^(\d{1,2}:\d{2})\s*[—–-]\s*([^:]+):\s*(.*)$")
ITEM_RE = re.compile(r"^Item:\s*(.*?)(?:\s*\|\s*Qty:\s*(.*?))?(?:\s*\|\s*Unit price:\s*(.*?))?(?:\s*\|\s*Amount:\s*(.*?))?$", re.IGNORECASE)


def preview_kind(document_type: str) -> str:
    return KIND_BY_DOCUMENT_TYPE.get(document_type, "note")


def _lines(text: str | None) -> list[str]:
    if not text:
        return []
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and (not lines[0].strip() or lines[0].strip().upper().startswith(SYNTHETIC_HEADER)):
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def _split_key(line: str) -> tuple[str, str] | None:
    if ":" not in line:
        return None
    key, value = line.split(":", 1)
    key, value = key.strip(), value.strip()
    return (key, value) if key and value else None


def _decimal(value: str | None) -> float | None:
    if value is None or not str(value).strip():
        return None
    try:
        return float(Decimal(str(value).replace(",", "").strip()))
    except (InvalidOperation, ValueError):
        return None


def _field(label: str, value: str, classification: str = "operational") -> dict[str, Any]:
    return {"label": label, "value": value, "classification": classification}


def _invoice_or_order(lines: list[str], kind: str) -> dict[str, Any]:
    fields: list[dict[str, Any]] = []
    line_items: list[dict[str, Any]] = []
    totals: dict[str, float] = {}
    reference = None
    status = None
    for line in lines:
        item = ITEM_RE.match(line)
        if item:
            description = item.group(1).strip()
            line_items.append({
                "description": description,
                "quantity": _decimal(item.group(2)) or 1.0,
                "unit_price": _decimal(item.group(3)),
                "amount": _decimal(item.group(4)),
            })
            continue
        pair = _split_key(line)
        if pair is None:
            continue
        key, value = pair
        lowered = key.lower()
        if lowered in {"invoice", "purchase order"}:
            reference = value
            continue
        if lowered == "status":
            status = value
        if lowered in {"subtotal", "tax", "total"}:
            amount = _decimal(value)
            if amount is not None:
                totals[lowered] = amount
            fields.append(_field(key, value, "financial"))
            continue
        classification = "identity" if lowered in {"bill to", "supplier", "customer"} else "financial" if "date" in lowered else "operational"
        fields.append(_field(key, value, classification))
    return {
        "kind": kind,
        "reference": reference,
        "status": status,
        "fields": fields,
        "line_items": line_items,
        "totals": totals,
    }


def _email_thread(lines: list[str]) -> dict[str, Any]:
    blocks: list[list[str]] = [[]]
    for line in lines:
        if line.strip() == "---":
            blocks.append([])
        else:
            blocks[-1].append(line)
    messages: list[dict[str, Any]] = []
    top_subject = None
    for block in blocks:
        headers: dict[str, str] = {}
        body_lines: list[str] = []
        for line in block:
            pair = _split_key(line)
            if pair and not body_lines:
                headers[pair[0].lower()] = pair[1]
            else:
                body_lines.append(line)
        if not headers and not body_lines:
            continue
        top_subject = top_subject or headers.get("subject")
        messages.append({
            "from": headers.get("from", ""),
            "to": headers.get("to", ""),
            "cc": headers.get("cc", ""),
            "subject": headers.get("subject", top_subject or ""),
            "sent_at": headers.get("date", ""),
            "direction": headers.get("direction", "inbound" if len(messages) == 0 else "outbound"),
            "body": "\n".join(body_lines).strip(),
        })
    return {
        "kind": "email-thread",
        "reference": top_subject,
        "fields": [_field("Subject", top_subject or "", "communication")],
        "messages": messages,
    }


def _conversation(lines: list[str]) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    for line in lines:
        match = CONVERSATION_RE.match(line)
        if not match:
            continue
        sender = match.group(2).strip()
        messages.append({
            "sent_at": match.group(1),
            "sender": sender,
            "direction": "outbound" if BUSINESS_NAME.lower() in sender.lower() or "aranya" in sender.lower() else "inbound",
            "body": match.group(3).strip(),
        })
    return {"kind": "conversation", "reference": None, "messages": messages, "fields": []}


def _consent(lines: list[str]) -> dict[str, Any]:
    fields: list[dict[str, Any]] = []
    consent: dict[str, Any] = {}
    for line in lines:
        pair = _split_key(line)
        if pair is None:
            continue
        key, value = pair
        fields.append(_field(key, value, "consent"))
        lowered = key.lower()
        if lowered == "purpose":
            consent["purpose"] = value
        elif lowered == "channel":
            consent["channel"] = value
        elif lowered == "status":
            consent["status"] = value
        elif lowered == "notice version":
            consent["notice_version"] = value
        elif lowered == "captured at":
            consent["captured_at"] = value
        elif lowered == "expires at":
            consent["expires_at"] = value
        elif lowered == "evidence ref":
            consent["evidence_ref"] = value
        elif lowered == "subject reference":
            consent["subject_reference"] = value
    consent["granted"] = str(consent.get("status", "")).lower() in {"active", "granted", "yes"}
    return {"kind": "consent-record", "reference": next((field["value"] for field in fields if field["label"].lower() == "authorization record"), None), "consent": consent, "fields": fields}


def _form_or_note(lines: list[str], kind: str) -> dict[str, Any]:
    fields: list[dict[str, Any]] = []
    body: list[str] = []
    for line in lines:
        pair = _split_key(line)
        if pair:
            fields.append(_field(pair[0], pair[1], "identity" if pair[0].lower() in {"applicant", "email", "mobile"} else "operational"))
        elif line.strip():
            body.append(line.strip())
    return {"kind": kind, "fields": fields, "body": "\n".join(body)}


def _mask_row_value(value: Any, classification: str) -> str:
    if value is None:
        return ""
    text = str(value)
    if classification in {"DIRECT_IDENTIFIER", "PERSON_NAME", "ADDRESS", "DATE_OF_BIRTH", "COMMUNICATION_CONTENT"}:
        return mask_value(text, classification)
    return text


def _table(rows: list[dict[str, Any]], columns: list[dict[str, Any]], *, synthetic_contacts: bool, limit: int = 12) -> dict[str, Any]:
    mapped: list[dict[str, str]] = []
    for row in rows[:limit]:
        mapped.append({
            column["key"]: (str(row.get(column["label"], "")) if synthetic_contacts else _mask_row_value(row.get(column["label"]), column["classification"]))
            for column in columns
        })
    return {
        "kind": "table",
        "reference": None,
        "columns": columns,
        "rows": mapped,
        "row_count": len(rows),
        "truncated": len(rows) > limit,
        "fields": [],
    }


def build_preview(
    document_type: str,
    *,
    text: str | None,
    rows: list[dict[str, Any]] | None,
    columns: list[dict[str, Any]] | None,
    synthetic_contacts: bool,
) -> dict[str, Any]:
    kind = preview_kind(document_type)
    if kind == "table":
        return _table(rows or [], columns or [], synthetic_contacts=synthetic_contacts)
    lines = _lines(text)
    if kind in {"invoice", "purchase-order"}:
        preview = _invoice_or_order(lines, kind)
    elif kind == "email-thread":
        preview = _email_thread(lines)
    elif kind == "conversation":
        preview = _conversation(lines)
    elif kind == "consent-record":
        preview = _consent(lines)
    elif kind == "form":
        preview = _form_or_note(lines, "form")
    elif kind == "rights-request":
        preview = _form_or_note(lines, "rights-request")
    elif kind == "report":
        preview = _form_or_note(lines, "report")
    else:
        preview = _form_or_note(lines, "note")
    preview.setdefault("fields", [])
    preview.setdefault("line_items", [])
    preview.setdefault("messages", [])
    preview.setdefault("columns", [])
    preview.setdefault("rows", [])
    preview.setdefault("row_count", 0)
    preview.setdefault("truncated", False)
    preview["synthetic_contacts"] = synthetic_contacts
    return preview
