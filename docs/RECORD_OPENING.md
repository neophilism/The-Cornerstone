# Opening a record in the current workspace

A record reference identifies a case; it never grants access. The record API continues to require the authenticated actor’s current realm, conflict clearance, row-level access and application permissions. A direct reference lookup returns one accessible record or an ordinary not-found response.

Record responses now include the authenticated requester’s actor ID and realm as `context`. These are already present in the workspace session. They are correlation metadata, not a session token, identity proof or additional authority. The browser validates the context before accepting records or their action capabilities. Every capability must identify exactly one returned record at the same version, and every record must belong to the current realm.

## Reference opening and cancellation

**Open a record by reference** accepts an opaque record ID. The workspace checks that its authenticated response contains exactly that one record, no continuation page and the corresponding current capability version. A response for another record, actor, realm or older known version is rejected. Malformed and denied reads have no cached-record fallback.

While checking access, the workspace removes the previous private selection and displays **Checking current record access…** with **Cancel record opening**. Editing the reference, selecting another record, leaving the view, starting an edit or draft, refreshing, or changing sessions invalidates the pending opening. A late response cannot replace the user’s newer view or selection. Cancellation discards a read result; it is not a server mutation or a claim that an underlying request was never processed.

The reference and request context live only in this tab’s memory. Opening does not place record contents or identifiers in the browser navigation URL, local storage or session storage. The authenticated API request uses the same bounded opaque-reference query as before. Reopening performs a fresh read and permission check.

## Session boundaries

An expiry response from the current session clears private records, selections, capabilities, receipts, forms, references and search text even if its body is not valid JSON. A delayed expiry response from a superseded session cannot sign out a newly established session. Successful record reads from a superseded session are likewise discarded.

Sign-in, sign-out and observed changes to the authenticated actor, realm or session CSRF value invalidate earlier requests. When a refresh discovers that the HTTP session has changed outside the component, it clears the former session’s private state before awaiting the new record page. A delayed or failed page cannot leave the new actor viewing the previous actor’s records. The new actor’s page must pass the same context checks before display.

These checks provide browser context isolation and truthful read recovery. They do not establish device identity, account recovery, real hosted identity integration or offline recovery. Recoverable session-revocation mutations remain separate work.

## Verification

`tests/record-opening.test.ts` covers authorized delegated reads, exact references, actor/realm substitution, older and ambiguous records, missing or mismatched capabilities, empty lists and continuation pages. The restricted PostgreSQL pagination/reference suite now verifies the API’s authenticated context and exact record/capability binding alongside existing outsider, conflict and cursor-isolation checks.

`tests/private/record-opening.spec.ts` covers substituted content and permissions; reference edits and navigation while a read is held; late successful and non-JSON expiry responses after sign-out/new sign-in; a real current-session logout followed by an unauthorized reference read; and a changed HTTP session whose new record page is held and then fails. It also checks accessible loading/error views, overflow, empty browser persistence and unchanged navigation URLs. Both desktop and mobile runs are required CI evidence; collecting the tests is not an execution result.
