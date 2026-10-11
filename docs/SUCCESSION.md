# Synthetic founding-unit succession

This adapter implements post-enrollment preparation under the approved federal proposal's sections 3(e) and 4(c)–(e). It is not a probate service, identity verifier or government program. Every mutation still requires the simulation realm and mode. Real protected intake and official action remain disabled.

## Personal request and assigned review

The proposed successor supplies an existing unit reference, a death or estate-designation route, their requested capacity, and a documented chain. Saving a reference does not reveal or convey the former holder's claim file. The requesting person must personally attest and acknowledge one undivided unit without another vote, personal debt or another person's account. A general delegate cannot submit for them.

Assigned Labor review requires current, unconflicted access to the request, association and original claim. The reviewer cannot be the requester, current holder, original founder, rights holder or a previous holder of this unit. Beginning review captures the exact unit, original claim, association, holder capacity and holder version. Approval requires supporting evidence and separate findings for the death, identity, chain, uniform-bylaw/probate basis, notice and competing rights. These are invented development findings, not external acceptance or independent verification.

A death may lead to one designated successor or one estate representative pending designation. A final designation may replace that representative without pretending the representative has died. The underlying deceased rights holder is retained while an estate representative holds the unit. Sales, pledges, division, ordinary reassignment and multiple recipients are not exposed by this adapter.

Requests needing correction return to the requesting person's draft and require a new review snapshot. A denial records reasons and offers a review request; it does not file a court case or deliver legal notice.

## Atomic preservation and privacy

Migrations 011–012 bind the approved request and immutable receipt to an append-only transfer history. The existing unit ID, original founder ID, claim ID and association ID remain intact. The current holder version increments exactly once. Retried commands return their original receipt; competing or stale approvals roll back the proposed decision, receipt and transfer together.

A unique active-holder constraint enforces one founding vote per person in an association. A collision requires separate review of a lawful single-vote arrangement; the adapter neither splits nor forfeits either right. Prior unverified successor values, if encountered during migration, are marked as requiring legacy reconciliation rather than accepted as reviewed transfers.

A transfer does not change a frozen voting roll, its denominator or a prior ballot. A new holder can use a still-unused vote but cannot vote again after the unit has voted. The current holder receives only a used-vote indicator, not a predecessor's choice or ballot receipt. Choice access is tied to the original receipt's actor, or an assigned authorized reviewer. Voting locks the unit and rechecks the holder after waiting, so a concurrent transfer cannot authorize an old holder's late vote.

Former-holder membership access ends, including access that would otherwise persist because the person originally created the association or resolution. Independent assigned staff permissions remain separately evaluated. No private account, personal claim file, recovery key or historical downloaded copy is transferred or erased. A new member role does not raise identity assurance or confer staff authority.

## Acceptance and limits

`node --import tsx tests/succession.integration.ts` creates an actual synthetic event, individual eligibility findings, personal consent, closed roll and member decisions. It exercises evidence and conflict refusal, exact-holder approval, idempotent and competing requests, stale rollback, estate representation and designation, membership access changes, immutable identities, used-vote privacy, collision refusal, and a deliberately blocked vote's holder recheck. Only isolated test-owner fixtures can manipulate rows to arrange the locking test; there is no such HTTP operation.

Desktop/mobile acceptance in `tests/private/succession.spec.ts` prepares and submits the request through the UI, uploads and validates invented text, completes assigned review, then checks the successor's membership and used-vote explanation. It also attempts the forbidden second vote directly and checks private-claim denial. Accessibility and screenshots accompany the journey. CI results and release records establish which exact revision has passed.

An existing un-enrolled claim has a separate case-control route described in CLAIM_SURVIVAL.md. New deceased-worker filings, full probate/identity/notice integrations, contested-estate case management and independent legal/security review remain separate work. The local `successor` persona is explicitly seeded and remains behind the existing development, simulation and localhost-only controls. It must never be enabled on a public deployment.
