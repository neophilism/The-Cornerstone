# Deployment

The public site is the deployable proposal release. It has no database dependency and does not accept private submissions. `render.yaml` selects a free Node service in Ohio. Configure `PUBLIC_ORIGIN` to its actual HTTPS URL. Build with the pinned Node/pnpm versions and deploy only a tested commit. The public service health route is `/api/healthz`.

The Render connector currently cannot attach a newly created service to a project/environment. Assigning the service to the chosen project environment is a separate dashboard operation. Do not alter unrelated services. A free public service can sleep and is not a protected-intake service-level agreement.

Development schema work uses a separately named Neon development branch. No application migration has been applied to production. PostgreSQL 18 and PostGIS 3.6 are used. Migration credentials are separate from the restricted `cornerstone_runtime` role. API-created Neon roles can bypass RLS; do not use such a role for runtime. Pool connections use transaction-local subject and realm settings.

Run migrations through a direct owner connection, with advisory locking and checksum verification. Never pass migration credentials to an application or browser. Runtime startup rejects administrative/bypass-RLS/table-owner credentials. Require TLS verification for provider connections. A production schema migration is a separately reviewed action, with a tested recovery path and explicit approval.

Local development uses synthetic personas and separate public (3000), portal (3001), staff (3002), and API (4010) processes. Load `.env` through the root development script. Generate fresh 32-byte base64 field/session keys; do not reuse fixture values. Enable local persona access only with the exact development/simulation/localhost settings. Never host that bypass or put real private data in simulation. The worker deliberately leaves unconfigured notices and payment jobs pending.

Before protected services are activated: complete recipient-device encryption and recovery architecture, independent review, real identity onboarding, evidence custody/scanning/retention, independently sealed ranking custody, legally valid notices, approved signatures/court/regulator handoffs and Treasury reconciliation. Real provider success requires actual external acceptance; a queued command is insufficient. Authority must be verified per jurisdiction and function. This release refuses protected production activation.

References: [Render Blueprint specification](https://render.com/docs/blueprint-spec), [Node version](https://render.com/docs/node-version), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Neon migrations](https://neon.com/docs/guides/schema-migrations), [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
