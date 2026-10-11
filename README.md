# Cornerstone

A public policy website and scoped application for private preparation and synthetic program training. Official legal and financial actions require verified authority and institutional integration; they are disabled in the initial release.

[Open the public website](https://cornerstone-policy-preview.onrender.com/). The repository contains the public site, participant and staff workspaces, API, worker, database migrations, shared policy engines and tests. This is a working initial release; the full program is unfinished.

## Development

Use Node 24 and the pinned pnpm version. Run `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm dev`. The public site uses port 3000, portal 3001, staff 3002, and API 4010. Copy `.env.example` to `.env` and configure a local PostgreSQL/PostGIS database before persistent workflows. Never use real private data in simulation.

`pnpm test` checks policy guards, matching, finance, security, and API behavior. `pnpm test:db` requires an isolated PostgreSQL/PostGIS database and separate restricted-runtime credentials. `pnpm test:e2e` runs public browser journeys; `pnpm test:private` runs synthetic portal and staff journeys after building and seeding the isolated database. Database migrations use a separate owner connection. No command wipes a database.

Synthetic in-app activity uses migration 004 and a separate `cornerstone_worker` connection. Set `NOTIFICATION_PROVIDER=in-app` and `WORKER_DATABASE_URL` only in isolated development; the default is disabled. `node --import tsx tests/activity.integration.ts` exercises actual worker SQL and recovery. Read `docs/ACTIVITY_AND_CALENDAR.md` for setup and the distinction between activity and legal service.

Session controls and owner-managed draft access use migrations 005–006. Migration 007 adds bounded synthetic text evidence with explicit quarantine and validation; set EVIDENCE_STORAGE_PROVIDER=synthetic-postgres only for invented development data. Real document intake remains disabled. Read docs/SESSION_AND_ACCESS.md and docs/EVIDENCE.md.

## Deployment

Render hosts the application services; Neon supplies PostgreSQL. `render.yaml` describes the public release. Production sensitive intake, real rankings, payment execution, and official activation remain gated. Resource credentials belong in the providers' secret configuration. Read `docs/DEPLOYMENT.md` and `docs/STATUS.md` before deployment.

The seven approved source originals are preserved in `policy/` with verified hashes and download links. The research explorer imports all six workbook sheets and reconciles 231 census IDs; entries remain research-only. Run `python scripts/import-research.py --check` to verify extraction using the documented offline dependencies.

Read `AGENTS.md`, `docs/DEVELOPMENT.md` and `docs/PROGRESS.md` to continue the implementation. The earlier internal planning package remains private pending separate publication approval. Synthetic fixtures cannot certify events or people.

## Roadmap verification

The canonical roadmap marker is [registry/roadmap.json](registry/roadmap.json). Its `planVerified: false` and zero planned-PR count concern the unpublished full planning package, not the amount of implemented code. No total planned PR count is asserted. Actual implementation and verification evidence are maintained in [docs/PROGRESS.md](docs/PROGRESS.md).
