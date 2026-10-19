# Continuing an existing claim after a death

This synthetic adapter implements the distinction in the approved federal proposal, section 3(e): an existing claim can survive before enrollment, while section 4(e) governs an already created founding unit. It is not probate, identity proofing or an official eligibility decision. Only invented development information is permitted.

## Separate request, original claim

A proposed successor personally requests control of one existing, assigned claim. The request identifies the claim, a death or final estate-designation route, the proposed capacity and supporting evidence. A reference grants no access. The requester cannot inspect the original claim while merely preparing or submitting this separate packet.

Assigned Labor review requires current unconflicted access to both records. The reviewer cannot be the requester, current holder, original worker, rights holder or a past holder of the claim. Beginning review binds the exact claim version and holder version. Approval requires evidence and separate findings on death, identity, chain, probate/bylaw basis, competing rights, necessary case-specific access, preservation of one claim and the separate eligibility process. These are synthetic findings, not externally verified facts.

An approval changes control of the original claim file and appends a version and receipt. It preserves the claim ID, original worker, event, injury evidence and eligibility state. A claim under review remains under review; a denied claim does not become eligible. Existing case-specific delegates lose future access and need new authorization. The former holder's unrelated files, login, recovery credentials and sessions are not conveyed. Unlike a post-enrollment unit transfer, continuing an un-enrolled claim explicitly requires access to this particular case file and its evidence. The interface asks for that narrow authority; it does not imply account inheritance.

Corrections return the request to its owner for personal resubmission and a fresh snapshot. A competing approval or intervening eligibility decision makes an old snapshot stale. The failed request, proposed receipt and original claim change roll back together. Idempotent retries return the original accepted result.

## Historical receipts and database invariants

Migration 013 adds immutable historical-owner metadata alongside existing encrypted record versions. It does not rewrite old ciphertext or receipts. Historical reconstruction uses the owner at that version, so its digest remains valid after a control change. The backfill assumes the preceding supported release's invariant that record owners never changed. An installation with manually altered historical ownership requires separate reconciliation; this migration does not invent that history.

The same migration adds restricted claim-control state and append-only succession decisions. A guarded function changes ownership only with the exact assigned approval and receipt. A deferred foreign key requires the new original-claim version to exist before commit. Runtime credentials cannot update either succession history or historical-owner metadata directly. The test suite verifies old reconstructed versions against their original receipt digests after multiple transfers.

Claim control, personal cohort acceptance and roll closure serialize on the original claim row. Concurrent enrollment cannot convert a transferred claim into a second unit, and approval cannot use the pre-enrollment route after any founding unit has existed for that claim. One claim can have accepted consent in only one open cohort; a person can withdraw that consent or the owner can withdraw an unclosed proposal without forfeiting the claim. A closed roll cannot use this proposal-withdrawal action.

A designated successor or one pending estate representative carries the appropriate capacity into the eventual founding unit. An estate's deceased rights holder is preserved. Final designation after enrollment uses the unit-succession route and does not claim the estate representative died. No new unit or vote is created by either transition.

## Verification

`node --import tsx tests/claim-survival.integration.ts` creates actual synthetic event, claim, consent and review journeys. It checks missing evidence/findings, unauthorized ownership writes, conflicts, a hold on competing reviewed successor packets until recorded denial, idempotent and stale decisions, historical receipts, unrelated-file denial, delegate revocation, immutable history, estate designation, pending eligibility, and an enrollment-versus-control race. An additional estate-to-unit journey checks that final unit designation does not automatically convey the private claim file.

`tests/private/claim-survival.spec.ts` starts from Prepare & participate and follows personal request, evidence upload, assigned review and reopening the same continuing claim in desktop and mobile browsers. It checks refusal before approval, unchanged eligibility, unrelated-file denial and loss of the previous holder's claim access. A unit test requires every workflow to appear in exactly one navigation group. Accessibility assertions and six screenshots accompany the browser journey. See PROGRESS.md and the PR's exact CI run for which revision has passed; the existence of a test is not a passing result.

## Remaining boundaries

This route needs an existing claim already accessible to an assigned reviewer. It does not seize an unsubmitted private draft, impersonate a deceased person's account, create a newly filed historical-worker claim, resolve a contested estate automatically, or transfer an enrolled unit. Migration `020-contested-claim-survival.sql` binds each reviewed request to one claim and receipt. Two live reviewed requests for that claim cannot transfer its holder by transaction timing; an assigned reviewer must record a correction or denial on the competing request first. This is a conservative synthetic hold, not adjudication of legal priority. New deceased-worker filings, full contested-case procedures, external identity/probate/notice acceptance and independent security/legal review remain separate work. Production activation stays closed.
