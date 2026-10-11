# ADR-001 — Render and Neon

Status: accepted by explicit user direction, 10 October 2026.

Host the separately scoped application services on Render and relational data on Neon. Preserve the modular TypeScript architecture and policy/security boundaries. Use standard PostgreSQL connections, pooled runtime connections, separate direct migration credentials, and transaction-local authorization context. Do not use a database-owner connection for the application.

Do not provision a redundant Render PostgreSQL instance or replace the user's Neon branch. Inspect the supplied resources before attaching services or applying migrations. Separate simulation from proposal and eventual program-owned production. The first public deployment has no official legal authority and no real sensitive intake until its gate is satisfied.

Evidence storage and custody are provider adapters, not local filesystem persistence in Render production. PostgreSQL outbox jobs provide initial durable dispatch without introducing a new queue vendor. An independently governed recovery journal and ranking-key service still require separate verified arrangements before legal acceptance or real rankings.

References: https://render.com/docs/blueprint-spec ; https://render.com/docs/monorepo-support ; https://neon.com/docs/connect/connection-pooling ; https://www.postgresql.org/docs/current/ddl-rowsecurity.html . Recheck actual service configuration before release; this ADR does not attest current infrastructure controls.
