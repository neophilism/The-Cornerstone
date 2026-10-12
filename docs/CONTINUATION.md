# Public engineering continuation

Checkpoint: October 12, 2026, 22:34 UTC. This queue supplements the public development guide; it neither publishes the earlier private planning package nor changes the approved 25-unit reporting denominator.

## Accepted foundation

PR17 compact approval, PR19 activity history, PR20 consent-based calendar exports, PR23 private transport, PR24 worker drain and PR21 concurrent-draft recovery are merged with integrated verification. PR18 supplies security-assessment metadata only; implementation, complete assessment testing and independent review remain pending.

## Dependency-ordered continuation

1. **PR25 release evidence:** reconcile accepted source and CI separately from historical provider state. Its own current-head checks remain required before merge.
2. **Recoverable new-record creation:** reuse create idempotency and scoped replay; freeze uncertain requests, correlate receipts, prevent duplicate creation, suppress late replies and test desktop/mobile failures.
3. **Remaining writes and exports:** inspect non-draft commands and private exports; preserve explicit intent, current access, truthful outcomes and no silent duplicate mutation.
4. **Full program journeys:** continue the public development guide after the required foundations, preserving separate provider and authority gates.

PR22's native CircleCI port is separate owner work and remains unverified. Preserve existing GitHub workflows and reconcile every newer integration before any connected-provider acceptance.

Implement each usable slice across UI/API/persistence/permissions as applicable. Run unit tests, real isolated PostgreSQL acceptance for changed data behavior, production builds, browser/accessibility journeys and visual inspection. Preserve immutable source/migration bytes, all CI additions, README guidance and separate security metadata. Record exact final heads/trees, then merge only when GitHub confirms safe mergeability and all actual required checks/reviews pass.

Do not create real-data providers or migrate production to avoid a gate. Fresh synthetic databases keep fixture-heavy acceptance independent; never delete hosted data to repair a test. Keep source acceptance distinct from actual hosted deployment and schema compatibility. See [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) for exact evidence and remaining operational prerequisites.
