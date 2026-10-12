# Recoverable new-record creation

A new synthetic record is one explicit creation intent. The form captures its validated title, fields and idempotency key as a serialized in-memory snapshot. Inputs are disabled during submission and after an uncertain result. **Retry exact creation** sends that same snapshot, never an edited variant or automatically regenerated key. A lock also rejects duplicate submissions before React renders the disabled state.

## Outcomes and consent

A matching initial record and create receipt confirm the operation. Both are schema-validated and correlated to the creator, realm, kind, normalized title, initial workflow state and version. This is response correlation, not a digital signature or proof of independently attested contents. Server field normalization and governed-resolution binding remain authoritative.

A definite first client-error rejection leaves input editable for correction. A network failure, timeout, server error or malformed success leaves the outcome uncertain. Crucially, a later denied retry does not prove the original creation never committed: the intent stays frozen until the original receipt is recovered or the user deliberately closes the view. No automatic creation retry runs.

The existing server's actor/realm/key lock returns the original receipt and historical version for repeated creation, including concurrent retries. Changed contents with the old key are rejected. Replay still requires current record and historical-version access. An old key does not restore revoked access. The original creation snapshot is not a claim that no later version exists.

## Navigation and privacy

Input and the frozen request exist only in component memory. Reload warnings cover dirty and unconfirmed state. Closing, navigating or signing out discards that memory and suppresses late responses; it does not cancel a server commit. The form explains this and instructs users to inspect their records before starting another copy. Cross-tab, post-reload and durable offline recovery are not claimed. No local/session storage, new provider or real intake is enabled.

## Verification

`tests/creation.test.ts` covers immutable request capture, response correlation, malformed inputs and uncertain/rejected outcomes. `tests/creation.integration.ts` verifies actual concurrent creation/replay, unchanged record/version/receipt/outbox counts, changed-intent rejection, historical receipt recovery and access loss using an isolated PostgreSQL database. `tests/private/creation.spec.ts` exercises real commits with lost or malformed replies, denied retries, first-request correction, late-response cancellation, expiry, accessibility and desktop/mobile captures. Execution evidence belongs to the exact PR head; test presence alone is not a pass.

No existing migration, server replay rule, dependency, source original or independent-review state is changed. This completes only the new-record recovery slice, not recovery of every other workflow mutation or activation of a government program.
