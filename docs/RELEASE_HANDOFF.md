# Release and continuation handoff

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

Fresh isolated synthetic databases prevent fixture-heavy suites interfering with each other. Separate owner/runtime/worker credentials and immutable applied migration bytes remain mandatory. No test repair may delete or weaken hosted records, RLS, production guards or independent-review requirements.

## Infrastructure and activation

No Neon/Render resource was changed or newly inspected by this handoff. Earlier October 12 inspection recorded main development through 010, claim-survival child through 013 and production without application tables. Repository SQL is 015. Compatible schema verification must precede any private runtime deployment; the public site is database-independent. A successful local or CI migration is not promotion to a hosted branch.

The repository's Render URL alone does not establish availability, deployed commit, project assignment or protected configuration. Complete protected identity/device and recovery architecture, recipient encryption, real evidence custody/scanning/retention, independent ranking custody, valid notices, signatures, institution/Treasury acceptance, independent review and measured provider recovery before activation. Prepared/queued commands are not external acceptance.

Keep `registry/roadmap.json` and `registry/prs.json` unchanged unless their established acceptance/approval rules are satisfied. Their 25 units and 11 mappings are scoped tracking, not a percentage of operational completion. Source originals and the private-planning publication boundary remain unchanged.
