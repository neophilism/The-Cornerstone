# Implementation progress

## Current acceptance — 16 October 2026

PRs 1–21 and 23–39 are merged. The latest fully verified feature baseline is PR 39 head `6784147d1a9a15b5357774d77108ae61632eacd3`, tree `4a4cd16e5a34bef5a1f6890342219d81858456e0`: [application run 38928453821](https://github.com/neophilism/The-Cornerstone/actions/runs/38928453821), [source run 38928453590](https://github.com/neophilism/The-Cornerstone/actions/runs/38928453590), and metadata validation all passed. This source passed 342 unit tests and 104 private browser cases (52 desktop, 52 mobile), all database integrations, public-browser/build/proxy/worker checks, and the new actual Docker/bootstrap/API job. Counts share a baseline and must not be added across PRs.

Accepted additions cover ordinary action recovery (32), reviewed historical receipt exports and membership pagination (33), owner-policy activation messages (34), reviewed printing (35), evidence action recovery (36), deployed-public HTTP verification (37), current-access record copying (38), and repeatable local setup without external provider keys (39). Desktop/mobile receipt, print, evidence and copy captures were inspected. The merged source is ahead of the separately observed public deployment; the next release still needs its exact-commit deployment check.

The public service passed an exact-commit HTTP check at `b6891ef2d1f0fe1a63dd1c4beedcfdd99fb0ea5c` on October 16. That observation verifies the public proposal surface, closed intake and homepage CSP/content; it does not activate private hosted workflows. See [PUBLIC_RELEASE_2026-10-16.md](PUBLIC_RELEASE_2026-10-16.md). Current private-provider observations are kept separately from public source acceptance.

Membership recovery (40), a measured logical database restore rehearsal (41), and reviewed attachment download (42) have implementations and new acceptance tests. Their final CI/merge status must be checked before describing them as accepted. The restore step itself has passed in the initial candidate; that does not substitute for the complete final-head suite.

Independent human security review remains final follow-up under the owner policy. Continue developing, running substantive checks and deploying tested synthetic/public releases. Actual missing encryption, identity, custody, authority or provider controls remain engineering work; they are not supplied by an audit waiver. The whole program remains unfinished.

Historical baseline: 2026-10-12T23:32:00Z. The full program is unfinished. This reports source and engineering verification, not deployment, independent security review or government authority. The earlier private planning package remains excluded.

## October 12 accepted baseline

Observed main is `dc94adfb7085ec989c2a86aebce44ce1d0ab025a`, tree `6b51dcba56acee94a2ff879eb04122a5ae3b6cb0`. PRs **1-21 and 23-28** are merged. The separate CircleCI PR 22 remains unverified. This checkpoint records the accepted source before its release-reproducibility follow-up, not that follow-up's own test result.

Final integrated [PR 28](https://github.com/neophilism/The-Cornerstone/pull/28) head `f1c0b3d3ac2e67f4b3d5cbfc156cad355435188c` has the same tree. [Application run 38321432792](https://github.com/neophilism/The-Cornerstone/actions/runs/38321432792), [source run 38321432881](https://github.com/neophilism/The-Cornerstone/actions/runs/38321432881) and the separate metadata validator passed. The application run includes frozen installation, **292 unit tests, 19 PostgreSQL 18 integration suites, 72 private desktop/mobile browser cases**, public browser checks, all builds and compiled private-route/worker-process acceptance. Counts describe one combined source baseline; per-PR totals must not be added together.

Ten new feature screenshots and two roster screenshots were inspected across creation recovery, reviewed exports and denied draft retries, including readable mobile crops. Private artifact hashes and exact feature runs are recorded in RELEASE_HANDOFF.md. Local unit/build/proxy/worker/static checks passed; these do not assert a fresh local online install or protected-provider approval.

## Completed engineering slices

- Public proposal site, help, research chronology and download library: seven approved originals retain verified bytes; all six evidence-workbook sheets and 231 census IDs reconcile. Research never establishes individual or event eligibility.
- Synthetic case preparation: petitions, individual findings, evidence selection, assigned support, immutable receipts, versioned records, scoped access, bounded quarantined text evidence and guided financial calculations.
- Founding membership: personal consent, mixed cohorts, large-association approval, staged rosters, private ballots, frozen all-unit tallies, current-holder succession and existing-claim survival. New deceased-worker filings remain a distinct unfinished path.
- PR 15-17: governed opportunity proposals, exact runtime migration readiness and member approval of complete compact terms. Accepted-match and published-offer fixtures do not constitute independent exchange custody or real authority.
- PR 19: complete scoped activity pages, authoritative unread totals and read-in-place behavior; PostgreSQL and desktop/mobile acceptance passed in run 38260510160.
- PR 20: consent-based generic calendar files with strict current-access validation and no case content. PR 23: bounded private transport and honest uncertain-write responses. PR 21: explicit concurrent-draft review and exact-request retry. Their integrated acceptance passed; earlier browser/runner failures are historical, not current missing feature checks.
- PR 24: single-owner worker shutdown, active-transaction drain and durable unfinished leases. PR 18: source-owned E2EESA progress tracking; implementation, complete testing and independent review remain pending in that separate record.
- PR 25: synchronized accepted source and operational handoff without changing provider state.
- PR 26: new-record creation now freezes uncertain requests, retains the original retry key after a denied retry and correlates the initial record/receipt. Duplicate creation and lost/malformed acknowledgments have database/browser coverage.
- PR 27: synthetic JSON export now requires explicit disclosure review and fresh access/version checks. A concurrent saved change resets consent. Cancellation, expiry and malformed/denied reads do not export cached contents.
- PR 28: a denied retry of an already uncertain draft save no longer discards its original intent or unlocks a new save. The extended real-commit browser regression preserves one logical saved version.

Per-branch test counts share a baseline and are not additive. Detailed feature boundaries remain in the corresponding documents and PR evidence. See [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md).

## Provider state is separate

Repository schema is through 015, and the checked local bootstrap applies the exact inventory. Historical hosted migration counts are not current compatibility evidence. Verify the intended private database and restricted roles before starting its matching runtime; never infer that from a public-site deployment. Provider capacity currently limits additional test services. Production/private activation is not claimed.

## Remaining work

Complete the remaining program journeys, including new deceased-worker filings, independently held exchange choices and replay, delivery, settlement and reviewed financial reconciliation. Finish acceptance of personal membership recovery and reviewed attachment downloads, then inspect remaining delegation/session and reference-copy controls. Ordinary workflow/evidence recovery and receipt/print/record-copy paths are accepted; durable offline recovery and comprehensive data-loss prevention are not claimed.

Protected identity/device authority, recipient encryption and recovery, real evidence custody, legal notices, signatures, Treasury/institutional handoffs, release provenance and measured provider recovery remain concrete activation work. Independent human security review is deferred final follow-up, not an activation prerequisite. Real private intake, official action, payments and real rankings remain disabled. Branch protections and actual required checks must be respected; passing tests do not establish independent review or certification.

The approved `registry/roadmap.json` denominator remains 25 public tracking units with its original 11 verified mappings. Supporting PR counts do not change it or establish a whole-program completion percentage. Machine-readable refs are in `PROGRESS.json`.

## 16 October 2026 — workflow action recovery implementation

Adds immutable recovery intent to ordinary workflow command forms in both private workspaces. Lost or malformed responses and denied retries preserve the original request; confirmation reloads current permission/state rather than displaying a historical replay as current. Local baseline: 292 unit tests; updated source: 306 passing unit tests and successful package builds. New PostgreSQL and desktop/mobile scenarios are registered in required CI; their final PR results must be observed before acceptance. See ACTION_RECOVERY.md. No provider deployment or official/private production activation is claimed.

## 2026-10-16 — reviewed receipt export

Implemented a restricted, read-only receipt lookup and explicit unencrypted-download review. Cached receipts no longer download after denied current access, mismatched responses, cancellation or session expiry. Historical action versions remain distinct from the current record. Local validation passed 318 unit tests and package/API builds; real PostgreSQL and desktop/mobile browser verification are included in CI. Hosted private intake remains disabled. This is partial disclosure-path work, not whole-program completion.

## 2026-10-16 — reviewed record printing

Replaced live-workspace printing with an exact reviewed synthetic record surface, separate consent and fresh access/version checks. Print media excludes surrounding private records and unsaved forms; cancellation and late responses cannot invoke printing. Unit coverage is inherited from the checked export boundary; desktop/mobile print-media and negative-path tests run in CI. Physical printing and PDF completion remain browser/user outcomes.

## 2026-10-16 — evidence action recovery

Extended exact-request recovery to synthetic evidence uploads and validation. Bytes and metadata remain frozen after uncertain outcomes; current record access is required for server replay, and the workspace refreshes current state before another mutation. Local validation passed 322 unit tests and package/API builds. Added real PostgreSQL and desktop/mobile browser cases to CI; these checks remain required before merge.

## 2026-10-16 — current-access record reference copying

The record-ID clipboard control now discloses retention, checks current authorization, copies only the UUID and suppresses late responses after context changes. Browser denial offers a freshly authorized manual reference. Added seven unit cases plus desktop/mobile copy, denial and cancellation checks. The growing full database/browser job retains every check and now has a 20-minute budget.

## 2026-10-16 — repeatable local synthetic bootstrap

Added `pnpm setup:local` to generate private, separate local credentials and run pinned loopback PostGIS, restricted-role creation, migrations and synthetic persona seeding. Existing configuration and data are preserved; incompatible or unsafe settings are refused. Unit checks cover file permissions, repeat runs, remote/production configuration denial and environment isolation. A dedicated CI job exercises Docker setup twice and actual authenticated API access. This removes external provider keys from the local synthetic startup path; hosted protected-production integrations remain unfinished.

## 2026-10-16 — personal membership action recovery

Personal founding consent, scale choices and ballots now freeze exact uncertain requests, preserve them through denied retries and validate their historical receipt before refreshing current state. Association receipt replay requires current authorization. Added unit correlation cases, PostgreSQL replay/revocation assertions and desktop/mobile lost-response and substituted-receipt journeys. See [MEMBERSHIP_RECOVERY.md](MEMBERSHIP_RECOVERY.md); required CI results establish acceptance separately from this implementation entry.

## 2026-10-16 — database recovery rehearsal

Added actual `pg_dump`/`pg_restore` verification to the isolated PostgreSQL CI job, including ciphertext/history/receipt/audit/outbox byte comparisons, authorized decryption, wrong-key and outsider denial, schema readiness and restored access controls. Durations are measured in the job log; acceptance requires that actual job to pass. This is synthetic same-cluster logical recovery, not a production/provider recovery claim. See [DATABASE_RECOVERY_REHEARSAL.md](DATABASE_RECOVERY_REHEARSAL.md).

## 2026-10-16 — reviewed synthetic attachment download

Attachment downloads now require explicit disclosure consent, fresh metadata/access verification and bounded byte/digest validation. Cancelled and late responses cannot release a file. Added unit and desktop/mobile denial, substitution and cancellation cases; the existing original-byte download journey now exercises review and consent. See [EVIDENCE_DOWNLOAD.md](EVIDENCE_DOWNLOAD.md). No real evidence provider or legal acceptance is introduced.

## 2026-10-17 — integrated stack and membership browser navigation

The membership recovery browser journey now opens its exact resolution through the authenticated record-reference form. The previous first-page assumption timed out once accumulated suite fixtures moved that resolution beyond the page boundary; recovery, receipt correlation, one-ballot persistence and accessibility assertions remain intact. The attachment-download candidate also incorporates current main, preserving the owner-policy, public-deployment verification and shared registry changes. Required CI acceptance is recorded separately from this implementation note.

## 2026-10-17 — exact access-change recovery

Draft delegation now freezes the original grant or revocation request after an uncertain outcome, retains it across denied retries, checks receipt correlation and refreshes current permissions before another action. The workspace locks other mutations/navigation while recovering; confirmed grants require fresh consent for any later request. Added semantic unit coverage and actual synthetic desktop/mobile browser journeys for lost and substituted replies, denied retries, one-grant persistence, revoked state and accessibility. Candidate verification is separate from acceptance and hosted deployment.

## 2026-10-17 — access recovery browser fixes

[PR 45 application run 39032346308](https://github.com/neophilism/The-Cornerstone/actions/runs/39032346308) at `5378aa8de4f9d35490caa4b131f7e941536a620d` exposed three desktop failures: draft editing lacked native disabled semantics during recovery, and the current-access refresh remounted the access panel closed after a successful grant. The fix preserves only the expanded-panel preference for the same actor, realm and record. It still removes the selected record and controls during authorization refresh, reloads grants, resets recipient/scope/consent and clears the preference on session changes. All existing assertions remain; the browser journeys now hold the fresh record read to check that cached controls disappear, and verify that another record receives its own closed panel and grant list.

Local candidate verification passed 364 unit tests, both private application production builds, package/schema compilation, boundary and secret checks. The browser scenarios were collected successfully; actual PostgreSQL and desktop/mobile acceptance of this fix remains required in CI before merge. The initial restricted-sandbox unit attempt could not bind its loopback test server; the unchanged suite passed with loopback permission. No hosted change, independent audit or production activation is claimed.
