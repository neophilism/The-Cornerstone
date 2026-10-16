# Reviewed synthetic receipt downloads

Receipt downloads require two authenticated reads: one to review the exact historical receipt and one immediately before preparing its file. The user sees the complete file and explicitly consents to an unencrypted copy. The consent is consumed by a download attempt. No cached fallback is available after failed authorization, malformed data or receipt drift.

`GET /receipts?receiptId=…` returns only the requesting actor's own synthetic receipt after checking current record access in the same restricted database transaction. Record access alone does not expose another actor's receipt through this endpoint. A retained receipt does not override a conflict or revoked grant. The endpoint excludes request keys, audit internals and record contents, and creates no new receipt or record version. Historical receipt versions remain valid when the current record has advanced; the UI states that distinction explicitly.

The versioned JSON envelope identifies a synthetic historical action. A digest is not an independent signature, legal filing or proof of external delivery. The downloaded copy cannot be recalled. Device backups, shared folders and other device users may retain it. Authorization is checked at preparation time, not guaranteed indefinitely after downloading.

Changing workspace context, disabling actions, cancelling, dismissing the receipt or losing the session invalidates pending UI work. Late responses cannot trigger a download after the component is dismissed. No private data is persisted to browser storage.

Verification includes receipt field substitution, malformed responses, consent checks, real PostgreSQL ownership/current-access denial, historical-version reads without mutation, and desktop/mobile browser download, cancellation, session-expiry and accessibility checks. These are source and synthetic runtime tests, not independent certification or protected production activation.
