from io import BytesIO

from openpyxl import Workbook

from app.config import Settings

BASE = "/api/v1/workspaces/default/demo"


def _xlsx_payload() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append([None, None, None, None])
    sheet.append([None, None, None, None])
    sheet.append(["Customer", None, "Email", "Mobile"])
    sheet.append(["Sheet User", None, "sheet.user@example.test", "9000010599"])
    sheet.append([None, None, None, None])
    sheet.append(["Second User", None, "second.user@example.test", "9000010598"])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _source_id(client, source_key: str = "crm") -> str:
    return next(source["id"] for source in client.get("/api/v1/workspaces/default/sources").json() if source["source_key"] == source_key)


def _import(client, email: str = "aarav.demo@example.test") -> None:
    response = client.post(
        f"/api/v1/workspaces/default/sources/{_source_id(client)}/imports",
        files={"file": ("demo.csv", f"customer_name,email,mobile\nAarav Demo,{email},9000010501\n".encode(), "text/csv")},
    )
    assert response.status_code == 201, response.text


def _reset(client) -> dict:
    response = client.post(f"{BASE}/reset")
    assert response.status_code == 200, response.text
    return response.json()


def _request_by_type(snapshot: dict, request_type: str) -> dict:
    return next(item for item in snapshot["rightsRequests"] if item["type"] == request_type)


def test_demo_snapshot_shape_and_contact_modes(client) -> None:
    _import(client)
    masked = client.get(BASE)
    assert masked.status_code == 200, masked.text
    body = masked.json()
    assert body["schemaVersion"] == "demo-v1"
    assert body["workspace"]["ref"] == "aranya-coaching-centre"
    assert len(body["sources"]) == 4
    assert len(body["documents"]) >= 11
    assert len(body["customers"]) == 1
    assert body["customers"][0]["email"].startswith("a***@")
    assert body["integrity"]["status"] == "unverified"
    assert body["demo"]["resetAvailable"] is True
    assert body["demo"]["failureInjectionEnabled"] is True
    assert "schema" in body["documents"][0]

    synthetic = client.get(BASE, params={"contacts": "synthetic"})
    assert synthetic.status_code == 200
    assert synthetic.json()["customers"][0]["email"] == "aarav.demo@example.test"
    assert client.get(BASE, params={"contacts": "raw"}).status_code == 422


def test_demo_reset_restores_documents_previews_and_integrity(client) -> None:
    body = _reset(client)
    assert len(body["customers"]) == 28
    assert len(body["documents"]) == 11
    assert len(body["policies"]) == 6
    assert len(body["rightsRequests"]) == 1
    assert len(body["rightsHolds"]) == 1
    assert body["integrity"]["status"] == "verified"
    assert body["integrity"]["gateState"] == "OPEN"
    assert len(body["checkpoints"]) >= 1
    previews = {document["kind"]: document["preview"] for document in body["documents"]}
    assert len(previews["invoice"]["line_items"]) == 2
    assert len(previews["purchase-order"]["line_items"]) == 2
    assert len(previews["email"]["messages"]) == 2
    assert len(previews["conversation"]["messages"]) == 16
    assert previews["crm-record"]["row_count"] == 24
    assert previews["spreadsheet"]["row_count"] == 18
    assert previews["consent-record"]["consent"]["purpose"] == "course updates"
    assert previews["form"]["fields"]


def test_demo_rights_portability_rectification_and_erasure_hold(client) -> None:
    body = _reset(client)
    subject = body["demo"]["userSubjectRef"]

    portability = client.post(f"{BASE}/rights-requests", json={"subjectRef": subject, "requestType": "PORTABILITY"})
    assert portability.status_code == 201, portability.text
    portability_id = _request_by_type(portability.json(), "portability")["id"]
    executed = client.post(f"{BASE}/rights-requests/{portability_id}/execute")
    assert executed.status_code == 200, executed.text
    assert _request_by_type(executed.json(), "portability")["status"] == "complete"
    download = client.get(f"{BASE}/rights-requests/{portability_id}/artifact/download")
    assert download.status_code == 200
    assert "dvault-portability-v1" in download.text
    assert "aarav.mehta@example.test" in download.text

    rectification = client.post(f"{BASE}/rights-requests", json={
        "subjectRef": subject,
        "requestType": "RECTIFICATION",
        "correction": {"field": "email", "requestedValue": "aarav.rectified@rectified.test", "reason": "Demo correction"},
    })
    assert rectification.status_code == 201, rectification.text
    rectification_id = _request_by_type(rectification.json(), "rectification")["id"]
    executed = client.post(f"{BASE}/rights-requests/{rectification_id}/execute")
    assert executed.status_code == 200, executed.text
    assert _request_by_type(executed.json(), "rectification")["status"] == "complete"
    synthetic = client.get(BASE, params={"contacts": "synthetic"}).json()
    assert next(customer["email"] for customer in synthetic["customers"] if customer["id"] == subject) == "aarav.rectified@rectified.test"

    missing_details = client.post(f"{BASE}/rights-requests", json={"subjectRef": subject, "requestType": "RECTIFICATION"})
    assert missing_details.status_code == 422
    assert missing_details.json()["error"]["code"] == "RECTIFICATION_DETAILS_REQUIRED"

    objection = client.post(f"{BASE}/rights-requests", json={"subjectRef": subject, "requestType": "OBJECTION"})
    assert objection.status_code == 201, objection.text
    assert _request_by_type(objection.json(), "objection")["id"]

    erasure = client.post(f"{BASE}/rights-requests", json={"subjectRef": subject, "requestType": "ERASURE"})
    assert erasure.status_code == 201, erasure.text
    erasure_id = _request_by_type(erasure.json(), "erasure")["id"]
    executed = client.post(f"{BASE}/rights-requests/{erasure_id}/execute")
    assert executed.status_code == 200, executed.text
    erased = _request_by_type(executed.json(), "erasure")
    assert erased["status"] == "review"
    assert erased["sourceProgress"] and all(item["status"] == "restricted" for item in erased["sourceProgress"])


def test_demo_campaign_and_tamper_fail_closed(client) -> None:
    body = _reset(client)
    subject = body["demo"]["userSubjectRef"]
    campaign = client.post(f"{BASE}/campaigns", json={"name": "Rehearsal campaign", "subjectRef": subject, "templateId": "course-update-v1"})
    assert campaign.status_code == 201, campaign.text
    campaign_id = campaign.json()["campaigns"][0]["id"]
    preview = client.post(f"{BASE}/campaigns/{campaign_id}/preview")
    assert preview.status_code == 200
    assert all(recipient["decision"] == "approve" for recipient in preview.json()["campaignRecipients"])
    executed = client.post(f"{BASE}/campaigns/{campaign_id}/execute")
    assert executed.status_code == 200
    assert all(recipient["status"] == "sent" for recipient in executed.json()["campaignRecipients"])

    blocker = client.post(f"{BASE}/campaigns", json={"name": "Blocked campaign", "subjectRef": subject, "templateId": "enrolment-reminder-v1"}).json()["campaigns"][0]
    client.post(f"{BASE}/campaigns/{blocker['id']}/preview")

    tamper = client.post(f"{BASE}/failures", json={"kind": "audit_tamper"})
    assert tamper.status_code == 200, tamper.text
    assert tamper.json()["integrity"]["status"] == "failed"
    assert tamper.json()["integrity"]["gateState"] == "BLOCKED"
    assert tamper.json()["integrity"]["reasonCode"] == "CHAIN_EVENT_EDITED"
    assert tamper.json()["breaches"]

    blocked_campaign = client.post(f"{BASE}/campaigns/{blocker['id']}/execute")
    assert blocked_campaign.status_code == 409
    assert blocked_campaign.json()["error"]["code"] == "EVIDENCE_UNTRUSTED"
    blocked_rights = client.post(f"{BASE}/rights-requests/{body['rightsRequests'][0]['id']}/execute")
    assert blocked_rights.status_code == 409
    assert blocked_rights.json()["error"]["code"] == "EVIDENCE_UNTRUSTED"

    cleared = client.post(f"{BASE}/failures/clear")
    assert cleared.status_code == 200
    assert cleared.json()["integrity"]["status"] == "verified"
    assert cleared.json()["integrity"]["gateState"] == "OPEN"


def test_demo_user_projection_and_consent(client) -> None:
    _reset(client)
    workspace = client.get(f"{BASE}/user")
    assert workspace.status_code == 200, workspace.text
    body = workspace.json()
    assert body["profile"]["name"] == "Aarav Mehta"
    assert body["documents"]
    assert [consent["purpose"] for consent in body["consents"]][:2] == ["Service delivery", "Marketing messages"]
    assert next(consent for consent in body["consents"] if consent["purpose"] == "Marketing messages")["granted"] is True

    withdrawn = client.post(f"{BASE}/user/consents/marketing", json={"granted": False})
    assert withdrawn.status_code == 200
    assert next(consent for consent in withdrawn.json()["consents"] if consent["purpose"] == "Marketing messages")["granted"] is False
    required = client.post(f"{BASE}/user/consents/service", json={"granted": False})
    assert required.status_code == 409
    assert required.json()["error"]["code"] == "REQUIRED_CONSENT"

    created = client.post(f"{BASE}/user/requests", json={"type": "ACCESS"})
    assert created.status_code == 201, created.text
    assert len(created.json()["requests"]) >= 2


def test_demo_import_sniffs_xlsx_content_and_skips_blank_rows(client) -> None:
    response = client.post(
        f"{BASE}/imports",
        data={"source_id": _source_id(client, "crm")},
        files={"file": ("dsa-data.csv", _xlsx_payload(), "text/csv")},
    )
    assert response.status_code == 201, response.text
    document = next(item for item in response.json()["documents"] if item["name"] == "dsa-data.csv")
    assert document["importState"] == "indexed"
    assert [field["field"] for field in document["schema"]] == ["Customer", "Email", "Mobile"]
    imported = next(
        item for item in client.get("/api/v1/workspaces/default/imports").json()["items"]
        if item["filename"] == "dsa-data.csv"
    )
    assert imported["status"] == "COMPLETE"
    assert imported["row_count"] == 2


def test_demo_import_retries_a_failed_upload(client) -> None:
    source_id = _source_id(client, "crm")
    files = {"file": ("broken.csv", b"\xff\xfe\x00broken", "text/csv")}
    first = client.post(f"{BASE}/imports", data={"source_id": source_id}, files=files)
    assert first.status_code == 422
    assert first.json()["error"]["code"] == "UNSUPPORTED_ENCODING"

    retried = client.post(f"{BASE}/imports", data={"source_id": source_id}, files=files)
    assert retried.status_code == 422
    assert retried.json()["error"]["code"] == "UNSUPPORTED_ENCODING"


def test_demo_import_same_content_into_two_sources(client) -> None:
    payload = _xlsx_payload()
    for source_key in ("crm", "enquiries_sheet"):
        response = client.post(
            f"{BASE}/imports",
            data={"source_id": _source_id(client, source_key)},
            files={"file": ("shared.csv", payload, "text/csv")},
        )
        assert response.status_code == 201, f"{source_key}: {response.text}"


def test_demo_controls_can_be_disabled(client, monkeypatch) -> None:
    disabled = Settings(enable_demo_controls=False, enable_failure_injection=False)
    monkeypatch.setattr("app.demo_failures.get_settings", lambda: disabled)
    monkeypatch.setattr("app.demo_reset.get_settings", lambda: disabled)
    assert client.post(f"{BASE}/failures", json={"kind": "audit_tamper"}).status_code == 403
    assert client.post(f"{BASE}/reset").status_code == 403
