# Preparing a new claim for a deceased worker

This synthetic journey lets one designated successor or estate representative prepare a new claim when the original worker has no existing claim. It follows the approved proposed federal act, section 3(e): proof of the worker’s eligibility and proof of the succession chain remain distinct, and the claim does not divide among heirs. Post-enrollment exercise is governed separately by section 4(e). The Policy Paper’s parts IV–V and Design Commentary decision 11 provide the corresponding design rationale.

Sources are the unchanged originals in `policy/Federal_Cornerstone_Bill.docx`, `policy/Policy_Paper.docx` and `policy/Design_Commentary.docx`, identified and hashed by `policy/SOURCE_MANIFEST.json`. These are proposals. The separate standing packet and its explicit draft-opening step are implementation choices for controlled synthetic preparation; they do not add an enacted legal requirement or constitute probate or government acceptance.

## Participant and assigned-reviewer journey

In **Prepare & participate**, start **New deceased-worker filing** in the applicant’s own account. Supply an independently provided synthetic worker reference, the requested capacity and the death/designation chain. Attach invented supporting text, validate its format and personally submit the packet. The worker reference provides no account or file access.

Assigned Labor review binds the exact worker, applicant and capacity to the reviewed record version. Every staff action, including correction and denial, requires a reviewer who is neither the applicant nor the original worker and who retains the required assignment, institution and conflict clearance. Approval requires separate affirmative findings on death, identity, chain, probate consistency, competing rights, the undivided claim, narrow case authority and the continuing need to prove eligibility. A correction reopens the applicant’s draft and requires a fresh review; old reviews remain in immutable history.

Approval grants synthetic standing only. The applicant then selects an accessible certified synthetic event and describes the original worker’s livelihood and direct loss in **Prepare the worker’s eligibility claim**. This single action saves an opening receipt, one new claim draft, its creation receipt and the case-control link in one transaction. The resulting packet provides an **Open the worker’s eligibility draft** button, including after an exact-request recovery.

The new claim starts in `draft`. Its holder is the approved applicant, while its original-worker identity and approved capacity are server-controlled metadata. Death and succession attachments are not copied into the new case. Worker eligibility evidence must be attached and submitted separately; the usual livelihood, injury, event, assigned-review and evidence requirements still apply. The original worker, original applicant, current holder or rights holder, and any intermediate claim holder cannot act as staff on that claim even if they also possess a Labor role. A standing reviewer gains no automatic access to the new private draft. Submission supplies the normal separate assignment.

## One claim and truthful recovery

Migration `016-deceased-filings.sql` adds immutable review, standing and created-claim links. Unique worker and request constraints prevent two approved new filings or two drafts under the same standing. Approval and ordinary personal-claim creation serialize on the synthetic worker row, so a concurrent personal claim cannot slip past the standing reservation. Existing claims are detected through their original-worker control metadata even after a previous claim-survival transfer. A competing decision fails without retaining a new version, receipt, audit event or outbox entry.

Opening is a normal versioned workflow command, using the existing exact-request recovery interface. A lost response can be retried with the original command and key; it recovers the same packet receipt and claim reference. Fresh access is still required. Changing the request does not replay its earlier result, and an already opened packet cannot create another claim. A new claim’s initial receipt binds its actual holder and historical owner metadata.

An estate representative’s initial case control starts at holder version one. Existing claim-survival procedures can subsequently change that case-specific holder. If eligibility and separate personal founding consent are later completed, the existing enrollment procedure carries the estate capacity and original deceased rights holder into the founding unit. Opening a claim itself creates no membership, unit, ballot or debt.

## Verification and deployment

`tests/deceased-filings.test.ts` checks the required findings, prohibited transfer forms, transition limits and separate injury criteria. `tests/deceased-filings.integration.ts` exercises actual restricted-role PostgreSQL operations, exact receipt replay, current-access and outsider denial, immutable review, failed-decision rollback, competing approval and ordinary-claim races, correction rebinding, historical-claim detection and estate enrollment. Mixed participant/Labor identities are denied review, correction, approval and denial of their own packet and eligibility decisions on its generated claim; an independent reviewer can continue both cases.

`tests/private/deceased-filings.spec.ts` follows the participant, assigned reviewer and new-claim interfaces in desktop and mobile browsers. It deliberately loses the response after the claim-opening transaction commits, then checks that exact recovery returns one claim. It also checks unrelated-file denial, separate evidence, no automatic reviewer access, accessibility and overflow, and captures the request, preparation and resulting claim views. These tests are registered in the existing required CI jobs; adding them is not itself evidence of a passing run.

Apply the exact checked migration inventory before starting the corresponding private API. The public site has no database dependency. This change provides no real identity/probate provider, new hosting capacity, official notice, production intake or independent certification.

## Remaining boundaries

Uniqueness binds the same supplied synthetic identity reference. It does not resolve aliases or establish that two provider identities represent the same real worker. Conflicting evidence must be reviewed; the adapter never chooses a successor automatically. Correcting or withdrawing an already approved standing decision requires a future governed review path. Existing claims use the claim-survival route, and enrolled units use the unit-succession route. No account, login, session or unrelated file transfers through this workflow.
