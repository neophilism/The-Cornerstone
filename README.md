# Cornerstone

A public policy website and scoped application for private preparation and synthetic program training. Official legal and financial actions require verified authority and institutional integration; they are disabled in the initial release.

## Development

Use Node 24 and the pinned pnpm version. Run `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm dev`. The public site uses port 3000, portal 3001, staff 3002, and API 4010. Copy `.env.example` to `.env` and configure a local PostgreSQL/PostGIS database before persistent workflows. Never use real private data in simulation.

`pnpm test` checks policy guards, matching, finance, security, and API behavior. `pnpm test:db` requires an isolated PostgreSQL/PostGIS database and separate restricted-runtime credentials. `pnpm test:e2e` runs browser journeys. Database migrations use a separate owner connection. No command wipes a database.

## Deployment

Render hosts the application services; Neon supplies PostgreSQL. `render.yaml` describes the public release. Production sensitive intake, real rankings, payment execution, and official activation remain gated. Resource credentials belong in the providers' secret configuration. Read `docs/DEPLOYMENT.md` and `docs/STATUS.md` before deployment.

Original design documents and the full development package are excluded from this public code change pending explicit publication approval. Research imports require operator-supplied, publication-approved source files. Synthetic fixtures are clearly labeled and cannot certify events or people.
