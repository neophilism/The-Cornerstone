# CS-20 bounded round snapshot for both replay entry points

This partial synthetic matching-security contribution builds on PR #68 and does not implement independent sealed-choice custody, witness releases, institutionally authenticated revisions, or public rankings.

Previously both `hashVerifiedReplay` and direct `replayFailedMatches` used `structuredClone(round)` on caller-owned matching data. JavaScript structured cloning can invoke an attacker's object getters before the matching verifier validates the round. Both entry points now call a shared descriptor-based `copyCheckedRound` before matching, hashing or reading round fields.

The copy rejects missing/accessor-backed properties, sparse arrays, revoked proxies and excessive input, with bounded aggregate element and text budgets. Recorded events continue to use the existing bounded transcript snapshot. Plain inputs retain original order and exact values, so the canonical committed digest for valid existing synthetic evidence must remain unchanged. New regression tests cover direct and committed paths, top-level/nested/array getters, oversized input, revoked proxies and detached results.

**Trust boundary:** JavaScript Proxy descriptor traps can execute during inspection; transport integration must first parse untrusted encoded data into ordinary objects. These checks are defensive library validation, not an authenticated external source, a custody provider, actual release approval, client-authorized encryption or complete CS-20 acceptance. The seven approved source originals, all migrations, service configuration and real protected workflows remain untouched.

This branch is intentionally stacked after PR #68. It must not be merged before PRs #65, #67, #66 and #68. All current-head repository source, application, PostgreSQL and desktop/mobile browser gates are required before a checked merge. No independent human audit or certification is claimed.
