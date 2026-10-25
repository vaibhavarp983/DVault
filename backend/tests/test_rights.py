from datetime import datetime, timedelta, timezone

from app.config import Settings

WORKSPACE = "/api/v1/workspaces/default"


def _source_id(client, source_key: str) -> str:
    return next(source["id"] for source in client.get(f"{WORKSPACE}/sources").json() if source["source_key"] == source_key)


def _import(client, source_key: str, filename: str, payload: bytes) -> dict:
    response = client.post(
        f"{WORKSPACE}/sources/{_source_id(client, source_key)}/imports",
        files={"file": (filename, payload, "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _records(client, import_id: str) -> list[dict]:
    response = client.get(f"{WORKSPACE}/records", params={"import_id": import_id})
    assert response.status_code == 200
    return response.json()["items"]


def _seed_identity(client) -> tuple[str, dict, dict, list[dict]]:
    crm = _import(
        client,
        "crm",
        "rights_crm.csv",
        b"customer_name,email,mobile\nAarav Rights,aarav.rights@example.test,9000010201\n",
    )
    sheet = _import(
        client,
        "enquiries_sheet",
        "rights_sheet.csv",
        b"learner_name,email,phone\nAarav Rights,aarav.rights@example.test,9000010201\n",
    )
    crm_records = _records(client, crm["id"])
    sheet_records = _records(client, sheet["id"])
    subject = crm_records[0]["subject_ref"]
    assert subject
    assert sheet_records[0]["subject_ref"] == subject
    return subject, crm, sheet, crm_records


def _create(client, subject: str, request_type: str, key: str) -> dict:
    response = client.post(f"{WORKSPACE}/rights-requests", json={
        "subject_ref": subject,
        "request_type": request_type,
        "idempotency_key": key,
        "requester_reference": "synthetic rights test",
    })
    assert response.status_code in (200, 201), response.text
    return response.json()


def _plan(client, request_id: str) -> dict:
    response = client.post(f"{WORKSPACE}/rights-requests/{request_id}/plan")
    assert response.status_code == 200, response.text
    return response.json()


def _run(client, request_id: str, operation: str = "execute") -> dict:
    response = client.post(f"{WORKSPACE}/rights-requests/{request_id}/{operation}")
    assert response.status_code == 200, response.text
    return response.json()


def _request(client, request_id: str) -> dict:
    response = client.get(f"{WORKSPACE}/rights-requests/{request_id}")
    assert response.status_code == 200, response.text
    return response.json()


def _actions(client, request_id: str) -> list[dict]:
    response = client.get(f"{WORKSPACE}/rights-requests/{request_id}/actions")
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _enable_failure_injection(monkeypatch) -> None:
    monkeypatch.setattr("app.api.get_settings", lambda: Settings(enable_failure_injection=True))


def _set_failure(client, source_id: str, enabled: bool) -> dict:
    response = client.post(f"{WORKSPACE}/sources/{source_id}/failure-injection", json={"enabled": enabled})
    assert response.status_code == 200, response.text
    return response.json()


def test_access_request_builds_a_durable_artifact(client) -> None:
    subject, crm, _, _ = _seed_identity(client)
    request = _create(client, subject, "ACCESS", "access-1")
    planned = _plan(client, request["id"])
    assert planned["status"] == "PLANNING"
    assert planned["source_action_total"] == 2

    job = _run(client, request["id"])
    assert job["status"] == "COMPLETE"
    assert job["action_total"] == 2
    assert job["action_completed"] == 2

    completed = _request(client, request["id"])
    assert completed["status"] == "COMPLETE"
    assert completed["unresolved_action_total"] == 0
    assert completed["summary"]["action_summary"] == {"SUCCEEDED": 2}

    artifact = client.get(f"{WORKSPACE}/rights-requests/{request['id']}/access-artifact")
    assert artifact.status_code == 200
    body = artifact.json()
    assert body["status"] == "READY"
    assert len(body["source_summaries"]) == 2
    assert {summary["source_key"] for summary in body["source_summaries"]} == {"crm", "enquiries_sheet"}

    remaining = client.get(f"{WORKSPACE}/records", params={"subject_ref": subject})
    assert remaining.json()["total"] == 2


def test_multi_source_erasure_completes_and_removes_source_rows(client) -> None:
    subject, _, _, _ = _seed_identity(client)
    request = _create(client, subject, "ERASURE", "erase-healthy")
    _plan(client, request["id"])
    job = _run(client, request["id"])

    assert job["status"] == "COMPLETE"
    actions = _actions(client, request["id"])
    assert {action["status"] for action in actions} == {"SUCCEEDED"}
    assert {action["result"]["erased_record_count"] for action in actions} == {1}

    completed = _request(client, request["id"])
    assert completed["status"] == "COMPLETE"
    assert client.get(f"{WORKSPACE}/records", params={"subject_ref": subject}).json()["total"] == 0


def test_injected_failure_is_partial_and_retry_runs_only_unresolved_actions(client, monkeypatch) -> None:
    subject, _, _, _ = _seed_identity(client)
    _enable_failure_injection(monkeypatch)
    sheet_source = _source_id(client, "enquiries_sheet")
    assert _set_failure(client, sheet_source, True)["failure_injection_enabled"] is True

    request = _create(client, subject, "ERASURE", "erase-partial")
    _plan(client, request["id"])
    first_job = _run(client, request["id"])
    assert first_job["status"] == "PARTIAL"
    assert first_job["action_completed"] == 1

    actions = {action["source_id"]: action for action in _actions(client, request["id"])}
    assert actions[sheet_source]["status"] == "FAILED"
    assert actions[sheet_source]["error_code"] == "SYNTHETIC_CONNECTOR_FAILURE"
    assert actions[sheet_source]["retry_eligible"] is True
    crm_source = _source_id(client, "crm")
    assert actions[crm_source]["status"] == "SUCCEEDED"
    assert actions[crm_source]["attempt_count"] == 1

    partial = _request(client, request["id"])
    assert partial["status"] == "PARTIAL"
    assert partial["summary"]["action_summary"] == {"FAILED": 1, "SUCCEEDED": 1}

    assert _set_failure(client, sheet_source, False)["failure_injection_enabled"] is False
    retry_job = _run(client, request["id"], "retry")
    assert retry_job["status"] == "COMPLETE"
    assert retry_job["action_total"] == 1
    assert retry_job["operation"] == "RIGHTS_RETRY"

    retried = {action["source_id"]: action for action in _actions(client, request["id"])}
    assert retried[sheet_source]["status"] == "SUCCEEDED"
    assert retried[sheet_source]["attempt_count"] == 2
    assert retried[crm_source]["attempt_count"] == 1
    assert _request(client, request["id"])["status"] == "COMPLETE"


def test_retention_hold_restricts_erasure_and_release_enables_only_restricted_work(client) -> None:
    subject, _, _, _ = _seed_identity(client)
    sheet_source = _source_id(client, "enquiries_sheet")
    hold = client.post(f"{WORKSPACE}/retention-holds", json={
        "subject_ref": subject,
        "source_id": sheet_source,
        "reason_code": "LEGAL_HOLD",
        "review_note": "Synthetic hold for the rights test.",
    })
    assert hold.status_code == 201, hold.text

    request = _create(client, subject, "ERASURE", "erase-held")
    _plan(client, request["id"])
    job = _run(client, request["id"])
    assert job["status"] == "PARTIAL"

    actions = {action["source_id"]: action for action in _actions(client, request["id"])}
    assert actions[sheet_source]["status"] == "RESTRICTED"
    assert actions[sheet_source]["error_code"] == "RETENTION_HOLD_ACTIVE"
    assert actions[sheet_source]["retry_eligible"] is True
    crm_source = _source_id(client, "crm")
    assert actions[crm_source]["status"] == "SUCCEEDED"
    assert _request(client, request["id"])["status"] == "PARTIAL"

    released = client.post(f"{WORKSPACE}/retention-holds/{hold.json()['id']}/release", json={"note": "Review complete."})
    assert released.status_code == 200, released.text
    assert released.json()["status"] == "RELEASED"
    assert released.json()["released_at"] is not None
    assert client.get(f"{WORKSPACE}/retention-holds", params={"status": "ACTIVE"}).json() == []

    retry_job = _run(client, request["id"], "retry")
    assert retry_job["status"] == "COMPLETE"
    assert retry_job["action_total"] == 1

    retried = {action["source_id"]: action for action in _actions(client, request["id"])}
    assert retried[sheet_source]["status"] == "SUCCEEDED"
    assert retried[sheet_source]["attempt_count"] == 2
    assert retried[crm_source]["attempt_count"] == 1
    assert _request(client, request["id"])["status"] == "COMPLETE"


def test_subject_wide_hold_requires_review_until_released(client) -> None:
    subject, _, _, _ = _seed_identity(client)
    hold = client.post(f"{WORKSPACE}/retention-holds", json={
        "subject_ref": subject,
        "reason_code": "LEGAL_HOLD",
    })
    assert hold.status_code == 201, hold.text

    request = _create(client, subject, "ERASURE", "erase-all-held")
    _plan(client, request["id"])
    job = _run(client, request["id"])
    assert job["status"] == "NEEDS_REVIEW"

    actions = _actions(client, request["id"])
    assert {action["status"] for action in actions} == {"RESTRICTED"}
    assert _request(client, request["id"])["status"] == "NEEDS_REVIEW"
    assert client.get(f"{WORKSPACE}/records", params={"subject_ref": subject}).json()["total"] == 2

    client.post(f"{WORKSPACE}/retention-holds/{hold.json()['id']}/release", json={})
    assert _run(client, request["id"], "retry")["status"] == "COMPLETE"
    assert client.get(f"{WORKSPACE}/records", params={"subject_ref": subject}).json()["total"] == 0


def test_withdrawal_creates_suppression_and_blocks_dispatch(client) -> None:
    subject, _, _, crm_records = _seed_identity(client)
    now = datetime.now(timezone.utc)
    authorization = client.post(f"{WORKSPACE}/authorizations", json={
        "subject_ref": subject,
        "purpose": "marketing",
        "channel": "whatsapp",
        "evidence_source": "synthetic consent record",
        "notice_version": "demo-v1",
        "captured_at": now.isoformat(),
        "expires_at": (now + timedelta(days=10)).isoformat(),
    })
    assert authorization.status_code == 201, authorization.text

    request = _create(client, subject, "WITHDRAWAL", "withdraw-1")
    _plan(client, request["id"])
    job = _run(client, request["id"])
    assert job["status"] == "COMPLETE"

    actions = _actions(client, request["id"])
    assert len(actions) == 2
    withdrawal = next(action for action in actions if action["result"].get("withdrawn_authorizations") == 1)
    assert withdrawal["result"]["scope"] == "WORKSPACE_AUTHORIZATIONS"
    assert withdrawal["result"]["created_suppressions"] == 1
    assert withdrawal["result"]["confirmed_active_suppressions"] >= 1

    stored = client.get(f"{WORKSPACE}/authorizations", params={"subject_ref": subject}).json()
    assert stored[0]["status"] == "WITHDRAWN"

    campaign = client.post(f"{WORKSPACE}/campaigns", json={
        "name": "Post-withdrawal campaign",
        "purpose": "marketing",
        "channel": "whatsapp",
        "message_template_id": "course-update-v1",
        "record_ids": [crm_records[0]["id"]],
    })
    assert campaign.status_code == 201, campaign.text
    campaign_id = campaign.json()["id"]
    preview = client.post(f"{WORKSPACE}/campaigns/{campaign_id}/preview")
    assert preview.json()["decision_summary"] == {"DENY": 1}
    executed = client.post(f"{WORKSPACE}/campaigns/{campaign_id}/execute")
    assert executed.json()["decision_summary"] == {"DENY": 1}
    assert client.get(f"{WORKSPACE}/outbox", params={"campaign_id": campaign_id}).json()["total"] == 0


def test_rights_idempotency_and_lifecycle_errors(client) -> None:
    subject, _, _, _ = _seed_identity(client)
    first = client.post(f"{WORKSPACE}/rights-requests", json={
        "subject_ref": subject, "request_type": "ACCESS", "idempotency_key": "same-key",
    })
    assert first.status_code == 201
    replay = client.post(f"{WORKSPACE}/rights-requests", json={
        "subject_ref": subject, "request_type": "ERASURE", "idempotency_key": "same-key",
    })
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["request_type"] == "ACCESS"

    invalid = client.post(f"{WORKSPACE}/rights-requests", json={
        "subject_ref": subject, "request_type": "DELETE_EVERYTHING", "idempotency_key": "bad-type",
    })
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "INVALID_RIGHTS_REQUEST_TYPE"

    unplanned = _create(client, subject, "ACCESS", "unplanned")
    response = client.post(f"{WORKSPACE}/rights-requests/{unplanned['id']}/execute")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RIGHTS_REQUEST_PLANNING_REQUIRED"

    _plan(client, unplanned["id"])
    _run(client, unplanned["id"])
    again = client.post(f"{WORKSPACE}/rights-requests/{unplanned['id']}/execute")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "RIGHTS_REQUEST_ALREADY_COMPLETE"
    retried = client.post(f"{WORKSPACE}/rights-requests/{unplanned['id']}/retry")
    assert retried.status_code == 409
    assert retried.json()["error"]["code"] == "RIGHTS_REQUEST_ALREADY_COMPLETE"


def test_unknown_subject_routes_to_review_without_actions(client) -> None:
    request = _create(client, "subref_not_in_inventory", "ACCESS", "unknown-subject")
    planned = _plan(client, request["id"])
    assert planned["status"] == "NEEDS_REVIEW"
    assert planned["summary"]["reason_code"] == "SUBJECT_COVERAGE_UNAVAILABLE"
    assert planned["source_action_total"] == 0

    response = client.post(f"{WORKSPACE}/rights-requests/{request['id']}/execute")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RIGHTS_REQUEST_NO_RETRYABLE_ACTIONS"
    artifact = client.get(f"{WORKSPACE}/rights-requests/{request['id']}/access-artifact")
    assert artifact.status_code == 404


def test_job_timeline_and_dashboard_reflect_persisted_state(client, monkeypatch) -> None:
    subject, _, _, _ = _seed_identity(client)
    _enable_failure_injection(monkeypatch)
    _set_failure(client, _source_id(client, "enquiries_sheet"), True)

    request = _create(client, subject, "ERASURE", "erase-dashboard")
    _plan(client, request["id"])
    job = _run(client, request["id"])
    assert job["status"] == "PARTIAL"

    jobs = client.get(f"{WORKSPACE}/jobs")
    assert jobs.status_code == 200
    assert jobs.json()["total"] == 1
    detail = client.get(f"{WORKSPACE}/jobs/{job['id']}")
    assert detail.status_code == 200
    timeline = detail.json()["timeline"]
    sequences = [event["sequence"] for event in timeline]
    assert sequences == sorted(sequences)
    assert sequences == list(range(1, len(timeline) + 1))
    assert timeline[0]["event_type"] == "JOB_STARTED"
    assert timeline[-1]["event_type"] == "JOB_COMPLETED"
    assert {event["event_type"] for event in timeline} >= {"ACTION_STARTED", "ACTION_COMPLETED", "ACTION_FAILED"}

    dashboard = client.get(f"{WORKSPACE}/dashboard").json()
    assert dashboard["rights_requests_partial"] == 1
    assert dashboard["workflow_summary"]["active_jobs"] == 0
    queue = client.get(f"{WORKSPACE}/rights-requests", params={"status": "PARTIAL"})
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["id"] == request["id"]


def test_hold_and_failure_injection_validation(client) -> None:
    disabled = client.post(f"{WORKSPACE}/sources/{_source_id(client, 'crm')}/failure-injection", json={"enabled": True})
    assert disabled.status_code == 403
    assert disabled.json()["error"]["code"] == "FAILURE_INJECTION_DISABLED"

    unscoped = client.post(f"{WORKSPACE}/retention-holds", json={"reason_code": "LEGAL_HOLD"})
    assert unscoped.status_code == 422
    assert unscoped.json()["error"]["code"] == "RETENTION_HOLD_SCOPE_REQUIRED"

    unknown_source = client.post(f"{WORKSPACE}/retention-holds", json={
        "source_id": "not-a-source", "reason_code": "LEGAL_HOLD",
    })
    assert unknown_source.status_code == 404
    assert unknown_source.json()["error"]["code"] == "SOURCE_NOT_FOUND"

    missing = client.post(f"{WORKSPACE}/retention-holds/not-a-hold/release", json={})
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "RETENTION_HOLD_NOT_FOUND"

    hold = client.post(f"{WORKSPACE}/retention-holds", json={"subject_ref": "subref_demo", "reason_code": "LEGAL_HOLD"})
    assert hold.status_code == 201
    released = client.post(f"{WORKSPACE}/retention-holds/{hold.json()['id']}/release", json={})
    assert released.status_code == 200
    replay = client.post(f"{WORKSPACE}/retention-holds/{hold.json()['id']}/release", json={})
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "RETENTION_HOLD_NOT_ACTIVE"
