# DVault

Two device-style simulators for data governance, built with React, Vite, TypeScript and Tailwind.

| Route | Experience |
| --- | --- |
| `/` | Simulator chooser — personal phone or business desktop |
| `/user` | Smartphone-style personal privacy app |
| `/business` | Windows-style business desktop with the DVault workspace and File Explorer |
| `/demo` | Redirects to `/business` for older links |

## What is included

### `/business` — desktop simulator

- Windows-like shell: wallpaper, desktop icons, Start menu with search and deep links, taskbar, live clock, calendar, notifications and show-desktop.
- Cascading, movable, resizable windows with minimise/maximise/restore/close and preserved in-app state.
- **DVault** workspace with an internal side panel:
  - **Overview** — governance health, source connectivity, policy outcomes, rights pressure, job progress and audit integrity.
  - **Records** — source/import filters, searchable record library, details, detected fields, schema preview and classification review.
  - **Vault** — sealed documents, collections, previews, record seals and a lock simulation.
- **File Explorer** — a navigable `DVault (D:)` drive with breadcrumbs, history, sorting and a preview pane.

### `/user` — smartphone simulator

- Phone frame with status bar, dynamic island, side power button and lock screen.
- Home screen with privacy widget, latest activity, quick actions, app grid and dock.
- In-phone apps:
  - **My data** — sources, searchable records, detail sheet, retention and field classification.
  - **Consent** — optional consent toggles, required service consent and consent health.
  - **Requests** — access/erasure/portability/rectification requests, step progress, retries and a new-request sheet.
  - **Activity** — consent, access and request events with filters.
  - **Sources** — linked systems, purposes and retention context.
  - **Profile** — synthetic identity, data footprint, repository mode, reset and a link to the business desktop.
  - **Help** — plain-language privacy guidance.
- Action notices appear as in-phone banners, not Windows notifications.

## Data modes

The UI reads through typed repository boundaries, never from fixture arrays directly.

- **Local mode** (default): deterministic synthetic data, no network requests and no persistence.
- **API mode**: set `VITE_API_BASE_URL` to use the separately hosted FastAPI/SQLite backend.

```bash
cp .env.example .env
# uncomment: VITE_API_BASE_URL=http://127.0.0.1:8000
```

Each simulator fetches only its own resource:

- `/user` uses `HttpUserRepository` (`GET /user`, consent and request mutations).
- `/business` uses `HttpBusinessRepository` (`GET /business`, record review, job retry, campaign execute, rights retry, reset).

The expected endpoints, JSON shapes, mutation semantics, CORS, SQLite/Alembic notes and deployment caveats are in [docs/backend-contract.md](docs/backend-contract.md). The backend service itself lives outside this repository and is being implemented separately.

## Synthetic data

- All identities, companies, documents and events are synthetic. Emails use `synthetic.example`.
- Business seed: 6 customers, 5 sources, 28 records, policies, campaign recipients, rights requests, jobs and a sealed FNV-1a audit chain.
- Personal seed: one synthetic identity, 4 sources, 8 records, 5 consents, 3 rights requests and an activity timeline.
- Export both fixtures as JSON for the backend team:

```bash
npm run seed:export
# writes backend/app/seed/business.json and backend/app/seed/user.json
```

Restore synthetic state at any time:

- Business desktop → Start → Power → **Reset demo data**.
- Personal phone → Profile → **Restore synthetic data**.

## Run it

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm run preview
```

Validation:

```bash
npm test
npx tsc -b
```

## Architecture

```
src/
  pages/                    Route entry points (chooser, phone, business desktop, 404)
  apps/
    user/phone/             Smartphone simulator, home screen and in-phone apps
    vault/                  Business workspace shell + Vault section
    control-center/         Business Overview section
    data-explorer/          Business Records section
    file-explorer/          Standalone desktop File Explorer
    app-meta.ts             Desktop app registry
  components/
    shell/                  Desktop, windows, taskbar, Start menu, flyouts
    ui/                     Design-system primitives
  data/
    config.ts               VITE_API_BASE_URL + mode selection
    http.ts                 Shared JSON transport and API errors
    repository.ts           Business repository contract
    service.ts              Local business repository + mode selection
    api-service.ts          HTTP business repository (/business)
    user-repository.ts      Personal repository contract
    user-service.ts         Local personal repository + mode selection
    user-api.ts             HTTP personal repository (/user)
    synthetic.ts            Business seed
    user-synthetic.ts       Personal seed
    selectors.ts            Business view models
    user-selectors.ts       Personal view models
  domain/                   Typed business and personal contracts
  store/                    Business, window and personal providers
docs/backend-contract.md    API contract for the separate backend team
scripts/export-seed.ts      Exports both synthetic seeds as JSON
```

The business audit trail is a real FNV-1a hash chain seeded at load time; verification and tamper detection are computed, not faked.

## Production hosting

`BrowserRouter` routes require an SPA rewrite to `index.html` for `/`, `/user` and `/business`. The frontend and API share the literal resource names `/user` and `/business`, so in production keep the API on a separate origin/subdomain (as documented in the contract) rather than proxying those paths on the SPA origin.

## Next phases

The domain contract already includes campaigns, recipients, policies and jobs. Phase 2 can add Policy Center, Message Gate and Rights Queue as additional DVault sections without changing the repository boundaries. The personal simulator can grow additional consent and request flows against the same `/user` contract.
