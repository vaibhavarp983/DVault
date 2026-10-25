BASE = "/api/v1/workspaces/default/demo"


def _reset(client) -> dict:
    response = client.post(f"{BASE}/reset")
    assert response.status_code == 200, response.text
    return response.json()


def _held_conversations(snapshot: dict) -> list[dict]:
    return [row for row in snapshot["conversations"] if row["holdActive"]]


def _unheld_conversations(snapshot: dict) -> list[dict]:
    return [row for row in snapshot["conversations"] if not row["holdActive"]]


def test_seeded_conversations_are_chained_and_held_correctly(client) -> None:
    snapshot = _reset(client)
    assert len(snapshot["conversations"]) >= 5
    assert snapshot["retentionPolicy"]["activeDays"] == 14
    assert {tier["key"] for tier in snapshot["withdrawalTiers"]} == {
        "marketing-only",
        "all-optional",
        "full-withdrawal",
    }
    assert snapshot["messageIntegrity"]["status"] == "verified"
    held = _held_conversations(snapshot)
    unheld = _unheld_conversations(snapshot)
    assert held and unheld
    assert {row["interactionLevel"] for row in unheld} >= {"LOW", "MEDIUM", "HIGH"}
    for conversation in snapshot["conversations"]:
        assert conversation["messages"]
        previous = "0" * 64
        for message in conversation["messages"]:
            assert message["previousHash"] == previous
            previous = message["messageHash"]
        assert all(message["tamperState"] == "VERIFIED" for message in conversation["messages"])


def test_business_and_customer_can_share_one_thread(client) -> None:
    snapshot = _reset(client)
    conversation = next(row for row in snapshot["conversations"] if row["holdActive"])
    response = client.post(
        f"{BASE}/conversations/{conversation['id']}/messages",
        json={"body": "A business follow-up from the desktop app."},
    )
    assert response.status_code == 201, response.text
    updated = next(row for row in response.json()["conversations"] if row["id"] == conversation["id"])
    assert updated["messages"][-1]["body"] == "A business follow-up from the desktop app."
    assert updated["messages"][-1]["previousHash"] == conversation["messages"][-1]["messageHash"]

    user = client.get(f"{BASE}/user")
    assert user.status_code == 200, user.text
    user_conversation = next(row for row in user.json()["conversations"] if row["id"] == conversation["id"])
    assert user_conversation["unreadForCustomer"] >= 1
    read = client.post(f"{BASE}/user/conversations/{conversation['id']}/read")
    assert read.status_code == 200, read.text
    user_conversation = next(row for row in read.json()["conversations"] if row["id"] == conversation["id"])
    assert user_conversation["unreadForCustomer"] == 0


def test_retention_purges_unheld_content_but_keeps_hashes_and_holds(client) -> None:
    snapshot = _reset(client)
    held_ids = {row["id"] for row in _held_conversations(snapshot)}
    response = client.post(f"{BASE}/retention/run")
    assert response.status_code == 200, response.text
    after = response.json()
    run = after["retentionRuns"][0]
    assert run["skippedHold"] >= len(held_ids)
    assert run["reduced"] >= 1
    assert run["purged"] >= 1
    assert after["messageIntegrity"]["status"] == "verified"
    for conversation in after["conversations"]:
        states = {message["retentionState"] for message in conversation["messages"]}
        if conversation["id"] in held_ids:
            assert states == {"FULL"}
            assert all(message["body"] for message in conversation["messages"])
        elif conversation["interactionLevel"] == "HIGH":
            assert states == {"FULL"}
        elif conversation["interactionLevel"] == "MEDIUM":
            assert states == {"METADATA"}
            assert all(message["body"] is None for message in conversation["messages"])
        else:
            assert states == {"PURGED"}
            assert all(message["body"] is None for message in conversation["messages"])
        for message in conversation["messages"]:
            if message["retentionState"] != "FULL":
                assert message["messageHash"]


def test_tamper_injection_flags_message_and_clear_restores_it(client) -> None:
    snapshot = _reset(client)
    target = next(
        message
        for conversation in snapshot["conversations"]
        for message in conversation["messages"]
        if message["retentionState"] == "FULL"
    )
    response = client.post(f"{BASE}/failures", json={"kind": "message_tamper", "targetId": target["conversationId"]})
    assert response.status_code == 200, response.text
    flagged = response.json()
    assert flagged["messageIntegrity"]["status"] == "flagged"
    flagged_conversation = next(row for row in flagged["conversations"] if row["id"] == target["conversationId"])
    assert flagged_conversation["integrityState"] == "FLAGGED"
    assert any(message["tamperState"] == "FLAGGED" for message in flagged_conversation["messages"])

    cleared = client.post(f"{BASE}/failures/clear")
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["messageIntegrity"]["status"] == "verified"


def test_withdrawal_tier_applies_consent_and_honours_hold(client) -> None:
    _reset(client)
    response = client.post(f"{BASE}/user/withdraw", json={"tier": "full-withdrawal"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["retentionPolicy"] is not None
    consent_state = {row["purpose"]: row["granted"] for row in body["consents"]}
    assert consent_state["Service delivery"] is True
    assert consent_state.get("Marketing messages") is False
    assert any(row["trigger"] == "WITHDRAWAL" for row in body.get("retentionRuns", [])) or body["messageIntegrity"]["status"] == "verified"
    assert any(row["holdActive"] for row in body["conversations"])


def test_retention_policy_rejects_high_reduction(client) -> None:
    _reset(client)
    response = client.post(
        f"{BASE}/retention-policy",
        json={
            "activeDays": 14,
            "mediumDays": 90,
            "highMinMessages": 5,
            "mediumMinMessages": 2,
            "actions": {"HIGH": "PURGED", "MEDIUM": "METADATA", "LOW": "PURGED"},
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RETENTION_POLICY_INVALID"
