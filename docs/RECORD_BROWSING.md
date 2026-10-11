# Private record browsing

The participant and staff workspaces load 50 recently updated accessible records at a time. **Load older records** extends the list and its local title/type/status search. The screen labels the loaded count and says when older records remain; it never presents a partial search as a search of every case. **Refresh recent records** starts a fresh list. A receipt or invitation's record reference can open an older record directly, including from an activity update.

`GET /records` accepts a page limit from 1 to 200 and an optional continuation cursor, or a single `recordId`. Existing callers without parameters receive the first 200 records plus `nextCursor`; clients must follow that cursor for a complete browse. Records and capabilities retain their existing shape. Unknown or combined lookup/page parameters are rejected. Missing and inaccessible references receive the same response.

Pages sort by updated time and UUID, preserving PostgreSQL microseconds. The continuation is encrypted, authenticated and bound to the caller and realm. It grants no access. Every request still applies current database row policies and application permissions, including conflicts; capabilities bind the returned version. No private plaintext search index or public case projection is introduced.

Browsing is a live view, not a historical snapshot. Changes or newly granted records can move ahead of an existing cursor; refresh to include them. Client merges remove duplicate IDs. Opening a card reloads its current accessible version, and expired sessions discard private state. Titles and loaded references remain in memory, never local storage.

The PostgreSQL acceptance fixture checks 207 records, exact microsecond/tie boundaries, cursor tampering and cross-user rejection, limit validation, older-reference lookup, and denial at both application and database conflict boundaries. Browser journeys use 205 explicitly invented older dossiers, load beyond the first page, open a supplied reference after refresh, and reject an inaccessible reference on desktop and mobile. These checks do not activate protected intake or attest independent security review.
