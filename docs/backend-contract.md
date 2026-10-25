# DVault API contract

The frontend is ready for the separately implemented **FastAPI + SQLite + Alembic**
backend. It uses typed repository boundaries:

- `src/data/repository.ts` → business repository
- `src/data/user-repository.ts` → personal repository

With no environment configuration each page uses its deterministic local fixture.
With `VITE_API_BASE_URL` set, it uses the HTTP repository for that page only —
`/user` never requests business data and `/business` never requests personal data.

## Configuration

```env
# .env (Vite reads this at dev/build time)
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Develop the Vite app on `5173` and FastAPI on `8000`. The API must allow CORS from
`http://localhost:5173` and `http://127.0.0.1:5173`.

## Deployment caveat

The SPA pages and the API resources deliberately share the literal names
`/user` and `/business`. In development they are on different origins. In
production they must also be on different origins/subdomains (for example
`app.example.com` and `api.example.com`), or the API must use a prefix such as
`/api/user` and `/api/business`.

Do **not** reverse-proxy `/user` and `/business` to FastAPI on the same origin
as the SPA, because those paths must serve the frontend HTML routes.

## Response shape

Every endpoint returns a complete snapshot using camelCase field names. This keeps
the UI consistent after mutations. For this demo-sized data it is simpler and
safer than partial updates; page-specific endpoints can be added later behind the
same frontend repository interfaces.

Errors use FastAPI's standard shape:

```json
{ "detail": "Required consent cannot be withdrawn." }
```

The frontend shows `detail` in its phone banner, page error state or desktop
notification, depending on context.

## Personal resource — `/user`

`GET /user` returns a `UserWorkspace` (see `src/domain/user.ts`):

```jsonc
{
  "generatedAt": "2026-10-24T17:10:00Z",
  "notice": "…synthetic data…",
  "profile": {
    "id": "usr-rowan",
    "name": "Rowan Ellis",
    "email": "rowan.ellis@synthetic.example",
    "phone": "+44 20 7946 0777",
    "location": "London",
    "memberSince": "2024-03-12T10:12:00Z",
    "synthetic": true
  },
  "sources": [
    {
      "id": "usrc-drive",
      "name": "Personal drive",
      "provider": "DVault Drive",
      "category": "storage",
      "status": "connected",
      "lastSync": "2026-10-24T16:40:00Z",
      "recordCount": 4,
      "purpose": "Documents you upload and files shared with you"
    }
  ],
  "consents": [
    {
      "id": "ucns-marketing",
      "purpose": "Marketing emails",
      "description": "Occasional product news, offers and invitations to events.",
      "granted": false,
      "required": false,
      "updatedAt": "2026-06-14T10:20:00Z",
      "channel": "Preference centre",
      "expiresAt": null
    }
  ],
  "documents": [
    {
      "id": "udoc-agreement",
      "name": "Service agreement — 2026.pdf",
      "kind": "account",
      "sourceId": "usrc-drive",
      "updatedAt": "2026-03-12T10:15:00Z",
      "sizeKb": 212,
      "sensitivity": "personal",
      "summary": "Your signed service agreement and account terms.",
      "heldSince": "12 Mar 2026",
      "retention": "Until 24 months after account closure",
      "fields": [
        { "field": "Full name", "category": "identity", "confidence": 0.98 }
      ]
    }
  ],
  "requests": [
    {
      "id": "ureq-1046",
      "reference": "U-1046",
      "type": "erasure",
      "submittedAt": "2026-10-05T14:30:00Z",
      "dueAt": "2026-11-04T14:30:00Z",
      "status": "failed",
      "steps": [
        { "id": "step-submitted-1046", "label": "Submitted", "status": "complete" },
        {
          "id": "step-collect-1046",
          "label": "Sources collected",
          "status": "failed",
          "detail": "Billing export timed out after three attempts."
        }
      ],
      "resolution": null
    }
  ],
  "activity": [
    {
      "id": "uact-1",
      "at": "2026-10-23T08:12:00Z",
      "action": "Erasure request U-1046 needs attention",
      "actor": "Rights service",
      "category": "request",
      "severity": "warning"
    }
  ]
}
```

### Personal endpoints

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/user` | — | `UserWorkspace` |
| `POST` | `/user/refresh` | — | `UserWorkspace` |
| `POST` | `/user/consents/{consentId}` | `{ "granted": true }` | `UserWorkspace` |
| `POST` | `/user/requests` | `{ "type": "access" }` | `UserWorkspace` |
| `POST` | `/user/requests/{requestId}/retry` | — | `UserWorkspace` |
| `POST` | `/user/reset` | — | `UserWorkspace` |

Semantics:

- Required consent cannot be withdrawn → `409`.
- Optional consent updates set `updatedAt` and append an activity event.
- Creating a request generates the next `U-####` reference (the seed ends at
  `U-1046`), a 30-day due date and these steps: Submitted → Identity verified →
  Sources collected → Review → Response delivered.
- Retry only reopens a failed step. It does not skip identity verification or mark
  the request complete.
- Reset restores the deterministic personal seed.

## Business resource — `/business`

`GET /business` returns the business snapshot defined by `DemoData` in
`src/domain/types.ts`:

```jsonc
{
  "seededAt": "2026-10-24T17:10:00Z",
  "notice": "…",
  "customers": [],
  "sources": [],
  "documents": [],
  "policies": [],
  "campaigns": [],
  "campaignRecipients": [],
  "rightsRequests": [],
  "jobs": [],
  "auditEvents": [],
  "checkpoints": []
}
```

### Business endpoints

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/business` | — | business snapshot |
| `POST` | `/business/refresh` | — | snapshot |
| `POST` | `/business/reset` | — | snapshot |
| `POST` | `/business/documents/{documentId}/review` | `{ "reviewStatus": "reviewed" }` | snapshot |
| `POST` | `/business/jobs/{jobId}/retry` | — | snapshot |
| `POST` | `/business/campaigns/{campaignId}/execute` | — | snapshot |
| `POST` | `/business/rights-requests/{requestId}/retry` | — | snapshot |

Semantics:

- **Review** sets `reviewStatus = "reviewed"` and raises `confidence` to at least
  `0.96`.
- **Job retry** is valid only for `status = "failed"`; set it to `retrying`, clear
  `failureSummary`, increment `attempts`, extend `maxAttempts` if exhausted, and
  append a timeline entry plus an audit event.
- **Campaign execution** sends approved recipients and holds review/block
  recipients. The campaign becomes `complete`.
- **Rights retry** reopens failed source progress rows as `pending` and sets the
  request to `in-progress`.
- **Reset** restores the deterministic business seed.

## Seed data for the backend

Both fixtures are the source of truth in this repo:

- `src/data/synthetic.ts` → business seed
- `src/data/user-synthetic.ts` → personal seed

Export them to JSON for the backend team:

```bash
npm run seed:export
```

This writes:

- `backend/app/seed/business.json`
- `backend/app/seed/user.json`

The backend can load them when the database is empty and on reset. If the
frontend fixtures change, re-run the export.

## Audit integrity

The business frontend verifies the audit chain itself with FNV-1a over:

```
prevHash|id|at|actor|action|target|category|severity
```

followed by a second hash of the same canonical string plus `::seal`.

If the backend appends events, reproduce this algorithm or return a verified
state the frontend can still validate. Never rewrite historical events; append new
ones with the previous head as `prevHash`.

## Backend ownership

The FastAPI service, SQLite schema and Alembic migrations are implemented outside
this repository. This document and the exported seed JSON are the hand-off
contract from the frontend.
