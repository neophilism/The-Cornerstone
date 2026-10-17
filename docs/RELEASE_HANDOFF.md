# Release and continuation handoff

## Current handoff — 17 October 2026, 14:40:48 UTC

Accepted main is `43c9c249b7489124cc788fac2c649e5a30a09ada`, from [PR 60](https://github.com/neophilism/The-Cornerstone/pull/60), with tested tree `f9450a2462287fe079b9906cb342c868eabbf036`. [Application](https://github.com/neophilism/The-Cornerstone/actions/runs/39040084831) and [source evidence](https://github.com/neophilism/The-Cornerstone/actions/runs/39040084681) passed on the final head. The latest accepted tree passed **522 unit tests across 42 files, 36 public browser cases and 178 private cases** (89 desktop, 89 mobile), together with the actual database/restore, builds, proxies, worker and local bootstrap checks. [Application evidence](https://github.com/neophilism/The-Cornerstone/actions/runs/39040084831). Counts are a single revision, not a sum across PRs.

Every PR in the implemented 45–60 batch has completed its checked merge. The next queue addresses the remaining program boundaries. Preserve candidate source and test repairs when integrating. All exact heads, trees and merges are in [PROGRESS.json](PROGRESS.json); the current operational sequence is in [CONTINUATION.md](CONTINUATION.md). This handoff does not pre-create its own eventual GitHub metadata.

### Observed public release

The existing [public site](https://cornerstone-policy-preview.onrender.com/) was observed live at `43c9c249b7489124cc788fac2c649e5a30a09ada`. Its [durable exact-commit HTTP check](https://github.com/neophilism/The-Cornerstone/actions/runs/39041385269) passed at **2026-10-17T14:37:05.302Z**. Render reported this exact revision live after deployment completed at `2026-10-17T14:36:57.329264Z`. The local HTTP pass at `2026-10-17T14:37:06.535Z` was working evidence; the separately completed GitHub workflow provides the durable artifact.

The hosted verifier checked 3 pages and all 7 originals totaling 4,746,977 bytes, exact manifest hashes, security/cache/content headers, conditional 304, unknown-source 404 and an exact health-SHA bracket. Sensitive intake was false. Artifact `deployed-public-preview-evidence` (ID 12103868696, 920 bytes) has SHA256 `e0f8f23ec39080fd9c91c44338336b5407726c268e731699cc83183cdf39eca7`. This is public proposal evidence, not private hosted deployment.

The earlier same-day PR 51 public release at `e655c84819e75ccb750a388de38295e0b2f38673` remains recorded in [PROGRESS.json](PROGRESS.json): provider completion `2026-10-17T13:37:08.531625Z`, local HTTP pass `2026-10-17T13:37:17.815Z`, and [durable workflow pass](https://github.com/neophilism/The-Cornerstone/actions/runs/39037185891) at `2026-10-17T13:40:48.101Z`. Its artifact was 919 bytes with SHA256 `62e5f85df76ad19a1a9bf89214ddcfe9976e4813406c6de55c98e77147f6ea42`. The older October 16 release is preserved in the historical checkpoint below.

### Actual Render service and desired Blueprint

The authorized read-only provider observation at **2026-10-17T14:28:28Z** records the existing public service on branch `cornerstone/application`, `autoDeploy: yes`, trigger `commit` and an empty HTTP health-check path. It is one active Node web-service instance on the free runtime plan in Ohio. Render therefore uses its default [TCP health probe](https://render.com/docs/health-checks). The application's `/api/healthz` route exists and is exercised by the exact HTTP verifier; it is not the configured provider health probe. This configuration read is separate from the deployed-SHA and HTTP timestamps above.

The checked-in [render.yaml](../render.yaml) instead expresses desired settings `branch: main`, `autoDeployTrigger: checksPass` and `healthCheckPath: /api/healthz`. These settings were not applied to the observed service. Release operations must follow the actual branch and its expected-old-head guard. This documentation update changes no service configuration or Blueprint. [DEPLOYMENT.md](DEPLOYMENT.md) is the canonical procedure.

### Advance an accepted public revision

1. Refresh current main, the candidate's complete actual checks/reviews and the existing `cornerstone/application` branch. Confirm the chosen merged commit has the accepted tested tree.
2. Advance that existing release branch with an expected-old-head guard and a fast-forward. Let its existing Render auto-deploy start; avoid a duplicate manual deployment.
3. Observe the exact live revision, then run the source-bound deployed-public-preview workflow. Require the fixed origin, exact commit before/after requests, all original hashes/bytes, page/content/security/cache checks, conditional 304, unknown-source 404 and closed intake.
4. Retain the verifier JSON artifact with its digest and record provider completion, HTTP pass and source acceptance separately. A queued verifier or a build in progress is not a passed release.
5. Continue independent implementation while checks run. Keep the source/HTTP snapshot bounded to actual observations rather than trying to describe this document's future merge or deployment.

### Private provider compatibility and recovery

The October 17, 13:41:30–13:45:50 UTC inspection was read-only metadata work. The existing production branch had no application tables, ledger or Cornerstone roles. Development matched applied migrations 001–010; its claim-survival child matched 001–015. Both prefixes passed the actual checksum/plan validator. Neither met either inspected full inventory, 017 or 018. The environment reported PostgreSQL 18.6/PostGIS 3.6.4; the restricted runtime metadata read succeeded. The runtime role was LOGIN and the worker role NOLOGIN, with no admin/BYPASSRLS/replication flags, memberships or owned relations; the worker had no private-table SELECT.

The first proposed migration target is the existing 015 child, advancing to the now-accepted source inventory 018. Recovery and fresh role/readiness prerequisites remain open. Keep production and the older development branch untouched initially. Before applying, secure a logical backup, an approved compatible PostgreSQL 18/PostGIS restore destination and field-key continuity, or an explicitly approved supported snapshot path. **Recovery is still an open prerequisite.** Six-hour history and no listed snapshots are not a demonstrated child rollback: Neon's current [instant-restore documentation](https://neon.com/docs/postgres/backup-restore/branch-restore) limits that facility to root branches.

Use the separate direct owner TLS connection and checked `db:check` / `db:migrate` runner, with complete prefix checksums, the `cornerstone-schema-migrations` session advisory lock and one SQL/ledger transaction per file. Neon's [pooling guidance](https://neon.com/docs/connect/connection-pooling) calls for direct migration/dump/restore connections and does not support session advisory locks through transaction pooling. Recheck exact restricted roles and configure the intended least-privileged worker login path before hosted startup. No backup, migration, role change or private case-data read was performed by this inspection.

The accepted CI restore recorded in [PROGRESS.json](PROGRESS.json) is a separate disposable synthetic test. It does not prove provider, account or recipient-key recovery, and no provider RPO/RTO is claimed. Exact configuration names are in [CONTINUATION.md](CONTINUATION.md).

### Local and protected runtime boundaries

The tested [local setup](LOCAL_SETUP.md) remains usable without external provider API keys. Hosted private startup requires the accepted revision's exact schema through 018, restricted runtime/worker roles, isolated routing and appropriate configured identity. Keep the synthetic persona bypass loopback-only.

The public service does not supply recipient/device encryption, real evidence/ranking custody, legal notices/signatures or institution/Treasury acceptance. The server-field adapter remains encryption at rest. Owner policy permits continued engineering and checked test release while independent human review is deferred; substantive source review, actual required checks and technical/transaction controls remain in force.

The active registry remains `registry/prs.json`, with 25 units, 11 original complete-unit mappings and only observed recent PR metadata/partial contributions. `registry/roadmap.json` remains a deprecated redirect. Earlier handoffs below are preserved as dated evidence.

## Historical release handoff — 17 October 2026, 12:37:56 UTC

Checkpoint: 12:37:56 UTC. Use accepted main `3fa24879d12066b5fb976a84bd1112a12a64e918` (PR 44), with the exact tested tree `717c123ffcf954951c623b5f733deecdff945421`. Its [application run 39032086554](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086554) and [source run 39032086521](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086521) passed. Counts: 356 unit, 36 public-browser and 114 private-browser cases; actual PostgreSQL, logical restore, build, proxy, worker and local bootstrap checks also passed. Exact per-PR source/merge evidence is in [PROGRESS.json](PROGRESS.json).

PR 45 is an implemented candidate at repaired head `fbd639b8518bbf01dd5e4931ca17a7604851faef`; final-head application/source runs 39033272230 and 39033272265 were queued. Keep the repaired disclosure/disabled-control behavior and appended regression tests when integrating. The original failed browser candidate is historical evidence, not the current repair result. PR 22 remains a separate unverified CircleCI proposal.

### Release the accepted public site

1. Recheck current main, candidate checks and the existing `cornerstone/application` branch. Choose a merged, fully checked commit and confirm its tree; a candidate containing additional code needs its own complete required checks.
2. Advance only the existing authorized public deployment branch by fast-forward with an expected-head guard. Its Render auto-deploy starts the build; avoid an unnecessary duplicate manual deploy.
3. Observe the exact deployed commit, then run the existing deployed-public-preview workflow. It must verify the SHA, proposal-only health, closed sensitive intake and homepage content/security headers. Record the actual URL, revision, result and time in PROGRESS.md/JSON and STATUS.md.
4. Continue the independent [scoped development queue](CONTINUATION.md) while builds run. GitHub merges, Render live status and HTTP acceptance are separate facts.

At the 12:28 UTC provider observation, the public service was still live at `0da2d023b0421802f1b0464e9cc9908a47265f77`. That commit passed [deployed verification run 38933016935](https://github.com/neophilism/The-Cornerstone/actions/runs/38933016935) at 16:36:14 UTC on October 16. There is no fresh October 17 HTTP measurement in this checkpoint and no claim that PRs 40–44 are hosted.

### Start or extend the private synthetic runtime

Use the tested local install/setup/run path in [LOCAL_SETUP.md](LOCAL_SETUP.md); it needs no external provider API keys. Hosted private work uses the explicit configuration inventory in [CONTINUATION.md](CONTINUATION.md). Confirm intended database migration inventory and separate restricted runtime/worker identities before startup. The accepted baseline requires 015; newly introduced migrations require a fresh compatibility check. Keep the local persona bypass limited to loopback synthetic development.

The accepted restore is a disposable same-cluster logical backup/restore, not provider/account/key disaster recovery. No protected identity, recipient-encryption, custody, institutional or Treasury integration is supplied by the public deployment. Owner policy permits continued engineering and checked test release while independent human security review remains deferred; actual technical and transaction controls remain in place.

The active tracking source is `registry/prs.json`; `registry/roadmap.json` is only its deprecated retirement notice. The denominator remains 25, with 11 original complete-unit mappings; newer accepted PRs are partial contributions until their full work unit is complete.

## Historical handoff — 12 October 2026

The following source, artifact and provider observations are retained as dated evidence. Current accepted source and owner policy are recorded above and in [PROGRESS.md](PROGRESS.md) and [SECURITY_SCOPE.md](SECURITY_SCOPE.md).

Observation checkpoint: 2026-10-12T23:32:00Z. Accepted main is `dc94adfb7085ec989c2a86aebce44ce1d0ab025a`, tree `6b51dcba56acee94a2ff879eb04122a5ae3b6cb0`. This supersedes the 22:34 UTC checkpoint. Source acceptance is not deployment, independent security approval or enacted authority.

## Exact accepted baseline

Final integrated PR 28 head `f1c0b3d3ac2e67f4b3d5cbfc156cad355435188c` and observed main share the exact tree above. Application 38321432792, source 38321432881 and E2EESA metadata 38321432677 passed. The application run includes online frozen installation, 292 unit tests, all builds, compiled private-route and worker-process acceptance, 19 PostgreSQL 18 integration suites, public browser checks and 72 private desktop/mobile browser cases. Local unit/build/proxy/worker/static checks also passed; local offline dependencies are not a new online install.

## Chained feature acceptance

- PR 25 handoff: head `a52d7e419df245e0b5800b00cc3ad8f40081df53`; application 38317661971 and source 38317662062 passed; documentation only.
- PR 26 creation recovery: head `f4f2d065aa93bfddff2cab56ca852b9890dc362d`, tree `b7af6aad57ea2f41954c55900c839a761240e3fe`; application 38319682293 and source 38319682238 passed. Four creation uncertainty/recovery captures inspected. Private artifact SHA256 `7c49265bd919b354ee01ceb538c90fbf38f2c9fd3c2804a3a9a8405cc28ccdce` verified. Earlier browser selector ambiguity was fixed without removing assertions.
- PR 27 reviewed JSON export: head `c346d5793b431ae0be4a2618b4d9b08deeeabadd`, tree 68d67e11602223aed2b9dedbb4d322b651b5f59f; application 38321381917 and source 38321382000 passed. Four review/changed-version and two roster captures inspected. Earlier run 38320014519 failed only the existing mobile roster fixture lookup; authenticated pagination and reference opening replaced the first-page assumption without removing assertions. Private artifact SHA256 `a7b7eb2cdbdd08751a883b8822de75fe922a31c429719e6d8fe56c102fe91977` verified.
- PR 28 denied draft retry: head `f1c0b3d3ac2e67f4b3d5cbfc156cad355435188c`, tree 6b51dcba56acee94a2ff879eb04122a5ae3b6cb0; application 38321432792 and source 38321432881 passed. Two denied-retry captures inspected. Private artifact SHA256 `82ca5b109a9816537f9b085e1f49bb167e3c19311e33ad5c51b1447fa49d2bbc` verified. New unit tests failed against the old behavior and passed with the fix restored.

Final integrated source artifact SHA256 `306a391e6b1ee056681c69c06570fb8c925f816bd4feb767552a258d6660337d` and internal checksums were verified; reconstructing its tracked files produced tree `6b51dcba56acee94a2ff879eb04122a5ae3b6cb0`. The snapshot alone is not a test result or signature.

Every accepted candidate was checked for safe GitHub mergeability and current-base tree equivalence before merge. All existing CI commands, README guidance, original policy bytes, applied migration bytes, registry mappings and independent assessment fields were preserved. No required check was bypassed and no independent review is claimed. Test totals share the same baseline and are not additive.

Historical pre-chain baseline remains PR 18 head `f3ee2d76b3a83b4c7fda70347715de95c5611c3a`, tree 97962feb8c315a34680a0c990513dbe19a13d33b, application 38313896033 and source 38313895710. Its downloaded source/internal checksums were verified; artifact SHA256 `d2f657a7493f0c2a2db6ae75de2eb9e9862543731e9dae82dc230d6bfdc6c29a`. Earlier accepted feature evidence remains in the respective PR records.

## Reproducible database test image

The GitHub database service is pinned to `postgis/postgis:18-3.6@sha256:60f6ad1d21ea86a67d47780b9a0d1e1d200500f62b19293fa834d0dea80b8677`, the exact digest pulled in passing application run 38319682293, database job 115044519623 at 22:59:12 UTC on October 12. This removes a mutable tag from the test prerequisite; it does not change migrations, hosted resources or authority.

Updating the digest is a deliberate reviewed dependency change: inspect the release/provenance, preserve the intended PostgreSQL/PostGIS compatibility, then run the complete migration, permission, runtime, integration and browser suites on the final candidate. A pin establishes stable bytes, not freshness, vulnerability absence or independent security approval. The pinning PR's own current-head checks remain a separate merge gate; the checkpoint above describes its accepted application baseline.

## Preserved owner work and current gates

PR 18 is merged and supplies assessment metadata, not completed E2EESA implementation or independent expert review. `security/e2eesa-status.json` and its pinned standard remain unchanged; all three assessment stages remain pending.

PR 22 remains open at `1c8539ae70bc5433d902455859d731ea775e0bbe`. A prepared CircleCI configuration is not a connected, green replacement for GitHub Actions. Preserve it and reconcile newer tests before its separate acceptance. Do not remove the working GitHub verification path.

Earlier pre-step GitHub failures and the older local Chromium administrator-policy denial remain historical evidence. Newer remote workflows execute successfully. Never change browser administrator controls or bypass a required check to reproduce a test.

## Continuing integration

Use the current merged tree as the baseline. Creation recovery, reviewed JSON export and denied draft retries are accepted. Continue remaining non-draft mutation and receipt/print/copy boundaries, followed by complete program journeys. These protections do not cover every mutation or disclosure in the workspace. Preserve the server's access checks and exact idempotency contract.

Keep every existing CI command: draft and creation recovery, reviewed record export, activity and pagination, worker drain/process, private proxy HTTP, identity/access, evidence, membership, succession, claim survival, governance, compact, association scale, record pages, financial journeys, migration inventory, public/private browsers and source/security metadata checks. Do not resolve shared-file conflicts by dropping tests or approved instructions. Re-run the final integrated candidate and inspect affected views before merging.

Fresh isolated synthetic databases prevent fixture-heavy suites interfering with each other. Separate owner/runtime/worker credentials and immutable applied migration bytes remain mandatory. No test repair may delete or weaken hosted records, RLS, production guards or required technical checks and release protections.

## Infrastructure and activation

No Neon/Render resource was changed or newly inspected by this handoff. Earlier October 12 inspection recorded main development through 010, claim-survival child through 013 and production without application tables. Repository SQL is 015. Compatible schema verification must precede any private runtime deployment; the public site is database-independent. A successful local or CI migration is not promotion to a hosted branch.

The repository's Render URL alone does not establish availability, deployed commit, project assignment or protected configuration. Complete protected identity/device and recovery architecture, recipient encryption, real evidence custody/scanning/retention, independent ranking custody, valid notices, signatures, institution/Treasury acceptance and measured provider recovery before activation. Prepared/queued commands are not external acceptance.

Keep `registry/roadmap.json` and `registry/prs.json` unchanged unless their established acceptance/approval rules are satisfied. Their 25 units and 11 mappings are scoped tracking, not a percentage of operational completion. Source originals and the private-planning publication boundary remain unchanged.
