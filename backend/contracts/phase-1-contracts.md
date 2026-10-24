# DVault API contract v1

The generated [OpenAPI snapshot](openapi.json) is authoritative for live Phase 1 routes. The interfaces below are reserved contracts: their paths, resource names, status vocabulary, and core payload fields are fixed now, but they return no implementation until the indicated phase.

All routes are under `/api/v1/workspaces/{workspace_ref}`. Timestamps are UTC ISO-8601 strings; identifiers are UUIDs; request and response fields use `snake_case`.

| Phase | Reserved interface | Core contract |
| --- | --- | --- |
| 2 | `POST /imports`, `GET /imports/{import_id}` | Import request: `source_id`, `filename`, `content_type`; response: `id`, `status`, `row_count`, `schema_preview`, `warnings`. |
| 2 | `GET /records`, `GET /records/{record_id}` | Record summary: `id`, `source_id`, `subject_ref`, `field_metadata`, `match_status`; raw source content remains source-local. |
| 3 | `POST /policy-decisions/evaluate` | Request: `operation`, `subject_ref`, `purpose`, `channel`; response: `decision`, `reason_codes`, `policy_id`, `policy_version`, `evaluated_at`. Decision is exactly `ALLOW`, `DENY`, or `REVIEW`. |
| 3 | `POST /campaigns/{campaign_id}/preview`, `POST /campaigns/{campaign_id}/execute` | Recipient result: `subject_ref`, `decision`, `reason_codes`; execution re-evaluates recipients and returns outbox totals. |
| 4 | `POST /rights-requests`, `GET /rights-requests/{request_id}`, `POST /rights-requests/{request_id}/retry` | Request: `subject_ref`, `request_type`; status is `CREATED`, `PLANNING`, `EXECUTING`, `COMPLETE`, `PARTIAL`, `FAILED`, or `NEEDS_REVIEW`. |
| 4 | `GET /jobs`, `GET /jobs/{job_id}` | Job summary: `id`, `operation`, `status`, `progress`, `error_code`, `attempt_count`, `timeline`. |
| 5 | `POST /audit/verify`, `GET /audit/events`, `GET /audit/checkpoints` | Verification result: `status`, `verified_through_sequence`, `failure_sequence`, `reason_code`, `verified_at`. |
| 5 | `POST /breaches`, `GET /breaches/{breach_id}` | Breach record: `id`, `status`, `detected_at`, `assessment_due_at`, `affected_source_ids`, `affected_subject_refs`, `notification_draft`. |

Every error uses:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "User-safe explanation.",
    "details": {}
  }
}
```

Reserved interfaces must not be exposed as successful mock endpoints before their backend workflows exist.
