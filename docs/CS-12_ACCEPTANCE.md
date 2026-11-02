# CS-12 succession verification continuation

Prior merged contributions in PRs 14 and 29 established the synthetic succession migration, test fixtures and acceptance pipeline. They are historical evidence, not a complete mapping for CS-12.

The current integration test covers personally submitted evidence, assigned unconflicted review, immutable unit and claim identity, exact idempotent retry, stale and competing approvals, a used vote without private ballot disclosure, estate representation, denial of account and claim transfer, and a vote waiting on a unit lock. This continuation adds a concurrent two-unit attempt to assign both founding votes to one person. The expected result is exactly one transfer and one receipt, with the rejected request still in review.

The actual PostgreSQL integration is run by the required `database` CI job. Desktop and mobile private-browser jobs exercise the personal request, staff review, resulting membership, duplicate-vote denial and private-claim denial. Source, build and browser acceptance must be judged at the exact PR head; local syntax or earlier merged runs do not establish a current pass.

This remains synthetic development. No actual probate determination, identity proofing, government program, protected production activation, or independent legal/security review is claimed.
