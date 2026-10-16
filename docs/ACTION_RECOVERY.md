# Workflow action recovery

Ordinary workflow forms in both participant and staff workspaces retain one
serialized request after a timeout, interrupted connection, server error or
uncorrelated response. The form and other workspace actions stay locked while
that outcome is unknown. **Retry exact action** resends the original record,
version, input and idempotency key. A denied retry does not establish that the
original action failed and cannot unlock an edited replacement.

A successful response must correlate the record ID, kind, realm, next version,
workflow state, receipt action and authority label. This is response validation,
not a signature or proof of institutional acceptance. After confirmation the
workspace independently reloads current permissions and state: recovering an
older receipt must not undo a newer saved workflow transition.

A definitive initial validation/permission/version rejection permits correction
without claiming a saved action. Recovery exists only in the current tab; no
case data or request is written to browser storage. A navigation warning reminds
the user before leaving an uncertain request. Session expiration clears private
UI even if that loses local recovery intent. A server-recorded action remains
saved independently of the browser.

Coverage: pure request/correlation/error tests; an actual PostgreSQL test of
concurrent replay, one receipt, modified-key rejection, outsider denial and
historical replay after a newer transition; desktop/mobile browser tests that
lose a committed response, deny a retry, corrupt an acknowledgment and recover
against a newer state. Browser tests include accessibility and responsive checks.

This slice covers ordinary workflow command forms. Evidence, access grants,
founding consent and private ballot controls have distinct adapters and remain
separate continuation work. Draft editing and record creation retain their
existing specialized recovery behavior. No real-data, official-action or payment
capability is activated by this change.

## Evidence upload and text validation

Evidence writes now retain an immutable request, including the supplied synthetic bytes, metadata, record version and retry key. A lost or mismatched response keeps all other workspace actions frozen and exposes an exact retry. A denied retry cannot prove that the earlier write failed. Response correlation checks the action, record, version and synthetic realm; a confirmed historical receipt is followed by a current authorized read before further work.

File reads and late HTTP responses are fenced against component unmount. Recovery intent is memory-only and a page-close warning explains that losing it does not undo any committed attachment. Server-side evidence replays also check current record visibility before returning historical data. Unit, real PostgreSQL and desktop/mobile browser cases cover repeated upload/validation, one-attachment persistence, changed receipts, revoked-author denial and frozen form/navigation behavior.
