# DVault control plane

This service provides the migrated SQLite control plane, synthetic demo catalog, Phase 2 discovery pipeline, Phase 3 deterministic managed-message gate, Phase 4 durable rights workflows, and Phase 5 evidence-integrity and breach-readiness controls. It does not send real messages, and it does not claim legal compliance or deletion from systems outside its synthetic source stores.

## Local setup

1. Install Python 3.11 or later.
2. From this directory, create and activate a virtual environment.
3. Install the project with development dependencies: `pip install -e .[dev]`.
4. Copy `.env.example` to `.env` and replace the development secret.
5. Apply migrations: `alembic upgrade head`.
6. Seed the deterministic workspace: `dvault-seed`.
7. Ingest the full synthetic fixture library: `dvault-ingest-fixtures`.
8. Start the service: `uvicorn app.main:app --reload`.

The API documentation is then available at `/docs`; verify setup with `/api/v1/health`.

## What is real and what is synthetic

- The message gate is intentionally local: `mock_outbox` rows prove which recipients passed an execution-time policy check, but no third-party message is sent.
- Rights requests create one durable action per source. Access builds a synthetic artifact, erasure deletes rows from the isolated source stores, and withdrawal writes Phase 3 suppressions. A retention hold restricts erasure and routes the request to review instead of reporting deletion.
- Retry creates a new job and runs only pending, failed, or previously restricted actions. Completed actions are never repeated.
- `dvault-ingest-fixtures` seeds one visible retention hold, one completed access request, and a signed baseline checkpoint so the Rights Queue, Job Manager, and Security Center have real material. It does not alter fixture identities.
- Connector failure injection is disabled by default. Set `ENABLE_FAILURE_INJECTION=true` in a non-production environment and call `POST /api/v1/workspaces/{workspace_ref}/sources/{source_id}/failure-injection` to rehearse a partial failure. It is a development-only hook, not a production control.

## Evidence integrity

Every material domain mutation appends a canonical event to a per-workspace SHA-256 hash chain. `dvault-ingest-fixtures` creates a signed Ed25519 checkpoint after seeding.

- The signing key is read from `AUDIT_SIGNING_KEY` (PEM) or `AUDIT_SIGNING_KEY_PATH` (default `./.keys/audit_signing_key.pem`). Development generates a local key on first use; `.keys/` is git-ignored. Production requires an explicit key.
- `POST /api/v1/workspaces/{workspace_ref}/audit/verify` recomputes the chain, checks sequence continuity, links, payload hashes, and the checkpoint signature. The response reports the first failure and which events are untrusted.
- While an integrity incident is `OPEN`, managed campaign dispatch and rights planning/execution/retry return `409 EVIDENCE_UNTRUSTED`. Reads, policy evaluation, campaign preview, verification, and review workflows remain available.
- A reviewer resolves the incident with either `ACKNOWLEDGE_EXCEPTION` (gate opens, evidence stays untrusted) or `RESTORE_VERIFIED` (only resolves after a passing verification). A later passing verification auto-resolves the incident.
- The breach register supports manual and evidence-derived incidents, affected subject/source lookup, a 72-hour assessment timer, and deterministic draft notifications. No notification is sent.

Verification proves consistency with the recorded chain and a signed checkpoint. It does not prove that every real-world action was recorded or that recorded events are true, and it does not prevent an operator with database and key access from rewriting history.

## Tests

```bash
python -m pytest
```

On Windows, pytest's default temporary directory may be blocked by ACLs. Point it at a writable directory instead:

```bash
python -m pytest --basetemp=./.pytest-tmp
```

## Contracts

The generated live OpenAPI contract is in `contracts/openapi.json`; `contracts/phase-1-contracts.md` tracks which resource contracts are live. The managed-marketing behavior is documented in `contracts/policy-pack.md`, rights behavior in `contracts/rights-pack.md`, and evidence/breach behavior in `contracts/evidence-pack.md`.

## Contract maintenance

Run `dvault-export-openapi` after intentional public API changes, then commit `contracts/openapi.json`. The command is deliberately separate from application startup so release diffs make contract changes visible.
