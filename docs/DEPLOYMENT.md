# Deployment

Owner policy (16 October 2026): continue implementation, substantive security testing, checked merges and test deployment. Independent human security review is deferred to the final follow-up; it is not a prerequisite for this work. Preserve actual cryptographic, authorization, privacy, data-integrity and transaction controls, required checks and honest assessment metadata. Never label AI-assisted testing an independent audit or certification.

The public site is the deployable proposal release. It has no database dependency and does not accept private submissions. `render.yaml` selects a free Node service in Ohio. Configure `PUBLIC_ORIGIN` to its actual HTTPS URL. Build with the pinned Node/pnpm versions and deploy only a tested commit. The public service health route is `/api/healthz`.

The Render connector currently cannot attach a newly created service to a project/environment. Assigning the service to the chosen project environment is a separate dashboard operation. Do not alter unrelated services. A free public service can sleep and is not a protected-intake service-level agreement.

Private API and worker releases require the complete checked migration inventory through 015 on their intended database. Determine current hosted compatibility from a fresh authorized inspection; historical branch counts are not deployment instructions. Keep migration-owner credentials separate from restricted runtime and worker connections. API-created Neon roles can bypass RLS and must not be used for runtime. Pool operations use transaction-local subject and realm settings. Public deployment has no private database dependency.

Run migrations through a direct owner connection, with advisory locking and checksum verification. Never pass migration credentials to an application or browser. Runtime startup rejects administrative/bypass-RLS/table-owner credentials. Require TLS verification for provider connections. A production schema migration is a separately reviewed action, with a tested recovery path and explicit approval.

Existing-claim control requires migration 013 because historical reconstruction reads its version-owner sidecar; startup readiness requires 015. Apply immutable migrations with exact prior-checksum guards and transaction locks. Do not edit an applied migration or start a private runtime against an older inventory.

Local development uses synthetic personas and separate public (3000), portal (3001), staff (3002), and API (4010) processes. Load `.env` through the root development script. Generate fresh 32-byte base64 field/session keys; do not reuse fixture values. Enable local persona access only with the exact development/simulation/localhost settings. Never host that bypass or put real private data in simulation. The optional in-app worker uses its separate restricted connection and no encryption or session keys. Unconfigured external notices and payment jobs remain pending. See ACTIVITY_AND_CALENDAR.md.

CI uses a disposable PostGIS database with separate owner/runtime roles. `pnpm test:db` exercises RLS, conflicted-owner/delegate denial, concurrency, idempotent historical replies, stale versions, encrypted records and immutable receipts. `pnpm test:private` starts loopback-only browser workspaces with freshly generated synthetic keys and no migration credentials in application processes; it exercises draft persistence, assigned support, receipts, origin/CSRF enforcement, scoped evidence and access, voluntary consent, membership inspection, and private voting on desktop and mobile. These checks do not attest protected production security or official authority.

Before protected services are activated: complete recipient-device encryption and recovery architecture, real identity onboarding, evidence custody/scanning/retention, independently sealed ranking custody, legally valid notices, approved signatures/court/regulator handoffs and Treasury reconciliation. Real provider success requires actual external acceptance; a queued command is insufficient. Authority must be verified per jurisdiction and function. This release refuses protected production activation.

References: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Node version](https://render.com/docs/node-version), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Neon migrations](https://neon.com/docs/guides/schema-migrations), [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## Verified local and public paths

`pnpm setup:local` generates separate private credentials, starts pinned loopback PostGIS, applies migrations and seeds synthetic personas. It was verified by actual Docker and API checks, including a repeat run preserving credentials. See [LOCAL_SETUP.md](LOCAL_SETUP.md).

The public deployment branch is `cornerstone/application`. Advance it only to a verified release; its existing auto-deploy configuration starts the build. The deployed-preview workflow checks the exact commit, proposal-only health, closed intake and homepage CSP/content. Public health evidence and its timestamp are separate from private-provider configuration. See [PUBLIC_RELEASE_2026-10-16.md](PUBLIC_RELEASE_2026-10-16.md).

New test services currently require available provider capacity. Do not repurpose unrelated services or create paid commitments to bypass an account limit. Continue local/CI synthetic implementation when hosted capacity is unavailable.
