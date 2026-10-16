# Run the complete local synthetic workspace

Install Node 24, the repository's pinned pnpm version, and Docker with Compose v2. Start Docker, then run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

Open <http://localhost:3001> for the participant workspace or <http://localhost:3002> for staff. Choose one of the explicitly seeded synthetic personas. The public site is at <http://localhost:3000>. No external identity, storage, email or other API key is needed for these local synthetic workflows. Invented test information only; this does not activate real intake, official decisions, financial transfers or independently held rankings.

Setup generates a private, owner-readable `.env` with distinct random database credentials, session and field-encryption keys. The pinned PostGIS container listens only on `127.0.0.1:5432`. Setup creates restricted runtime and worker roles, applies the complete checksum-checked migration inventory, and seeds synthetic personas and routing. API and worker startup independently verify schema readiness. The migration owner credential is excluded from application child processes.

Repeated setup preserves existing credentials, data and the database volume. It refuses an incompatible existing `.env`, a symlink or broadly readable credentials. If you already have a custom configuration, keep it and follow [DEVELOPMENT.md](DEVELOPMENT.md); the automatic path does not rewrite your settings. If the local port is occupied or Docker is unavailable, setup stops with the existing files and data retained. Do not replace credentials while reusing a database initialized with different ones.

Stop development with Ctrl+C. Stop the database without deleting its data:

```sh
docker compose --project-name cornerstone-local --env-file .env -f infra/compose.yaml stop
```

Keep `.env` private and out of Git. Local authentication is restricted to loopback synthetic development. Hosted identity and protected-production providers remain separate integrations; local setup is not a production deployment recipe.

CI runs the actual Docker bootstrap twice, checks that the settings bytes remain unchanged, builds the API, and verifies real HTTP login, current-schema readiness, unauthenticated denial and cross-origin denial with the generated runtime account. `pnpm test:local-setup` runs that HTTP check against a fresh API process after `pnpm --filter @cornerstone/api build`; stop any development API first so port 4010 is available.
