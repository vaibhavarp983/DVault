def test_health_and_dashboard_are_database_backed(client) -> None:
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["fixture_manifest"] == "ready"

    dashboard = client.get("/api/v1/workspaces/default/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["source_total"] == 4
    assert dashboard.json()["document_total"] == 11
    assert dashboard.json()["workflow_summary"]["active_jobs"] == 0


def test_document_pagination_filtering_and_errors(client) -> None:
    records = client.get("/api/v1/workspaces/default/documents", params={"document_type": "invoice", "page_size": 1})
    assert records.status_code == 200
    assert records.json()["total"] == 1
    document = records.json()["items"][0]
    assert document["synthetic_label"] == "synthetic_demo_data"
    assert document["preview_reference"].startswith("documents/")

    missing = client.get("/api/v1/workspaces/default/documents/not-an-id")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"

    invalid = client.get("/api/v1/workspaces/default/documents", params={"page": 0})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_workspace_and_source_return_standard_errors(client) -> None:
    workspace = client.get("/api/v1/workspaces/unknown-workspace")
    assert workspace.status_code == 404
    assert workspace.json()["error"]["code"] == "WORKSPACE_NOT_FOUND"

    source = client.get("/api/v1/workspaces/default/sources/not-an-id")
    assert source.status_code == 404
    assert source.json()["error"]["code"] == "SOURCE_NOT_FOUND"
