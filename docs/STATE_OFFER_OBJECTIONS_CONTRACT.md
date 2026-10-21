# CS-19 synthetic prospective state-offer objections

This bounded CS-19 **contributing** implementation adds a process-local, synthetic-only objection contract. It does not create lawful public notice, actual objections, institutional decisions, authenticated custody, a working web UI or external acceptance. Original approved policy sources remain unchanged.

The contract binds a proposed 60-day UTC objection window to the immutable offer publication digest and authority identity. Filing requires an active non-conflicted simulated member/representative; decision requires a different currently active supervisor at the appointed supervising institution, never the publishing institution. Both commands snapshot own data properties before processing, require bounded evidence references, recheck current actor authority on exact-receipt recovery and reject conflicting request keys. Findings are immutable. Pending or adverse findings hold **prospective** participation and cannot rewrite previously effective compacts.

The synthetic clock does not establish a legally valid notice date or interpret statutory service. An external authenticated identity, real appointment, updated/current authority, transactional PostgreSQL ownership/RLS, unique receipts, audit/outbox, file custody and real legal review are still required. A process-local map must not be presented as durable persistence. Do not permit this model to release rankings, perform financial transactions or accept real case data.

## Acceptance and next integration

The repository Vitest suite exercises UTC boundary, exact request replay, independent reviewer conflicts, getter nonexecution and unchanged historical compact terms. Complete CS-19 requires scoped staff/participant forms, guarded API commands, real SQL row locking/unique constraints/RLS with cross-realm negatives, explicit service/notice evidence, expiry and revocation handling, rollback/retry, desktop/mobile browser tests, substantive source review and complete exact-head CI. The proposed 25-unit baseline remains unchanged; log this PR in CS-19 contributing PRs after acceptance.

Receipt recovery keys are now encoded as exact tuples of jurisdiction, institution, actor and request key; user-supplied `:` delimiters cannot alias another actor or independent supervisor's receipt. Regression tests exercise both filing and review collisions and overlapping actor IDs across institutions. This remains a process-local safeguard rather than authenticated identity or database row-level isolation.
