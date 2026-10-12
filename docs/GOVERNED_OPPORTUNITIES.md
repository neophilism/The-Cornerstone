# Governed opportunity planning

This is an optional member planning journey in the synthetic application, not an additional statutory eligibility test. A planning decision does not legalize a trade, create an exchange result, execute a compact, commit financing or establish restoration. All individual participation remains voluntary.

## Usable journey

A participant first saves a private opportunity draft and completes preparation. Only a current founding-unit holder may then explicitly share that record and its attachments with their closed association. The shared proposal documents feasibility, accessible training and first opportunities, enterprise financing, ordinary permits, voluntary participation and the scope of member inspection. Private drafts are not shared automatically.

Sharing writes an immutable association link, exact proposal version, canonical SHA-256 digest and receipt. All current founding holders can inspect a shared, adopted or withdrawn plan. An outsider with the generic member role cannot. Assigned reviewers receive only their existing scoped simulation route. A former holder cannot retain member access merely because they originally authored the plan; the current successor obtains the association's member inspection rights.

The plan view starts a prefilled opportunity-plan resolution. The server independently reads and freezes the actual shared plan. Users cannot submit their own digest, approved flag or binding. Opening a vote rechecks the same proposal; a withdrawn or changed plan cannot silently replace it. The ballot screen displays the frozen trade, district, feasibility, training, financing and permit assumptions. Existing immutable private ballots and the frozen majority-of-all tally are reused.

An active founding member may record adoption only after a successful opportunity-plan tally for the exact same association, record, version and digest. A failed tally, generic resolution, other opportunity, withdrawn proposal, stale version or repeat command cannot create a second adoption. Idempotent retries return the original receipt. Adoption explicitly retains `operatingAuthority: false`.

A shared plan cannot be edited. The current member who proposed it can withdraw it before adoption; its history remains inspectable. Material changes require a new plan and a new decision. This narrow planning journey does not implement statutory merger, dissolution, consortium execution, a member's personal enrollment into training, or the full launch lifecycle.

## Storage and authorization

Migration 014 adds immutable `opportunity_links` with forced row-level security. The restricted runtime can read permitted links but cannot directly insert, change or delete them. The sharing function requires a current unit holder, matching receipted proposal and unchanged association. A transaction-held unit lock serializes membership authority with succession. Member scopes allow inspection and adoption, never arbitrary draft edits or another author's withdrawal. Proposal digests are integrity checks, not signatures or independent review evidence.

## Verification

`tests/governance.test.ts` covers substantive-field binding, lifecycle invariance, explicit consent, malformed bindings, forged form fields and immutable lifecycle boundaries. `tests/governance.integration.ts` exercises actual PostgreSQL ownership, member RLS, failed votes, unrelated approvals, withdrawal, retry receipts and post-succession access. `tests/private/governance.spec.ts` creates a plan through the browser, shares it, opens a bound vote, casts a personal ballot and records adoption; both desktop and mobile variants include accessibility and overflow checks plus three screenshots each.

The 74-unit-test suite and API/portal/staff production builds passed locally during implementation on October 12, 2026. Full feature CI, database execution, browser acceptance, screenshot inspection and provider migration are separate release evidence and must be recorded after they actually run. No real private intake or external authority was activated.
