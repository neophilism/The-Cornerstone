# Reviewed synthetic attachment downloads

The attachment download control first refreshes current evidence metadata and opens a review of the exact filename, description and byte count. It explains that the saved text is unencrypted and may persist in downloads, backups, synced folders or other applications. Each download requires a separate explicit acknowledgment.

Confirmation refreshes current metadata again and fetches the attachment through the authenticated private route. The client rejects denied responses, redirects, unexpected content types, an oversized or incomplete stream, and bytes whose SHA-256 digest differs from the reviewed attachment. The server independently applies current row-level access, quarantine and stored-byte integrity checks. No cached attachment is used after a failed read.

Cancellation, unmounting and entering another blocked workflow abort the fetch and invalidate late responses before a download can be prepared. Consent is consumed on each attempt. No file bytes or recovery request are written to browser storage. Once the browser has received a prepared download, the application cannot recall it or prove that the user saved it.

This adapter supports invented plain UTF-8 text only. Text validation is not a security scan, credibility finding, legal acceptance or external delivery receipt. The existing direct API remains authenticated and scoped; interface consent does not prevent an authorized user from copying information they can already read.

Unit tests cover metadata correlation, bounded streams, exact UTF-8 bytes, denial, wrong type, changed digest and incomplete content. Desktop/mobile journeys verify consent, original file contents, denied current access, substituted bytes, cancellation, accessibility and responsive layout. Required CI establishes which revision passed.
