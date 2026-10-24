# DVault Phase 1 control plane

This service provides the migrated SQLite control plane and synthetic demo catalog for DVault. It does not yet ingest customer records or make policy decisions.

## Local setup

1. Install Python 3.12 or later.
2. From this directory, create and activate a virtual environment.
3. Install the project with development dependencies: `pip install -e .[dev]`.
4. Copy `.env.example` to `.env` and replace the development secret.
5. Apply migrations: `alembic upgrade head`.
6. Seed the deterministic workspace: `dvault-seed`.
7. Start the service: `uvicorn app.main:app --reload`.

The API documentation is then available at `/docs`; verify setup with `/api/v1/health`.

The generated live OpenAPI contract is in `contracts/openapi.json`; `contracts/phase-1-contracts.md` fixes the resource vocabulary for the later backend phases without presenting those workflows as implemented.

## Contract maintenance

Run `dvault-export-openapi` after intentional public API changes, then commit `contracts/openapi.json`. The command is deliberately separate from application startup so release diffs make contract changes visible.
