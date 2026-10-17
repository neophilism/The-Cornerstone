# Engine Room implementation tracking

Checkpoint: **17 October 2026, 14:40:48 UTC**. The owner-approved public baseline remains **25 units**, with one active source: [registry/prs.json](../registry/prs.json). `registry/roadmap.json` remains its deprecated redirect and is not an alternative plan.

| Measure                         | Recorded state                                    | Meaning                                                                             |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Approved baseline               | 25 units; roadmap version 2                       | Unchanged public tracking scope.                                                    |
| Original complete-unit mappings | 11, CS-01 through CS-11                           | Existing explicit mappings preserved.                                               |
| Remaining baseline units        | 14                                                | Bounded contributions do not establish complete-unit acceptance.                    |
| Observed GitHub PRs             | 60                                                | Actual numeric IDs, state, timestamps and exact heads; snapshot ends at real PR 60. |
| Merged source PRs               | 59                                                | Source activity, not a count of completed work units.                               |
| Open PRs                        | 1 — PR 22                                         | GitHub state at the observation time; PR 22 remains a separate proposal.            |
| Latest accepted source          | PR 60, `43c9c249b7489124cc788fac2c649e5a30a09ada` | Full source/tree/workflow evidence in PROGRESS.json.                                |
| Observed public revision        | `43c9c249b7489124cc788fac2c649e5a30a09ada`        | Separate provider observation and exact HTTP verification.                          |

The original 11/25 ratio is **44% of explicit baseline mappings**. It is not whole-program readiness. This checkpoint adds real recent PR metadata and `contributingPrs` while leaving every unit ID, title, origin, existing complete mapping, dependency and denominator intact. It does not pre-create metadata for the checkpoint's own eventual PR.

New filings contribute to CS-13, financial review to CS-07/22, state publication and compact binding to CS-19/21, matching continuation to CS-20, disclosure/session boundaries to CS-06/15/16, and public release/CI evidence to CS-24/25. The register's `remainingAcceptance` and [CONTINUATION.md](CONTINUATION.md) state the unfinished scope. Synthetic publication does not complete objections/supervision; a pure matching library does not complete custody; session fixes do not complete protected recipient recovery.

Only map an entire unit when its whole acceptance is established. Fetch actual GitHub observations before changing PR state or `observedAt`, and preserve exact IDs/heads/timestamps. A denominator change requires an approved scope change and roadmap-version update; no such change is made here. Live GitHub owns later events and must be refreshed before a merge/release decision.

The snapshot records `mergeCommitSha` only when `mergedAt` is present; it stays null for an unmerged PR. GitHub's mutable `merge_commit_sha` on an open PR is a temporary test merge, so that raw value is not recorded as an accepted merge.

Run `node scripts/validate-pr-registry.mjs` and `node --test registry/pr-contract.test.mjs` after edits. Keep accepted source, pending CI, observed deployment, public HTTP evidence, protected runtime readiness, provider recovery, independent assessment and official authority distinct. Deferred human review does not become a development dependency. The earlier private planning package and its original unit count remain unpublished.
