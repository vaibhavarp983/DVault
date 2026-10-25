import json

from sqlalchemy import text

from app.evidence import canonical_json, sequence_anomaly

WORKSPACE = "/api/v1/workspaces/default"


def _workspace_id(client) -> str:
    return client.get(WORKSPACE).json()["id"]


def _source_id(client, source_key: str = "crm") -> str:
    return next(source["id"] for source in client.get(f"{WORKSPACE}/sources").json() if source["source_key"] == source_key)


def _import(client, email: str = "aarav.evidence@example.test", phone: str = "9000010301") -> dict:
    response = client.post(
        f"{WORKSPACE}/sources/{_source_id(client)}/imports",
        files={"file": ("evidence.csv", f"customer_name,email,mobile\nAarav Evidence,{email},{phone}\n".encode(), "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _seed(client) -> dict:
    imported = _import(client)
    record = client.get(f"{WORKSPACE}/records", params={"import_id": imported["id"]}).json()["items"][0]
    evaluated = client.post(f"{WORKSPACE}/policy-decisions/evaluate", json={
        "subject_ref": record["subject_ref"], "purpose": "marketing", "channel": "whatsapp",
    })
    assert evaluated.status_code == 200
    return {"import": imported, "record": record, "subject": record["subject_ref"]}


def _events(client, **params) -> dict:
    response = client.get(f"{WORKSPACE}/audit/events", params={"page_size": 100, **params})
    assert response.status_code == 200, response.text
    return response.json()


def _verify(client, **payload) -> dict:
    response = client.post(f"{WORKSPACE}/audit/verify", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _update_event(db_session, workspace_id: str, sequence: int, **values) -> None:
    assignments = ", ".join(f"{column} = :{column}" for column in values)
    db_session.execute(
        text(f"UPDATE audit_events SET {assignments} WHERE workspace_id = :workspace_id AND sequence = :sequence"),
        {"workspace_id": workspace_id, "sequence": sequence, **values},
    )
    db_session.commit()


def _delete_event(db_session, workspace_id: str, sequence: int) -> None:
    db_session.execute(
        text("DELETE FROM audit_events WHERE workspace_id = :workspace_id AND sequence = :sequence"),
        {"workspace_id": workspace_id, "sequence": sequence},
    )
    db_session.commit()


def _delete_from(db_session, workspace_id: str, sequence: int) -> None:
    db_session.execute(
        text("DELETE FROM audit_events WHERE workspace_id = :workspace_id AND sequence >= :sequence"),
        {"workspace_id": workspace_id, "sequence": sequence},
    )
    db_session.commit()


def _prepare_blockable_work(client, subject: str, record_id: str) -> tuple[str, str]:
    request = client.post(f"{WORKSPACE}/rights-requests", json={
        "subject_ref": subject, "request_type": "ACCESS", "idempotency_key": "evidence-gate",
    })
    assert request.status_code == 201, request.text
    planned = client.post(f"{WORKSPACE}/rights-requests/{request.json()['id']}/plan")
    assert planned.status_code == 200, planned.text
    campaign = client.post(f"{WORKSPACE}/campaigns", json={
        "name": "Evidence gate campaign", "purpose": "marketing", "channel": "whatsapp",
        "message_template_id": "course-update-v1", "record_ids": [record_id],
    })
    assert campaign.status_code == 201, campaign.text
    campaign_id = campaign.json()["id"]
    preview = client.post(f"{WORKSPACE}/campaigns/{campaign_id}/preview")
    assert preview.status_code == 200, preview.text
    return request.json()["id"], campaign_id


def test_canonicalization_and_sequence_rules_are_deterministic() -> None:
    assert canonical_json({"b": 1, "a": [2, {"d": 4, "c": 3}]}) == '{"a":[2,{"c":3,"d":4}],"b":1}'
    assert sequence_anomaly([1, 2, 3]) is None
    assert sequence_anomaly([2, 3])[1] == "CHAIN_SEQUENCE_GAP"
    assert sequence_anomaly([1, 3])[1] == "CHAIN_SEQUENCE_GAP"
    assert sequence_anomaly([1, 2, 2])[1] == "CHAIN_EVENT_REORDERED"
    assert sequence_anomaly([1, 3, 2])[1] == "CHAIN_SEQUENCE_GAP"


def test_chain_appends_verifies_and_exposes_trust(client) -> None:
    seeded = _seed(client)
    events = _events(client)
    items = events["items"]
    assert events["total"] >= 3
    assert items[0]["event_type"] == "CHAIN_GENESIS"
    assert [item["sequence"] for item in items] == list(range(1, len(items) + 1))
    assert all(len(item["event_hash"]) == 64 and len(item["previous_hash"]) == 64 for item in items)
    assert items[0]["previous_hash"] == "0" * 64

    serialized = json.dumps([item["payload"] for item in items])
    assert "@" not in serialized
    assert "9000010301" not in serialized
    assert seeded["subject"] in serialized

    result = _verify(client)
    assert result["status"] == "VERIFIED"
    assert result["evidence_state"] == "VERIFIED_CHAIN_ONLY"
    assert result["checked_event_total"] == len(items)
    assert result["checkpoint_status"] == "MISSING"
    assert result["gate_state"] == "OPEN"
    assert result["failures"] == []
    assert "does not establish" in result["disclaimer"]

    status = client.get(f"{WORKSPACE}/audit/status").json()
    assert status["chain"]["head_sequence"] == len(items)
    assert status["verification"]["status"] == "VERIFIED"
    assert status["gate"]["state"] == "OPEN"
    assert status["incidents"]["open"] == 0
    assert status["breaches"]["open"] == 0

    assert _events(client, trust_state="TRUSTED")["total"] == len(items)
    assert _events(client, trust_state="UNTRUSTED")["total"] == 0
    assert _events(client, event_type="IMPORT_COMPLETED")["total"] == 1
    assert _events(client, from_sequence=2, to_sequence=2)["total"] == 1
    single = client.get(f"{WORKSPACE}/audit/events/{items[0]['id']}")
    assert single.status_code == 200
    assert single.json()["trust_state"] == "TRUSTED"
    missing = client.get(f"{WORKSPACE}/audit/events/not-an-event")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "AUDIT_EVENT_NOT_FOUND"


def test_edited_event_fails_closed_until_review_then_restore(client, db_session) -> None:
    seeded = _seed(client)
    rights_id, campaign_id = _prepare_blockable_work(client, seeded["subject"], seeded["record"]["id"])
    workspace_id = _workspace_id(client)
    items = _events(client)["items"]
    target = next(item for item in items if item["event_type"] == "IMPORT_COMPLETED")
    # The API does not expose canonical_payload, so restore from the stored canonical form.
    from sqlalchemy import select

    from app.models import AuditEvent

    stored = db_session.scalar(select(AuditEvent).where(
        AuditEvent.workspace_id == workspace_id,
        AuditEvent.sequence == target["sequence"],
    ))
    assert stored is not None
    original_canonical = stored.canonical_payload

    edited = json.loads(original_canonical)
    edited["row_count"] = 999
    _update_event(db_session, workspace_id, target["sequence"], canonical_payload=canonical_json(edited))
    result = _verify(client)
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "CHAIN_EVENT_EDITED"
    assert result["failure_sequence"] == target["sequence"]
    assert result["untrusted_from_sequence"] == target["sequence"]
    assert result["gate_state"] == "BLOCKED"

    status = client.get(f"{WORKSPACE}/audit/status").json()
    assert status["gate"]["state"] == "BLOCKED"
    assert status["verification"]["evidence_state"] == "UNTRUSTED"
    assert _events(client, trust_state="UNTRUSTED")["total"] >= 1
    assert _events(client, trust_state="TRUSTED")["total"] == target["sequence"] - 1

    blocked_campaign = client.post(f"{WORKSPACE}/campaigns/{campaign_id}/execute")
    assert blocked_campaign.status_code == 409
    assert blocked_campaign.json()["error"]["code"] == "EVIDENCE_UNTRUSTED"
    assert blocked_campaign.json()["error"]["details"]["failure_sequence"] == target["sequence"]

    blocked_rights = client.post(f"{WORKSPACE}/rights-requests/{rights_id}/execute")
    assert blocked_rights.status_code == 409
    assert blocked_rights.json()["error"]["code"] == "EVIDENCE_UNTRUSTED"

    assert client.post(f"{WORKSPACE}/policy-decisions/evaluate", json={
        "subject_ref": seeded["subject"], "purpose": "marketing", "channel": "whatsapp",
    }).status_code == 200
    assert client.post(f"{WORKSPACE}/campaigns/{campaign_id}/preview").status_code == 200

    incidents = client.get(f"{WORKSPACE}/audit/integrity-incidents").json()
    assert len(incidents) == 1
    incident = incidents[0]
    assert incident["status"] == "OPEN"
    assert incident["linked_breach_incident_id"] is not None
    breaches = client.get(f"{WORKSPACE}/breaches", params={"origin": "AUDIT_INTEGRITY"}).json()
    assert breaches["total"] == 1
    assert breaches["items"][0]["scope_status"] == "UNDETERMINED"

    short = client.post(f"{WORKSPACE}/audit/integrity-incidents/{incident['id']}/resolve", json={
        "decision": "ACKNOWLEDGE_EXCEPTION", "note": "short",
    })
    assert short.status_code == 422
    assert short.json()["error"]["code"] == "VALIDATION_ERROR"

    acknowledged = client.post(f"{WORKSPACE}/audit/integrity-incidents/{incident['id']}/resolve", json={
        "decision": "ACKNOWLEDGE_EXCEPTION", "note": "Reviewed the deliberate demo tamper and accepted the exception.",
    })
    assert acknowledged.status_code == 200, acknowledged.text
    assert acknowledged.json()["status"] == "ACKNOWLEDGED"

    still_failed = _verify(client)
    assert still_failed["status"] == "FAILED"
    assert still_failed["gate_state"] == "OPEN"
    assert still_failed["reason_code"] == "CHAIN_EVENT_EDITED"

    assert client.post(f"{WORKSPACE}/campaigns/{campaign_id}/execute").status_code == 200
    assert client.post(f"{WORKSPACE}/rights-requests/{rights_id}/execute").status_code == 200

    still_broken = client.post(f"{WORKSPACE}/audit/integrity-incidents/{incident['id']}/resolve", json={
        "decision": "RESTORE_VERIFIED", "note": "Attempting to resolve after restoring evidence.",
    })
    assert still_broken.status_code == 409
    assert still_broken.json()["error"]["code"] == "INTEGRITY_STILL_FAILING"

    _update_event(db_session, workspace_id, target["sequence"], canonical_payload=original_canonical)
    restored = _verify(client)
    assert restored["status"] == "VERIFIED"
    assert restored["evidence_state"] == "VERIFIED_CHAIN_ONLY"
    assert restored["gate_state"] == "OPEN"

    resolved = client.get(f"{WORKSPACE}/audit/integrity-incidents").json()
    assert resolved[0]["status"] == "RESOLVED"
    assert resolved[0]["resolution_decision"] == "AUTO_RESOLVED_RESTORED_CHAIN"

    checkpoint = client.post(f"{WORKSPACE}/audit/checkpoints", json={"note": "Post-restore checkpoint."})
    assert checkpoint.status_code == 201, checkpoint.text
    verified_checkpoint = _verify(client)
    assert verified_checkpoint["evidence_state"] == "VERIFIED_WITH_CHECKPOINT"
    assert verified_checkpoint["checkpoint_status"] == "VALID"


def test_restore_verified_resolves_after_repair(client, db_session) -> None:
    _seed(client)
    workspace_id = _workspace_id(client)
    items = _events(client)["items"]
    target = next(item for item in items if item["event_type"] == "IMPORT_COMPLETED")

    from sqlalchemy import select

    from app.models import AuditEvent

    stored = db_session.scalar(select(AuditEvent).where(
        AuditEvent.workspace_id == workspace_id,
        AuditEvent.sequence == target["sequence"],
    ))
    original_canonical = stored.canonical_payload
    edited = json.loads(original_canonical)
    edited["row_count"] = 999
    _update_event(db_session, workspace_id, target["sequence"], canonical_payload=canonical_json(edited))
    assert _verify(client)["status"] == "FAILED"
    incident = client.get(f"{WORKSPACE}/audit/integrity-incidents").json()[0]

    still_broken = client.post(f"{WORKSPACE}/audit/integrity-incidents/{incident['id']}/resolve", json={
        "decision": "RESTORE_VERIFIED", "note": "Attempting to resolve while the evidence is still broken.",
    })
    assert still_broken.status_code == 409
    assert still_broken.json()["error"]["code"] == "INTEGRITY_STILL_FAILING"

    _update_event(db_session, workspace_id, target["sequence"], canonical_payload=original_canonical)
    resolved = client.post(f"{WORKSPACE}/audit/integrity-incidents/{incident['id']}/resolve", json={
        "decision": "RESTORE_VERIFIED", "note": "Evidence restored and re-verified by the demo operator.",
    })
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "RESOLVED"
    assert resolved.json()["resolution_decision"] == "RESTORE_VERIFIED"
    assert _verify(client)["status"] == "VERIFIED"


def test_deleted_event_reports_sequence_gap(client, db_session) -> None:
    _seed(client)
    workspace_id = _workspace_id(client)
    _delete_event(db_session, workspace_id, 2)
    result = _verify(client)
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "CHAIN_SEQUENCE_GAP"
    assert result["checked_event_total"] >= 2
    assert result["gate_state"] == "BLOCKED"


def test_broken_link_reports_link_failure(client, db_session) -> None:
    _seed(client)
    workspace_id = _workspace_id(client)
    _update_event(db_session, workspace_id, 3, previous_hash="0" * 64)
    result = _verify(client)
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "CHAIN_LINK_BROKEN"
    assert result["failure_sequence"] == 3


def test_malformed_payload_is_detected(client, db_session) -> None:
    _seed(client)
    workspace_id = _workspace_id(client)
    _update_event(db_session, workspace_id, 2, canonical_payload="{")
    result = _verify(client)
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "EVENT_PAYLOAD_MALFORMED"
    assert result["failure_sequence"] == 2


def test_checkpoint_signature_and_trusted_key_are_verified(client, db_session) -> None:
    _seed(client)
    created = client.post(f"{WORKSPACE}/audit/checkpoints", json={"note": "Baseline evidence."})
    assert created.status_code == 201, created.text
    checkpoint = created.json()
    assert checkpoint["algorithm"] == "Ed25519"
    assert len(checkpoint["signature"]) == 128
    assert len(checkpoint["public_key"]) == 64

    result = _verify(client)
    assert result["status"] == "VERIFIED"
    assert result["checkpoint_sequence"] == checkpoint["sequence"]
    assert result["checkpoint_status"] == "VALID"
    assert result["checkpoint_signed"] is True

    db_session.execute(text("UPDATE audit_checkpoints SET signature = :signature WHERE id = :id"), {
        "signature": "00" * 64, "id": checkpoint["id"],
    })
    db_session.commit()
    tampered = _verify(client)
    assert tampered["status"] == "FAILED"
    assert tampered["reason_code"] == "CHECKPOINT_SIGNATURE_INVALID"
    assert tampered["gate_state"] == "BLOCKED"

    # Restore the signature so the next check isolates the key-trust rule.
    db_session.execute(text("UPDATE audit_checkpoints SET signature = :signature, public_key = :key WHERE id = :id"), {
        "signature": checkpoint["signature"], "key": "ab" * 32, "id": checkpoint["id"],
    })
    db_session.commit()
    untrusted_key = _verify(client)
    assert untrusted_key["status"] == "FAILED"
    assert untrusted_key["reason_code"] == "CHECKPOINT_KEY_UNTRUSTED"


def test_truncated_chain_is_detected_by_checkpoint(client, db_session) -> None:
    _seed(client)
    checkpoint = client.post(f"{WORKSPACE}/audit/checkpoints", json={}).json()
    workspace_id = _workspace_id(client)
    _delete_from(db_session, workspace_id, checkpoint["sequence"])
    result = _verify(client)
    assert result["status"] == "FAILED"
    assert result["reason_code"] == "CHECKPOINT_AHEAD_OF_CHAIN"
    assert result["gate_state"] == "BLOCKED"


def test_checkpoint_can_anchor_an_empty_workspace(client) -> None:
    created = client.post(f"{WORKSPACE}/audit/checkpoints", json={"note": "Start evidence coverage."})
    assert created.status_code == 201, created.text
    events = _events(client)["items"]
    assert [event["event_type"] for event in events] == ["CHAIN_GENESIS", "AUDIT_CHECKPOINT_CREATED"]
    result = _verify(client)
    assert result["status"] == "VERIFIED"
    assert result["evidence_state"] == "VERIFIED_WITH_CHECKPOINT"
    assert result["checkpoint_status"] == "VALID"


def test_checkpoint_requires_a_verified_chain_and_records_the_failure(client, db_session) -> None:
    _seed(client)
    workspace_id = _workspace_id(client)
    _update_event(db_session, workspace_id, 2, canonical_payload='{"tampered":true}')
    response = client.post(f"{WORKSPACE}/audit/checkpoints", json={})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CHECKPOINT_REQUIRES_VERIFIED_CHAIN"
    incidents = client.get(f"{WORKSPACE}/audit/integrity-incidents").json()
    assert len(incidents) == 1
    assert incidents[0]["status"] == "OPEN"
    assert client.get(f"{WORKSPACE}/audit/status").json()["gate"]["state"] == "BLOCKED"
