# Public application development guide

Owner policy (16 October 2026): continue implementation, substantive security testing, checked merges and test deployment. Independent human security review is deferred to the final follow-up; it is not a prerequisite for this work. Preserve actual cryptographic, authorization, privacy, data-integrity and transaction controls, required checks and honest assessment metadata. Never label AI-assisted testing an independent audit or certification.

This guide describes the repository's actual implementation and engineering continuation. The earlier internal planning package is excluded from public publication. No completion of that full program scope is claimed here.

## Current architecture

A pnpm TypeScript monorepo contains Next public, portal and staff applications; a Nest API; a worker; and shared contracts, domain, policy, security, finance, matching, store, content, i18n and UI packages. Render serves the public proposal preview. PostgreSQL/PostGIS persistence is on a separate Neon development branch. The public service has no private database credentials.

API commands validate payloads, permissions, record versions and workflow states, and transact updates with encrypted record versions, receipts, audit and outbox records. Application authorization and transaction-local row-level security are both required. Migration ownership and runtime credentials are separate. Existing field encryption is server-decryptable and restricted to synthetic development.

The research content entry point reads an approved static projection. It is separate from private API data and unrelated client bundles. Downloads resolve only registered approved source files and verify bytes; the six-sheet import retains provenance and research-only labels.

## Continuing engineering

Complete foundations before relying on them in higher-level journeys: identity/session revocation and delegation; bounded quarantined evidence and controlled processing; outbox leases/retries and truthful notice states; legal calendar/deadline calculations; scoped redaction/public projections; API/client compatibility and operational recovery.

Build each usable journey across forms, persistence, permissions, transitions, receipts, failure paths and appropriate tests. The proposed acts supply the policy requirements. Later areas include petitions/findings and individual review; one-successor claims and bounded founding rolls; member governance and opportunities; published voluntary state offers; independently held sealed choices, matching and replay; within-offer compacts and delivery; finite Fund repayments and state-surplus schedules; supervision, review, renewal and final settlement.

Complete independent engineering with synthetic adapters when external integrations are unavailable. Adapter results must identify simulation and cannot generate an actual legal, license, payment or filing status. Identity, recipients, custody, treasury, signatures, retention and institutional authority have separate production prerequisites. See STATUS.md, SECURITY_SCOPE.md and DEPLOYMENT.md for active gates.

## Verification and release

Run relevant unit/domain tests, actual PostgreSQL/API isolation tests for data changes, browser journeys and accessibility checks for forms, and visual inspection for affected interfaces. Maintain frozen policy versions and financial provenance; forbid duplicate deductions, ballots and command side effects. Use independent expected results for finance/matching and exact amounts.

The public preview can release explanations and approved research while sensitive intake is closed. Protected services require the appropriate encryption/identity/recovery, provider configurations, verified safeguards and authority evidence. Branch protection/review and signed-release requirements are not self-attested. A successful CI run is verification evidence, not a statutory authorization.

Routine setup and commands are in README.md. Last verified commit, pending changes and blockers are in PROGRESS.md; actual provider configuration is in DEPLOYMENT.md. Credentials belong in approved secret configuration, never repository documents.
