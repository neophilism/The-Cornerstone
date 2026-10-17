# Engine Room implementation tracking

Checkpoint: 17 October 2026, 12:37:56 UTC. The owner-approved public implementation baseline remains **25 units**. The single active machine-readable source is [registry/prs.json](../registry/prs.json), validated with the shared `registry/pr-contract.mjs` contract. `registry/roadmap.json` is a deprecated retirement notice and must not be read or rewritten as an alternative plan.

## What the numbers mean

| Measure                         | Recorded state                                         | Interpretation                                                                        |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Approved baseline units         | 25                                                     | Original public tracking scope; unchanged denominator                                 |
| Original complete-unit mappings | 11                                                     | CS-01 through CS-11 retain their explicit PR mappings                                 |
| Other baseline units            | 14                                                     | Partial implementation is recorded without declaring complete acceptance              |
| Observed GitHub PRs             | 45                                                     | Actual IDs, creation/update/close/merge timestamps and heads from the GitHub API      |
| Merged source PRs               | 43                                                     | PRs 1–21 and 23–44; source activity, not a work-unit count                            |
| Open source PRs                 | 22 and 45                                              | Separate CircleCI proposal; repaired access recovery awaiting final-head acceptance   |
| Accepted source                 | PR 44 merge `3fa24879d12066b5fb976a84bd1112a12a64e918` | Exact checked source/tree/run evidence in PROGRESS.json                               |
| Public deployment               | Older `0da2d023b0421802f1b0464e9cc9908a47265f77`       | Separately observed Render revision; last HTTP verification is separately timestamped |

The original 11/25 calculation is 44% of this scoped baseline's explicit mappings. It is not a whole-program readiness percentage. Recent work belongs in `contributingPrs` until the entire owning unit meets its acceptance criteria. In particular, synthetic evidence downloads do not complete real evidence custody, a logical restore does not complete protected operations, and access-receipt recovery does not complete protected identity/recovery.

## Updating the register

Fetch actual GitHub observations before changing `observedAt` or PR state. Preserve numeric GitHub IDs, real timestamps and exact heads. Retain the immutable unit IDs, titles, origins and existing completed mappings. Add real supporting PR numbers only to the appropriate unit's `contributingPrs`; never infer completion from PR order or a similar title. `remainingAcceptance` explains the unfulfilled scope; [CONTINUATION.md](CONTINUATION.md) supplies the next scoped changes.

A new completed mapping needs evidence for the entire unit. A changed denominator requires its approved scope change and a roadmap-version update. These October 17 metadata and contribution updates do neither. Live GitHub still owns current open/merged state, and Boardroom/Engine Room must refresh it before decisions.

Run `node scripts/validate-pr-registry.mjs` and `node --test registry/pr-contract.test.mjs` after edits. Record source acceptance, pending CI, provider revision, HTTP checks, protected runtime readiness, independent assessment and official authority separately. Do not let a deferred human audit become a development dependency. The earlier private planning package and its original unit count remain unpublished.
