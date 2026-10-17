# Implementation progress

## Current acceptance — 17 October 2026, 12:37:56 UTC

GitHub confirms PRs **1–21 and 23–44** merged: 43 source changes. Current accepted main is `3fa24879d12066b5fb976a84bd1112a12a64e918`, with tree `717c123ffcf954951c623b5f733deecdff945421`, identical to tested PR 44 head `1949c920a6ac2f3b8ba6fb5dda15b35794c52d37`. [Application run 39032086554](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086554) and [source run 39032086521](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086521) succeeded. The application logs record **356 unit tests, 36 public browser cases, and 114 private browser cases (57 desktop, 57 mobile)**, plus production builds, actual PostgreSQL suites, compiled private-proxy and worker checks, and repeat-run Docker/bootstrap/API verification. Counts describe one integrated source tree and are not additive across PRs.

| Accepted PR                                                 | Result                                                                                              | Merge commit                               | Passing application / source runs                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [40](https://github.com/neophilism/The-Cornerstone/pull/40) | Exact personal consent and ballot recovery                                                          | `b6f4071b7b7874ccab84f22c2bc19a1b7ded1c9f` | [38930758816](https://github.com/neophilism/The-Cornerstone/actions/runs/38930758816) / [38930758835](https://github.com/neophilism/The-Cornerstone/actions/runs/38930758835) |
| [41](https://github.com/neophilism/The-Cornerstone/pull/41) | Real isolated PostgreSQL backup/restore with encrypted-history and access checks                    | `3301357c42e507f0629bfca1b532298a16e2559f` | [39031995820](https://github.com/neophilism/The-Cornerstone/actions/runs/39031995820) / [39031995747](https://github.com/neophilism/The-Cornerstone/actions/runs/39031995747) |
| [42](https://github.com/neophilism/The-Cornerstone/pull/42) | Explicit attachment review, current access and exact-byte download verification                     | `cdc8cdd20b9229b7b0c47c2ed7f7fbe000b99f3d` | [39032146072](https://github.com/neophilism/The-Cornerstone/actions/runs/39032146072) / [39032146089](https://github.com/neophilism/The-Cornerstone/actions/runs/39032146089) |
| [43](https://github.com/neophilism/The-Cornerstone/pull/43) | Release evidence and owner-directed review policy reconciled                                        | `661491c367b863628fd78060f19d7333b0a36729` | [39032075729](https://github.com/neophilism/The-Cornerstone/actions/runs/39032075729) / [39032075619](https://github.com/neophilism/The-Cornerstone/actions/runs/39032075619) |
| [44](https://github.com/neophilism/The-Cornerstone/pull/44) | Historical grant/revocation replay requires current ownership; replay cannot restore revoked access | `3fa24879d12066b5fb976a84bd1112a12a64e918` | [39032086554](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086554) / [39032086521](https://github.com/neophilism/The-Cornerstone/actions/runs/39032086521) |

PRs 41–44 merged with trees equal to their verified heads. Exact heads, trees, merge timestamps and runs are retained in [PROGRESS.json](PROGRESS.json). Source review checked the restore boundary, download consent/byte correlation and current-owner replay; this is AI-assisted engineering review, not an independent human audit. The integrated restore checked six tables and measured 1,084 ms backup, 1,139 ms restore and 136 ms verification in its disposable same-cluster fixture. Those timings do not establish provider disaster-recovery RPO or RTO.

**Implemented candidate:** PR 45 remains open at repaired head `fbd639b8518bbf01dd5e4931ca17a7604851faef`. It preserves exact uncertain access changes and the disclosure preference through a fresh authorized refresh. [Application run 39033272230](https://github.com/neophilism/The-Cornerstone/actions/runs/39033272230) and [source run 39033272265](https://github.com/neophilism/The-Cornerstone/actions/runs/39033272265) were queued at this observation. The initial browser failure and its repair are recorded below; local validation is not final-head acceptance. PR 22 remains the separate, unverified CircleCI proposal.

**Public deployment:** Render reported `0da2d023b0421802f1b0464e9cc9908a47265f77` live at 12:28 UTC on October 17. That same commit passed [exact-commit public HTTP run 38933016935](https://github.com/neophilism/The-Cornerstone/actions/runs/38933016935) at 16:36:14 UTC on October 16. The provider observation is newer than the HTTP check. Accepted main has not yet been observed deployed at this checkpoint; no hosted private activation or schema change follows from these source merges.

The 25-unit plan and original 11 completed mappings remain unchanged. Later PRs are recorded as partial contributions in the single active [registry/prs.json](../registry/prs.json), not additional completed units. See [CONTINUATION.md](CONTINUATION.md) for the next scoped changes and [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) for release steps. Historical checkpoints below are retained as dated evidence.

## Historical acceptance — 16 October 2026

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

Complete the remaining program journeys, including new deceased-worker filings, independently held exchange choices and replay, delivery, settlement and reviewed financial reconciliation. Finish PR 45 access-form recovery acceptance and the remaining session/reference controls. Personal membership recovery, reviewed attachment downloads and the logical restore rehearsal are accepted through PR 44. Durable offline recovery and comprehensive data-loss prevention are not claimed. See the current dependency-ordered queue in CONTINUATION.md.

Protected identity/device authority, recipient encryption and recovery, real evidence custody, legal notices, signatures, Treasury/institutional handoffs, release provenance and measured provider recovery remain concrete activation work. Independent human security review is deferred final follow-up, not an activation prerequisite. Real private intake, official action, payments and real rankings remain disabled. Branch protections and actual required checks must be respected; passing tests do not establish independent review or certification.

The active `registry/prs.json` denominator remains 25 public tracking units with its original 11 verified complete-unit mappings; `registry/roadmap.json` is only a deprecated retirement notice. Supporting PR counts do not change it or establish a whole-program completion percentage. Machine-readable refs are in `PROGRESS.json`.

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

## 2026-10-17 — new deceased-worker claim preparation

Added a personal synthetic standing packet and an explicit action that opens one new eligibility draft for a deceased worker. Assigned review binds the worker, applicant and requested capacity to immutable receipts. The worker reservation serializes competing approvals and ordinary personal-claim creation; opening saves its packet receipt, one draft, a creation receipt and the initial case-control link atomically. The original worker’s livelihood and injury still require separate evidence and a separate decision. Estate capacity and the original rights holder continue through the existing personal membership and founding-roll procedures. See [DECEASED_WORKER_FILINGS.md](DECEASED_WORKER_FILINGS.md).

Read-only source review identified and corrected a mixed-role boundary: every staff action on the packet and generated claim now excludes the worker, applicant and current or former holders while requiring current assigned Labor scope. The new PostgreSQL suite covers those exclusions, one-claim races, current-access replay, rollback, correction rebinding, existing transferred claims and estate enrollment. Desktop/mobile browser journeys exercise the standing-to-draft flow and exact recovery after a committed opening response is lost.

Local candidate verification passed 368 unit tests, shared package builds, API compilation, the complete format check, 108-module boundary scan, secret scan and exact 16-migration inventory. Both new browser journeys collect successfully. Actual PostgreSQL and desktop/mobile execution remains required CI acceptance; neither collection nor source review is presented as a passing runtime test. No provider deployment, official authority, protected intake or real identity/probate service was activated.

## 2026-10-17 — independent synthetic financial appeal

Annual state-share records now continue from appeal through independent assignment, synthetic hearing scheduling, bounded evidence submission, a closed hearing record and a reasoned affirm-or-correct decision. Original source terms and calculation remain visible; selected evidence hashes and validation revisions are frozen at hearing closure. Every adjudication excludes the owner and prior calculators and requires current independent staff scope. Missing routing is a definitive rollback; uncertain committed decisions retain exact receipt recovery. See [FINANCIAL_REVIEW.md](FINANCIAL_REVIEW.md) for Federal §6(d), State §5(f), the synthetic notice-clock assumption and remaining settlement work. Local integrated validation passed 415 unit tests, package/API/portal/staff builds, format/boundary/secret checks and the exact 17-migration inventory. The new desktop/mobile journey and adapted existing finance tests collect; actual PostgreSQL and browser CI execution remains required before acceptance. No payment, refund, legal service or production activation is performed.

## 2026-10-17 — current-session record opening

Direct record opening now verifies the authenticated actor and realm, the exact requested record and its matching permission version. Changing a reference or leaving the view cancels the pending opening, so a late reply cannot replace a newer selection. Separate session request generations prevent an earlier successful read or expiry response from altering a new sign-in; a current-session 401 still clears private state before its body is parsed. Refreshing after an externally changed HTTP session clears the earlier actor’s records, selection, receipt, form, reference and search state before waiting for the new page, including when that page fails. See [RECORD_OPENING.md](RECORD_OPENING.md).

After integration on financial-review commit `1f66fef299ec6d09075e2c6708d58bb118d80ddc`, the source-reviewed candidate passed 421 unit tests, shared/API/portal/staff builds, full formatting, the 113-module boundary scan, secret/source-integrity checks and the exact 17-migration inventory. Ten new desktop/mobile cases collect successfully; actual browser and PostgreSQL acceptance remains required in CI. The existing restricted-role reference suite now asserts response context and record/capability binding. No database migration, provider change, device-authority claim or hosted sign-in bypass was introduced.
