# Frozen matching and failed-negotiation continuation

The matching package now validates the complete supplied continuation state before calculating a successor allocation. This is a bounded CS-20 foundation. It does not activate the Exchange, receive private rankings, establish legal authority, or provide ranking custody, consent, a witnessed draw or an authenticated history of negotiations.

## Source and policy boundary

The approved [Federal Cornerstone draft](../policy/Federal_Cornerstone_Bill.docx), §5(b)–(c), supplies the common priority rule, fixed public tie order, original acceptable rankings, protection of surviving matches and one active match per Association. On failure, the unsuccessful Association advances to its next choice while the returned offer is available to the next willing eligible Association without an active match. The paired [Model State draft](../policy/Model_State_Cornerstone_Enabling_Act.docx), §3(d), preserves that Exchange process. Both documents are proposals, and their original bytes remain unchanged.

The frozen readiness flags must be literal booleans: only `ready: true` and `unremedied: true` are accepted. Truthy strings, numbers and objects are rejected before either initial matching or failed-negotiation continuation; synthetically typed clients do not establish runtime validity.

The pure calculation uses the original round's applicant identities, constituent identities, publication versions, non-overlapping rights, eligibility lists, actual priority dates and fixed draw order. It cannot establish whether a caller has supplied the authoritative current version of those facts. The future custody and workflow adapter must bind them to authenticated immutable records and independently released choices before real use.

## Input contract

| Input                 | Required meaning and validation                                                                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `round`               | One frozen round with nonblank identities, unique applicants/offers, identified non-overlapping constituents, complete fixed tie order, valid dates and named publication versions. Each eligibility list contains only known applicant identities and no duplicates. |
| `active`              | Current surviving and newly failed negotiation pairs from this round. Every pair must be ranked and eligible. Each applicant and offer appears at most once. A pair cannot regress to an already failed or earlier rank.                                              |
| `failed`              | The exact pair currently failing; it must occur in `active`. A valid but inactive pair cannot be substituted.                                                                                                                                                         |
| `willingApplicantIds` | Unique known applicants who are willing to continue. A listed applicant with another active match stays in that match. Omitted applicants receive no new match.                                                                                                       |
| `declinedPairs`       | Cumulative failed or declined **negotiations** in this round, not new rankings or an arbitrary offer blacklist. Pairs must be unique, ranked and eligible. The current failed pair may already be present. A surviving match cannot also be declined.                 |

Failure history establishes a monotone cursor within each original ranking. A previously unsuccessful applicant starts after its furthest failed negotiation; a newly free, earlier-ranked offer cannot rewind that applicant's progress. An unmatched applicant with no failed negotiation retains its original acceptable list. A current active pair older than its recorded failure history is rejected instead of silently preserved.

The calculation removes only the current failed pair from active holdings, preserves every other valid active match, restricts new matching to willing applicants without a surviving match, and uses the original loss priority and fixed public draw. Published eligibility lists are reduced to those remaining applicants without changing their original eligibility. No applicant is assigned an unranked, ineligible or already-held offer.

## Reproducibility and identifiers

Opaque applicant and offer identifiers are kept exactly as supplied. Pair membership uses an encoded two-element tuple, so punctuation in an identifier cannot make distinct pairs collide. No UUID-format restriction or identifier rewriting is introduced.

Report ordering and proposal-queue ordering use explicit JavaScript string ordering instead of host-locale collation. This makes the same frozen input produce the same order across host locales; the statutory priority still uses the original date and fixed public draw. Existing non-ASCII report ordering can differ from earlier source revisions, so a future replay artifact must bind the exact tested source revision as well as its algorithm identifier. No previously authenticated Exchange transcript is migrated or claimed here.

The function does not mutate caller-owned objects or arrays. Repeating a calculation or permuting the supplied applicant, offer, active-pair and willingness arrays preserves the output allocation. The ordering of each applicant's ranking and the public tie order remain meaningful and must never be permuted as part of that equivalence.

## Verification

The original six matching tests remain unchanged, including the independent exhaustive 800-case comparison and 1,000 seeded reference rounds. The new continuation suite adds independent expected allocations for actual return to an unmatched applicant, next-choice advancement, cumulative failures, unchanged active matches, unwilling applicants, loss/date and draw priority, tuple collisions, immutable inputs and locale-independent output. Negative cases reject unknown, unranked or ineligible pairs, duplicate holdings, inactive failure substitution, contradictory history and malformed frozen inventories.

There is no API, browser workflow, migration, secret, provider configuration or activation-gate change in this slice. Its full source head still runs the repository's complete CI acceptance. Independent custody, constrained key release, authenticated replay publication, witnessed randomness and the protected Exchange workflow remain separate CS-20 work.
