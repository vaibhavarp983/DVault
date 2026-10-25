import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

WORKSPACE = "/api/v1/workspaces/default"


def _as_utc(value: str | datetime) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _seed(client) -> tuple[str, str, str]:
    source_id = next(source["id"] for source in client.get(f"{WORKSPACE}/sources").json() if source["source_key"] == "crm")
    imported = client.post(
        f"{WORKSPACE}/sources/{source_id}/imports",
        files={"file": ("breach.csv", b"customer_name,email,mobile\nAarav Breach,aarav.breach@example.test,9000010401\n", "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    record = client.get(f"{WORKSPACE}/records", params={"import_id": imported.json()["id"]}).json()["items"][0]
    return source_id, record["subject_ref"], record["id"]


def _create(client, **overrides) -> dict:
    payload = {
        "title": "Synthetic wrong-group message",
        "description": "A synthetic campaign message reached the wrong recipient group.",
        "origin": "MANUAL",
        "severity": "HIGH",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "containment_summary": "Message removed from the mock outbox; group owner notified.",
        "created_by_reference": "synthetic operator",
    }
    payload.update(overrides)
    response = client.post(f"{WORKSPACE}/breaches", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_manual_breach_registration_timer_and_affected_lookup(client) -> None:
    source_id, subject_ref, _ = _seed(client)
    detected = datetime.now(timezone.utc) - timedelta(hours=2)
    breach = _create(client, detected_at=detected.isoformat(), subject_refs=[subject_ref], source_ids=[source_id])

    assert re.fullmatch(r"BR-\d{4}-\d{4}", breach["incident_ref"])
    assert abs((_as_utc(breach["assessment_due_at"]) - detected).total_seconds() - 72 * 3600) < 5
    assert breach["timer_state"] == "ON_TRACK"
    assert breach["assessment_status"] == "PENDING"
    assert breach["scope_status"] == "KNOWN"
    assert breach["status"] == "DRAFT"
    assert breach["affected_subject_total"] == 1
    assert breach["affected_source_total"] == 1

    affected = client.get(f"{WORKSPACE}/breaches/{breach['id']}/affected").json()
    assert affected["scope_status"] == "KNOWN"
    assert affected["subjects"][0]["subject_ref"] == subject_ref
    assert affected["subjects"][0]["resolution_status"] == "RESOLVED"
    assert affected["subjects"][0]["record_count"] == 1
    assert affected["subjects"][0]["sources"] == ["crm"]
    assert affected["sources"][0]["source_key"] == "crm"
    assert affected["sources"][0]["affected_record_count"] == 1
    assert affected["sources"][0]["affected_subject_count"] == 1

    assert client.get(f"{WORKSPACE}/breaches", params={"subject_ref": subject_ref}).json()["total"] == 1
    assert client.get(f"{WORKSPACE}/breaches", params={"source_id": source_id}).json()["total"] == 1
    assert client.get(f"{WORKSPACE}/breaches", params={"status": "DRAFT"}).json()["total"] == 1
    assert client.get(f"{WORKSPACE}/breaches", params={"overdue": "true"}).json()["total"] == 0

    unknown = _create(client, title="Manual report with an uninventoried subject", subject_refs=["subref_not_in_inventory"])
    unknown_affected = client.get(f"{WORKSPACE}/breaches/{unknown['id']}/affected").json()
    assert unknown_affected["subjects"][0]["resolution_status"] == "UNRESOLVED"
    assert unknown_affected["subjects"][0]["record_count"] == 0


def test_timer_states_and_overdue_assessment(client) -> None:
    _, subject_ref, _ = _seed(client)
    due_soon = _create(client, subject_refs=[subject_ref], detected_at=(datetime.now(timezone.utc) - timedelta(hours=60)).isoformat())
    overdue = _create(client, subject_refs=[subject_ref], detected_at=(datetime.now(timezone.utc) - timedelta(hours=100)).isoformat())
    assert due_soon["timer_state"] == "DUE_SOON"
    assert overdue["timer_state"] == "OVERDUE"

    overdue_list = client.get(f"{WORKSPACE}/breaches", params={"overdue": "true"}).json()
    assert overdue_list["total"] == 1
    assert overdue_list["items"][0]["id"] == overdue["id"]

    assessed = client.post(f"{WORKSPACE}/breaches/{overdue['id']}/assessment", json={
        "notifiable": True,
        "reason_code": "UNAUTHORIZED_DISCLOSURE",
        "note": "Assessment completed during the synthetic demo.",
    })
    assert assessed.status_code == 200, assessed.text
    body = assessed.json()
    assert body["status"] == "ASSESSED"
    assert body["assessment_status"] == "ASSESSED"
    assert body["assessment_timeliness"] == "COMPLETE_OVERDUE"
    assert body["timer_state"] == "COMPLETE"
    assert body["notifiable"] is True
    assert client.get(f"{WORKSPACE}/breaches", params={"overdue": "true"}).json()["total"] == 0


def test_assessment_notification_draft_and_close(client) -> None:
    _, subject_ref, _ = _seed(client)
    breach = _create(client, subject_refs=[subject_ref])

    premature = client.post(f"{WORKSPACE}/breaches/{breach['id']}/notification-draft")
    assert premature.status_code == 409
    assert premature.json()["error"]["code"] == "BREACH_ASSESSMENT_REQUIRED"

    assessed = client.post(f"{WORKSPACE}/breaches/{breach['id']}/assessment", json={
        "notifiable": True, "reason_code": "UNAUTHORIZED_DISCLOSURE",
    })
    assert assessed.status_code == 200, assessed.text

    draft = client.post(f"{WORKSPACE}/breaches/{breach['id']}/notification-draft")
    assert draft.status_code == 200, draft.text
    body = draft.json()
    assert body["status"] == "NOTIFICATION_DRAFTED"
    assert body["notification_status"] == "DRAFTED"
    assert body["notification"]["status"] == "DRAFT"
    assert body["notification"]["body"].startswith("DRAFT — NOT SENT")
    assert breach["incident_ref"] in body["notification"]["body"]
    assert "@" not in body["notification"]["body"]
    assert "does not send" in body["notification"]["disclaimer"]

    short = client.post(f"{WORKSPACE}/breaches/{breach['id']}/close", json={"note": "short"})
    assert short.status_code == 422
    assert short.json()["error"]["code"] == "VALIDATION_ERROR"

    closed = client.post(f"{WORKSPACE}/breaches/{breach['id']}/close", json={
        "note": "Containment complete and the draft was reviewed by the demo operator.",
    })
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "CLOSED"
    assert closed.json()["close_note"].startswith("Containment complete")
    assert closed.json()["timer_state"] == "COMPLETE"

    again = client.post(f"{WORKSPACE}/breaches/{breach['id']}/close", json={"note": "Closing a second time is rejected."})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "BREACH_ALREADY_CLOSED"
    redraft = client.post(f"{WORKSPACE}/breaches/{breach['id']}/notification-draft")
    assert redraft.status_code == 409
    assert redraft.json()["error"]["code"] == "BREACH_ALREADY_CLOSED"

    dashboard = client.get(f"{WORKSPACE}/dashboard").json()
    assert dashboard["open_breach_incident_total"] == 0
    assert dashboard["breach_notification_draft_total"] == 0


def test_integrity_failure_creates_one_linked_breach(client, db_session) -> None:
    _seed(client)
    workspace_id = client.get(WORKSPACE).json()["id"]
    db_session.execute(text("UPDATE audit_events SET canonical_payload = :payload WHERE workspace_id = :workspace_id AND sequence = 2"), {
        "payload": '{"tampered":true}', "workspace_id": workspace_id,
    })
    db_session.commit()

    verified = client.post(f"{WORKSPACE}/audit/verify", json={}).json()
    assert verified["status"] == "FAILED"

    breaches = client.get(f"{WORKSPACE}/breaches", params={"origin": "AUDIT_INTEGRITY"}).json()
    assert breaches["total"] == 1
    breach = breaches["items"][0]
    assert breach["scope_status"] == "UNDETERMINED"
    assert breach["linked_integrity_incident_id"] is not None
    assert breach["severity"] == "HIGH"

    incidents = client.get(f"{WORKSPACE}/audit/integrity-incidents").json()
    assert incidents[0]["linked_breach_incident_id"] == breach["id"]
    affected = client.get(f"{WORKSPACE}/breaches/{breach['id']}/affected").json()
    assert affected["scope_status"] == "UNDETERMINED"

    client.post(f"{WORKSPACE}/audit/verify", json={})
    assert client.get(f"{WORKSPACE}/breaches", params={"origin": "AUDIT_INTEGRITY"}).json()["total"] == 1

    status = client.get(f"{WORKSPACE}/audit/status").json()
    assert status["breaches"]["open"] == 1
    assert status["breaches"]["assessment_overdue"] == 0


def test_breach_validation_errors(client) -> None:
    _seed(client)
    invalid_origin = client.post(f"{WORKSPACE}/breaches", json={
        "title": "Invalid origin", "description": "Checks origin validation.", "origin": "ALIEN",
    })
    assert invalid_origin.status_code == 422
    assert invalid_origin.json()["error"]["code"] == "BREACH_ORIGIN_INVALID"

    invalid_severity = client.post(f"{WORKSPACE}/breaches", json={
        "title": "Invalid severity", "description": "Checks severity validation.", "severity": "EXTREME",
    })
    assert invalid_severity.status_code == 422
    assert invalid_severity.json()["error"]["code"] == "BREACH_SEVERITY_INVALID"

    unknown_source = client.post(f"{WORKSPACE}/breaches", json={
        "title": "Unknown source", "description": "Checks source validation.", "source_ids": ["not-a-source"],
    })
    assert unknown_source.status_code == 422
    assert unknown_source.json()["error"]["code"] == "BREACH_SOURCE_UNKNOWN"

    too_short = client.post(f"{WORKSPACE}/breaches", json={"title": "x", "description": "Checks field validation."})
    assert too_short.status_code == 422
    assert too_short.json()["error"]["code"] == "VALIDATION_ERROR"
