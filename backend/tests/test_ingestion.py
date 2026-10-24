def source_id(client, source_key: str) -> str:
    sources = client.get("/api/v1/workspaces/default/sources").json()
    return next(source["id"] for source in sources if source["source_key"] == source_key)


def test_csv_import_profiles_records_and_idempotency(client) -> None:
    source = source_id(client, "crm")
    payload = b"customer_name,email,mobile,purpose,unfamiliar_field\nAarav Mehta,aarav@example.test,9000010001,admissions,review me\n"
    created = client.post(f"/api/v1/workspaces/default/sources/{source}/imports", files={"file": ("contacts.csv", payload, "text/csv")})
    assert created.status_code == 201
    import_id = created.json()["id"]
    assert created.json()["status"] == "COMPLETE"
    assert created.json()["row_count"] == 1

    schema = client.get(f"/api/v1/workspaces/default/imports/{import_id}/schema")
    assert schema.status_code == 200
    fields = {field["normalized_field"]: field for field in schema.json()["fields"]}
    assert fields["email"]["classification"] == "DIRECT_IDENTIFIER"
    assert fields["unfamiliar_field"]["mapping_status"] == "REVIEW_REQUIRED"

    records = client.get("/api/v1/workspaces/default/records", params={"import_id": import_id})
    assert records.status_code == 200
    assert records.json()["total"] == 1
    assert records.json()["items"][0]["masked_preview"]["email"] == "a***@example.test"
    assert records.json()["items"][0]["masked_preview"]["unfamiliar_field"] == "[available in source]"

    reused = client.post(f"/api/v1/workspaces/default/sources/{source}/imports", files={"file": ("contacts.csv", payload, "text/csv")})
    assert reused.status_code == 200
    assert reused.json()["id"] == import_id
    assert reused.json()["idempotent_reuse"] is True


def test_text_import_creates_redacted_extraction(client) -> None:
    source = source_id(client, "whatsapp_archive")
    content = b"SYNTHETIC: Contact demo.person@example.test or +91 90000 10123 for course details."
    response = client.post(f"/api/v1/workspaces/default/sources/{source}/imports", files={"file": ("messages.txt", content, "text/plain")})
    assert response.status_code == 201
    document_id = response.json()["document_id"]
    extraction = client.get(f"/api/v1/workspaces/default/documents/{document_id}/extraction")
    assert extraction.status_code == 200
    assert "demo.person@example.test" not in extraction.json()["redacted_text_preview"]
    assert extraction.json()["entity_summary"]["emails"] == 1
    assert extraction.json()["entity_summary"]["phones"] == 1


def test_invalid_import_persists_a_failure(client) -> None:
    source = source_id(client, "crm")
    response = client.post(f"/api/v1/workspaces/default/sources/{source}/imports", files={"file": ("bad.pdf", b"not-a-supported-file", "application/pdf")})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
    imports = client.get("/api/v1/workspaces/default/imports", params={"source_id": source, "status": "FAILED"})
    assert imports.status_code == 200
    assert imports.json()["total"] == 1


def test_xlsx_and_cross_source_identity_matching(client) -> None:
    from io import BytesIO

    from openpyxl import Workbook

    crm = source_id(client, "crm")
    enquiries = source_id(client, "enquiries_sheet")
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["customer_name", "email", "mobile", "purpose"])
    sheet.append(["Aarav Mehta", "aarav.match@example.test", "9000010050", "admissions"])
    stream = BytesIO()
    workbook.save(stream)
    first = client.post(f"/api/v1/workspaces/default/sources/{crm}/imports", files={"file": ("crm.xlsx", stream.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert first.status_code == 201

    second_data = b"customer_name,email,mobile,purpose\nAarav Mehta,aarav.match@example.test,9000010050,admissions\n"
    second = client.post(f"/api/v1/workspaces/default/sources/{enquiries}/imports", files={"file": ("enquiries.csv", second_data, "text/csv")})
    assert second.status_code == 201

    first_record = client.get("/api/v1/workspaces/default/records", params={"import_id": first.json()["id"]}).json()["items"][0]
    second_record = client.get("/api/v1/workspaces/default/records", params={"import_id": second.json()["id"]}).json()["items"][0]
    assert first_record["subject_ref"] == second_record["subject_ref"]
    assert second_record["match_status"] == "MATCHED"
