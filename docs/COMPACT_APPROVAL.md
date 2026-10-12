# Exact compact approval and published commercial choices

This is a downstream synthetic compact-preparation and review journey. It does not activate an exchange, execute a compact, supply a signature or license, or verify an institution's actual authority. Real private intake and real legal or financial actions remain disabled.

## Preparation, disclosure and the vote

The author prepares a private draft against an accessible published offer and the accepted match for the same association. The form requires an explicit selection for every published commercial term; it supplies no default. An explicitly empty menu represents a fixed offer with no negotiable choices. Numbers, text, booleans and null are distinct choices. Empty choice lists, duplicate alternatives, unsafe object keys, nested objects and unbounded menus are rejected. An unpublished term or a newly negotiated state fraction is not permitted.

Services, launch milestones, public protections and outside-capital rights are recorded before the vote. Incomplete drafts can be saved, but cannot become a bound decision. Outside capital cannot receive votes, board seats, governance vetoes, founding-unit pledges or compact foreclosure rights. The selected offer supplies the financial method and state fraction; neither the author nor reviewer sets a new rate.

The draft view starts a prefilled compact resolution. Its author must explicitly consent to disclosure of the frozen terms to founding members when the vote opens. The server binds the actual compact ID, draft version, association, full substantive terms, published offer version and digest, financial method and accepted-match version. Client-supplied digests and approval flags are rejected. Opening a vote rechecks the binding. All eligible members can inspect the frozen terms, but do not thereby obtain the private draft, attachments or other case files.

Existing personal ballots, frozen unit rolls and majority-of-all tallies supply the decision. A changed draft, unrelated compact, failed tally, withdrawn offer, mismatched match, incomplete menu or former member cannot reuse an approval. Material changes require a fresh resolution. This is not a mechanism for weakening the voting denominator or changing individual participation rights.

## Submission and separate review

On submission, the authorized member's service reads the terminal tally and stores a bounded approval snapshot in the receipted compact. It contains the exact frozen terms, source resolution digest and version, roll digest and aggregate counts. It contains no individual ballots, identities or ballot history. The independent compact-review role inspects that snapshot without gaining access to the separate labor/member resolution record. The source tally is terminal and immutable in this adapter.

Review and publication recheck the substantive compact against the recorded approval and current published offer/match. Reviewer commands cannot replace the terms. The compact retains the initial 30-year term and at most one 10-year renewal, subject to the separate proposed statutory conditions. Publication is not execution; notice, signature, ordinary-law, identity and authority prerequisites remain separate. A receipt digest covers the record, action and actor; a proposal digest is an integrity binding, not a digital signature or independent security approval.

No migration is added for this slice. It uses the existing encrypted versioned records, terminal tallies and current-holder locks. Offer and match rows are locked in stable order while their prerequisites are checked. Runtime schema compatibility still requires migrations 001-015.

## Verification and scope of fixtures

`tests/compact.test.ts` verifies complete typed menus, bounded input, unsafe-key rejection, substantive binding, fixed financial provenance, prohibited capital rights and forged-field rejection. `tests/compact.integration.ts` exercises actual PostgreSQL permissions, member disclosure, stale/unrelated/failed approvals, former-holder denial, complete receipt retries, aggregate-only reviewer access and immutable publication.

`tests/private/compact.spec.ts` creates the draft and selects each published choice in the browser, starts a consented bound vote, records a personal ballot, submits the resulting approval and checks the visible summary. Desktop and mobile variants include accessibility, overflow and three screenshot checks each. Actual CI results and screenshot inspection must be recorded after execution, not inferred from the existence of these tests.

The new integration uses explicitly labeled owner-seeded published-offer and accepted-match fixtures only to reach this downstream journey. Association formation, personal consent, voting, tally, compact submission and publication use the real synthetic application services. These prerequisites are not evidence that the upstream institutional or independent exchange adapters work. The `EXCHANGE_RESULT_REQUIRED` gate remains unchanged. No claim of whole-program acceptance follows from this test.
