# API contract snapshot

The running contract is available at `/openapi.json`. The generated `openapi.json` is committed with this project. After changing a public route or schema, run `dvault-export-openapi` from `backend/` and update the snapshot alongside the change.

The snapshot is intentionally generated from FastAPI rather than maintained by hand so the frontend does not receive a divergent specification.
