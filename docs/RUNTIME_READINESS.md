# Runtime schema compatibility

The private API and enabled activity worker refuse to start until their restricted connection reports exactly the compiled migration inventory. A missing reader, pending migration, unexpected newer schema, missing historical file or checksum disagreement is not treated as readiness. A database-free public site remains independent.

`node scripts/schema-inventory.mjs --write` generates `packages/store/src/schema-inventory.ts` directly from every migration byte. Commit that generated inventory with each new migration. `pnpm check:schema`, included in `pnpm build:packages`, rejects missing or stale generated output. It never connects to or changes a database. The existing checked migration runner remains the only migration mechanism.

Migration 015 introduces a read-only, security-definer inventory reader with a fixed search path and explicitly qualified ledger. Only the restricted runtime and worker roles can call it. They gain no direct ledger access, writes, actor records, evidence or session data. Existing applied SQL files remain immutable. Provider errors are replaced with a non-sensitive readiness failure.

## Deployment and rollback

Use a separate migration-owner connection to run `pnpm db:check` and `pnpm db:migrate` on the intended isolated branch before starting the matching application. Verify the migration output, role restrictions, representative private journeys and read-only health checks. Do not pass owner credentials to the API, portals or worker.

The check deliberately requires an exact version set. A previous application build must not start against a newer unreviewed schema. Do not solve rollback by editing the ledger or deleting a migration: use an assessed forward-compatible application fix or the documented database recovery procedure. This initial mechanism is a startup gate, not an online DDL protection mechanism. Do not migrate a database concurrently with a serving protected release; coordinate maintenance until a separately reviewed rolling-upgrade protocol exists.

Checksums describe which migration files the owner recorded. They do not prove live SQL definitions are untouched, validate backups, replace source/release review or confer E2EE/security conformance. Production migration and institutional activation remain separate controlled actions. Independent security assessment is deferred follow-up, not an implementation or deployment prerequisite. The supplied production database is not changed by this work.

## Verification

The unit suite exercises exact equality and failure for missing, reordered, duplicate, unknown or changed metadata, plus failure-message redaction and the single read-only query. `tests/runtime-schema.integration.ts` runs on separate restricted runtime/worker connections after migration and verifies the inventory, denial of direct ledger reads/writes and lack of PUBLIC execute permission. CI runs this before seeding or browser acceptance. Record actual run evidence in PROGRESS.md; adding a gate is not a claim that production was released.

Local verification on October 12, 2026: 84 unit tests passed; the API and worker builds passed; restricted PostgreSQL 16.15 runtime/worker inventory checks passed. Direct process probes confirmed that an older schema fails before listening and that a matching schema serves its health check. Full feature CI and provider deployment are not implied by these local results.
