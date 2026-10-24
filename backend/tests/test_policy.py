from datetime import datetime, timedelta, timezone


def _source_id(client, source_key: str) -> str:
    return next(source["id"] for source in client.get("/api/v1/workspaces/default/sources").json() if source["source_key"] == source_key)


def _record(client) -> dict:
    source = _source_id(client, "crm")
    payload = b"customer_name,email,mobile,purpose\nAarav Demo,aarav.policy@example.test,9000010101,marketing\n"
    imported = client.post(f"/api/v1/workspaces/default/sources/{source}/imports", files={"file": ("policy_contacts.csv", payload, "text/csv")})
    assert imported.status_code == 201
    records = client.get("/api/v1/workspaces/default/records", params={"import_id": imported.json()["id"]}).json()["items"]
    return records[0]


def _authorize(client, subject_ref: str, purpose: str = "marketing", channel: str = "whatsapp") -> dict:
    payload = {
        "subject_ref": subject_ref,
        "purpose": purpose,
        "channel": channel,
        "evidence_source": "synthetic consent record",
        "notice_version": "demo-v1",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
    }
    response = client.post("/api/v1/workspaces/default/authorizations", json=payload)
    assert response.status_code == 201
    return response.json()


def test_policy_allow_deny_and_review(client) -> None:
    record = _record(client)
    review = client.post("/api/v1/workspaces/default/policy-decisions/evaluate", json={"subject_ref": record["subject_ref"], "purpose": "marketing", "channel": "whatsapp"})
    assert review.status_code == 200
    assert review.json()["decision"] == "REVIEW"
    assert review.json()["reason_codes"] == ["AUTHORIZATION_EVIDENCE_MISSING"]

    _authorize(client, record["subject_ref"])
    allow = client.post("/api/v1/workspaces/default/policy-decisions/evaluate", json={"subject_ref": record["subject_ref"], "purpose": "marketing", "channel": "whatsapp"})
    assert allow.json()["decision"] == "ALLOW"
    assert allow.json()["policy_version"] == 1

    wrong_purpose = client.post("/api/v1/workspaces/default/policy-decisions/evaluate", json={"subject_ref": record["subject_ref"], "purpose": "course_updates", "channel": "whatsapp"})
    assert wrong_purpose.json()["decision"] == "DENY"
    assert wrong_purpose.json()["reason_codes"] == ["PURPOSE_NOT_AUTHORIZED"]


def test_campaign_execution_rechecks_withdrawal_and_never_writes_denied_outbox(client) -> None:
    record = _record(client)
    authorization = _authorize(client, record["subject_ref"])
    campaign = client.post("/api/v1/workspaces/default/campaigns", json={
        "name": "October course update", "purpose": "marketing", "channel": "whatsapp", "message_template_id": "course-update-v1", "record_ids": [record["id"]],
    })
    assert campaign.status_code == 201
    campaign_id = campaign.json()["id"]
    preview = client.post(f"/api/v1/workspaces/default/campaigns/{campaign_id}/preview")
    assert preview.status_code == 200
    assert preview.json()["decision_summary"] == {"ALLOW": 1}

    withdrawn = client.post(f"/api/v1/workspaces/default/authorizations/{authorization['id']}/withdraw", json={"source": "synthetic withdrawal"})
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "WITHDRAWN"

    execute = client.post(f"/api/v1/workspaces/default/campaigns/{campaign_id}/execute")
    assert execute.status_code == 200
    assert execute.json()["decision_summary"] == {"DENY": 1}
    recipients = client.get(f"/api/v1/workspaces/default/campaigns/{campaign_id}/recipients").json()["items"]
    assert recipients[0]["execution_reason_codes"] == ["SUPPRESSION_ACTIVE"]
    outbox = client.get("/api/v1/workspaces/default/outbox", params={"campaign_id": campaign_id})
    assert outbox.status_code == 200
    assert outbox.json()["total"] == 0


def test_campaign_requires_preview_before_execution(client) -> None:
    record = _record(client)
    campaign = client.post("/api/v1/workspaces/default/campaigns", json={
        "name": "Blocked direct execute", "purpose": "marketing", "channel": "whatsapp", "message_template_id": "course-update-v1", "record_ids": [record["id"]],
    }).json()
    response = client.post(f"/api/v1/workspaces/default/campaigns/{campaign['id']}/execute")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CAMPAIGN_PREVIEW_REQUIRED"
