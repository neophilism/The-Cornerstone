# Release and continuation handoff

## Current release handoff — 17 October 2026

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
