# Cornerstone

A public policy website and scoped application for private preparation and synthetic program training. Official legal and financial actions require verified authority and institutional integration; they are disabled in the initial release.

[Open the public website](https://cornerstone-policy-preview.onrender.com/). The repository contains the public site, participant and staff workspaces, API, worker, database migrations, shared policy engines and tests. This is a working initial release; the full program is unfinished.

## Development

Use Node 24, the pinned pnpm version and Docker with Compose v2. Run `pnpm install --frozen-lockfile`, `pnpm setup:local`, then `pnpm dev`. Setup generates private local credentials, starts loopback PostGIS, creates restricted roles, applies migrations and seeds synthetic personas; no external API keys are needed for local synthetic workflows. The public site uses port 3000, portal 3001, staff 3002, and API 4010. Read [local setup](docs/LOCAL_SETUP.md) for repeat runs and existing configurations, or [manual development](docs/DEVELOPMENT.md) for custom settings. Never use real private data in simulation.

`pnpm test` checks policy guards, matching, finance, security, and API behavior. `pnpm test:db` requires an isolated PostgreSQL/PostGIS database and separate restricted-runtime credentials. `pnpm test:e2e` runs public browser journeys; `pnpm test:private` runs synthetic portal and staff journeys after building and seeding the isolated database. Database migrations use a separate owner connection. No command wipes a database.

Synthetic in-app activity uses migration 004 and a separate `cornerstone_worker` connection. Set `NOTIFICATION_PROVIDER=in-app` and `WORKER_DATABASE_URL` only in isolated development; the default is disabled. `node --import tsx tests/activity.integration.ts` exercises actual worker SQL and recovery. Read `docs/ACTIVITY_AND_CALENDAR.md` for setup and the distinction between activity and legal service. Worker startup, single-owner shutdown and unfinished-lease recovery are described in `docs/WORKER_LIFECYCLE.md`.

Session controls and owner-managed draft access use migrations 005–006. Migration 007 adds bounded synthetic text evidence with explicit quarantine and validation; set EVIDENCE_STORAGE_PROVIDER=synthetic-postgres only for invented development data. Real document intake remains disabled. Read docs/SESSION_AND_ACCESS.md and docs/EVIDENCE.md. Migration 008 adds personal founding consent, membership inspection and private synthetic member ballots; see docs/MEMBERSHIP_AND_VOTING.md. Migration 009 extends that adapter with private larger-association scale choices and bulk unit creation. Guided evidence and claim preparation are described in docs/GUIDED_JOURNEYS.md; staged roster import is described in docs/ROSTER_PREPARATION.md.

## Deployment

Render hosts the application services; Neon supplies PostgreSQL. `render.yaml` describes the public release. Production sensitive intake, real rankings, payment execution, and official activation remain gated. Resource credentials belong in the providers' secret configuration. Read `docs/DEPLOYMENT.md` and `docs/STATUS.md` before deployment.

The seven approved source originals are preserved in `policy/` with verified hashes and download links. The research explorer imports all six workbook sheets and reconciles 231 census IDs; entries remain research-only. Run `python scripts/import-research.py --check` to verify extraction using the documented offline dependencies.

The private API and enabled worker require the exact compiled migration inventory before startup. Run `pnpm check:schema` after changing migrations and read `docs/RUNTIME_READINESS.md` for checked generation, upgrade and rollback rules. This does not activate protected production.

Read `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/CONTINUATION.md` and `docs/PROGRESS.md` to continue the implementation. The earlier internal planning package remains private pending separate publication approval. Synthetic fixtures cannot certify events or people.

## Roadmap verification

The owner's approved public-implementation tracking baseline is [registry/roadmap.json](registry/roadmap.json) with exact, verified PR mappings in [registry/prs.json](registry/prs.json). It contains 25 publicly documented tracking units, including 11 mapped merged PRs as of its observation timestamp; see [Engine Room tracking notes](docs/ENGINE_ROOM_TRACKING.md). This is **not** a reconstruction or release of the earlier private planning package, nor an assertion that the whole program is 44% operationally complete. Detailed implementation evidence is in [docs/PROGRESS.md](docs/PROGRESS.md).

Synthetic founding-unit succession, unchanged frozen votes and predecessor-ballot privacy are described in `docs/SUCCESSION.md`. Continuing an existing un-enrolled claim is described in `docs/CLAIM_SURVIVAL.md`. Apply all checked migrations before running the matching API revision; the public site has no database dependency. Neither route activates real probate, identity, legal-notice or private-intake services.

The synthetic inbox supports scoped continuation pages and a full unread count; see `docs/ACTIVITY_PAGES.md`. Marking an update read is not legal service.

Draft editing preserves unsaved input through version conflicts and supports exact-request retry after an uncertain save. See `docs/DRAFT_RECOVERY.md` for explicit comparison, permission checks and the in-memory-only recovery boundary.

Private portal/staff transport preserves uncertain write outcomes and enforces bounded, non-cached requests. After building those apps, `pnpm test:proxy` checks their compiled routes against a synthetic loopback upstream. See `docs/PRIVATE_PROXY.md`; these HTTP checks do not replace browser acceptance or protected-production review.

## End-to-End Everywhere progress

The canonical [security/e2eesa-status.json](security/e2eesa-status.json) records standard implementation, complete testing and independent expert review separately. Engine Room reads it automatically from GitHub. All initial stages are pending; existing profile locks and approved decisions remain authoritative. Read [adoption and independent-account instructions](docs/E2EESA_ADOPTION.md), and run `python3 scripts/validate_e2eesa_status.py`. Record validation does not establish product security or certification.

Synthetic record exports require an explicit review, disclosure consent and fresh access/version checks. See `docs/RECORD_EXPORT.md`; downloaded copies are unencrypted and cannot be recalled.

New-record creation freezes uncertain requests and recovers their original receipt without sending an edited duplicate. See `docs/CREATION_RECOVERY.md` for the in-memory boundary, denied retries and current-access checks.

Ordinary workflow actions preserve one exact request after an uncertain response, validate the recovered receipt and reload current permissions/state before the next action. See [workflow action recovery](docs/ACTION_RECOVERY.md).

Receipt downloads now require explicit review and consent plus a fresh authenticated lookup of the requesting actor’s own receipt and current record access. Historical receipts are labeled as synthetic and cannot be mistaken for external acceptance. See [receipt export](docs/RECEIPT_EXPORT.md).

Private record printing uses a separate reviewed copy with fresh access and version checks. The live workspace is excluded from print media. See [record printing](docs/RECORD_PRINTING.md).

Personal founding consent and member ballots retain their exact request after an uncertain outcome, including denied retries. See [membership recovery](docs/MEMBERSHIP_RECOVERY.md) for current-access replay and the in-memory recovery boundary.

Synthetic attachment downloads require disclosure consent, fresh access and exact byte verification. See [attachment download review](docs/EVIDENCE_DOWNLOAD.md).

Draft delegation preserves exact uncertain grant/revocation requests and refreshes current access after receipt recovery. See [session and access controls](docs/SESSION_AND_ACCESS.md).
