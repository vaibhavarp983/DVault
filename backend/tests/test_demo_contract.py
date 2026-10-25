BASE = "/api/v1/workspaces/default/demo"


def test_demo_snapshot_matches_the_v1_contract(client) -> None:
    response = client.post(f"{BASE}/reset")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["schemaVersion"] == "demo-v1"
    assert body["workspace"]["ref"] == "aranya-coaching-centre"
    assert {
        "schemaVersion",
        "workspace",
        "generatedAt",
        "notice",
        "contactMode",
        "customers",
        "sources",
        "documents",
        "policies",
        "activePolicy",
        "campaigns",
        "campaignRecipients",
        "rightsRequests",
        "rightsHolds",
        "jobs",
        "auditEvents",
        "checkpoints",
        "integrity",
        "breaches",
        "demo",
    } <= set(body)

    document = body["documents"][0]
    assert {
        "id",
        "name",
        "kind",
        "sourceId",
        "customerIds",
        "subjectCount",
        "importState",
        "sensitivity",
        "reviewStatus",
        "confidence",
        "fields",
        "schema",
        "missing",
        "preview",
    } <= set(document)
    assert document["preview"]["kind"] in {
        "invoice",
        "purchase-order",
        "email-thread",
        "conversation",
        "consent-record",
        "table",
        "form",
        "note",
        "report",
        "rights-request",
    }

    integrity = body["integrity"]
    assert {
        "status",
        "evidenceState",
        "trustedThroughSequence",
        "failureSequence",
        "reasonCode",
        "failures",
        "gateState",
        "incidentId",
        "checkpointStatus",
        "disclaimer",
        "incidents",
        "breachCounts",
    } <= set(integrity)
    assert "does not establish" in integrity["disclaimer"]

    assert body["demo"]["resetAvailable"] is True
    assert body["demo"]["syntheticContactsAvailable"] is True
    assert body["demo"]["userSubjectRef"]
