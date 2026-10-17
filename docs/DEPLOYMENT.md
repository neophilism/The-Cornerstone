# Deployment

The public site is the proposal release. It has no private database dependency and does not accept private submissions. [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) records the latest accepted source, actual provider configuration and exact HTTP evidence; [PROGRESS.json](PROGRESS.json) preserves their separate timestamps and revisions. A build, checked merge and observed deployment are different facts.

## Existing public service

Use the existing authorized [public Render service](https://cornerstone-policy-preview.onrender.com/) and its configuration observed by a read-only provider call at **2026-10-17T14:28:28Z**:

| Setting                         | Observed existing service | Desired checked-in Blueprint |
| ------------------------------- | ------------------------- | ---------------------------- |
| Release branch                  | `cornerstone/application` | `main`                       |
| Automatic deployment trigger    | `commit`                  | `checksPass`                 |
| Provider HTTP health-check path | Empty; default TCP probe  | `/api/healthz`               |

Automatic deployment is enabled (`autoDeploy: yes`). The provider reported one active Node web-service instance on the free runtime plan in Ohio. The desired values are in [render.yaml](../render.yaml); this handoff does not apply them. Render documents [TCP probes as the default](https://render.com/docs/health-checks). The application exposes `/api/healthz` for exact-revision HTTP verification even though the observed service does not use that path as its provider health check. A Blueprint file alone is not evidence of live configuration, and the configuration-read timestamp is not a new HTTP measurement.

Build with the pinned Node/pnpm versions and the repository build/start commands. Keep `PUBLIC_ORIGIN` set to the actual HTTPS URL, proposal realm/mode, local authentication off and sensitive intake false. After verifying the candidate's complete actual final-head checks, safe mergeability and tested merge tree, advance the existing release branch by fast-forward with an expected-old-head guard. Its commit-triggered auto-deploy starts the build. Observe the exact resulting live commit before recording deployment.

Run the [deployed public acceptance workflow](DEPLOYED_PUBLIC_ACCEPTANCE.md). It verifies the fixed public origin and expected commit before and after requests, **three public pages and all seven approved originals totaling 4,746,977 bytes**, manifest hashes, content/security/cache headers, conditional 304 and an unknown-source 404. It also requires proposal-only health and closed sensitive intake. Retain the actual JSON artifact, hash, run and HTTP timestamp; a queued verifier is pending evidence. See the [current handoff](RELEASE_HANDOFF.md) for the latest result and earlier releases.

## Exact private schema and identities

This source tree contains immutable migrations **001–018**. Private API and worker startup require the exact complete compiled inventory for their chosen commit. Migration 015 introduced inventory readiness; it is not the current terminal migration. The later files add deceased-worker filings (016), financial review (017) and synthetic state offers (018). An older accepted commit can have its own smaller exact inventory, but a new runtime must not start against that older database merely because 015 exists.

Obtain a fresh authorized compatibility inspection before hosted changes. Keep the migration owner separate from restricted runtime and worker identities; inspect actual flags, ownership and grants rather than trusting a role name. Runtime startup rejects administrative, bypass-RLS and table-owning credentials. Require TLS verification and transaction-local subject/realm context. Do not send owner credentials to an application or browser.

Use the direct owner connection with the checked `db:check` / `db:migrate` runner. Preserve complete prior checksums, the session advisory lock and per-file SQL/ledger transaction; never edit applied migration bytes. [Neon pooling guidance](https://neon.com/docs/connect/connection-pooling) calls for direct migration/dump/restore connections; transaction pooling does not provide the session advisory lock this runner uses. The intended private target needs its concrete authorized migration scope and tested recovery path before application.

The read-only inspection from **2026-10-17 13:41:30–13:45:50 UTC** found development prefixes 010 and 015, with production lacking application tables/roles. Neither development branch matched the inspected full 017 or 018 inventory. The [handoff](RELEASE_HANDOFF.md#private-provider-compatibility-and-recovery) records the proposed existing-child target and the open secured-backup/compatible-restore/key-continuity prerequisite. A six-hour history setting does not establish child-branch recovery. No provider migration or role change is performed by this documentation update.

## Local and CI verification

The tested `pnpm setup:local` path generates private credentials, starts pinned loopback PostGIS, applies the complete schema and seeds invented personas. Actual Docker/API acceptance includes repeated setup preserving credentials. See [LOCAL_SETUP.md](LOCAL_SETUP.md). The root development process loads local configuration for public, portal, staff and API processes; keep the persona bypass limited to exact loopback development/simulation settings. Generate fresh session/field keys and preserve their continuity when testing recovery.

The complete database integration sequence and logical backup/restore run once in the CI database job. Desktop/mobile browser projects each use a separate fresh PostGIS service, restricted roles, full schema, personas, ephemeral field key and explicit fixture setup. [PRIVATE_BROWSER_CI.md](PRIVATE_BROWSER_CI.md) records the jobs and strict success aggregate. These tests include authorization, current-session disclosure, concurrency, exact historical replies and immutable state; they do not attest protected production or provider recovery.

## Protected integrations and authority

Owner policy permits implementation, substantive AI-assisted source/security review, required testing, checked merges and test deployment while independent human review remains deferred follow-up. Preserve actual cryptographic, authorization, privacy, integrity and transaction controls; no independent audit or certification is claimed.

Protected activation still requires usable recipient/device encryption and recovery, real identity onboarding, evidence custody/scanning/retention, independent sealed-choice custody, valid notices/signatures and jurisdiction/function authority, plus actual institutional and Treasury acceptance. Queued provider commands do not prove external acceptance. The current server-field adapter remains encryption at rest, and the public proposal release supplies none of those integrations.

Use the precise configuration inventory in [CONTINUATION.md](CONTINUATION.md). Continue local/CI implementation when hosted prerequisites are unavailable. Reuse authorized resources, keep unrelated projects separate, and obtain the required cost authorization before creating paid capacity.
