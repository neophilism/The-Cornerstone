# Private request transport

The participant portal and staff application share the server-only `@cornerstone/ui/private-proxy` adapter. The public policy website does not import it. The API remains responsible for authorization, transactional writes, version checks and receipts; this adapter does not create authority or certify an outcome.

## A lost response is not a failed transaction

Once a POST has been handed to the upstream transport, a connection failure, timeout, response-body failure or upstream server error returns a sanitized `503 REQUEST_OUTCOME_UNKNOWN`. The request might already have completed. A save must be resolved with its original request and idempotency key, not a new write. The proxy never automatically retries. This replaces the former misleading assurance that no successful receipt was issued after a transport exception.

Ordinary application rejections, including a `409 STALE_VERSION`, retain their status and body. An upstream `401` is normalized to a JSON `SESSION_EXPIRED` response even when a gateway returned HTML; session-deletion cookies are retained as separate headers. This lets the existing workspace clear its private state. The draft-recovery UI in PR21 remains a separate feature; transport semantics do not establish that its browser journey has passed.

## Bounded, private transport

One 15-second deadline covers reading the incoming body, contacting the API and consuming its response. Client cancellation interrupts that exchange. POST bodies are bounded at two MiB and must be valid UTF-8 before forwarding. Responses are bounded at 16 MiB. Stalled or oversized streams are canceled; a late response after an abort is discarded. Cleanup does not wait indefinitely for an uncooperative stream. These are adapter bounds, not a service availability guarantee.

Every response produced by the adapter, including early origin, route and configuration rejections, carries `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Successful binary downloads and their content disposition remain byte-preserving. Null-body response statuses remain null-bodied.

Only the existing route allowlist is reachable. The API destination and internal credential come from server configuration, never from caller headers. Cookie, content type and CSRF headers are the only forwarded caller headers. POST origin checks remain mandatory. The API URL must be an HTTP(S) origin without user information, path, query or fragment. Authentication redirects remain limited to `/` or HTTPS URLs without embedded credentials; this does not replace the API's configured identity-provider trust decisions.

## Verification and limits

`tests/private-proxy.test.ts` includes 46 cases: exact payload/header forwarding, route and origin denial, request and response limits, invalid encoding, stalled streams, client aborts, late replies, separate cookies, non-JSON authentication expiry, binary downloads, redirects and truthful uncertain outcomes. One case uses a real loopback HTTP connection that drops only after receiving the complete synthetic write, then verifies it was forwarded once.

`pnpm test:proxy` launches each compiled private application against a synthetic loopback HTTP upstream. It checks the actual portal and staff route handlers for no-store rejection, successful forwarding, session expiry and a dropped write response. It passes no database credentials to those processes, makes no external requests and stops its child processes. Build the private applications first. The existing verification job runs this command after the application build, without removing any browser or database checks.

Local continuation verification on October 12, 2026: all 155 unit tests, both compiled-route HTTP journeys, all 15 existing PostgreSQL integration suites and the API, worker, portal and staff production builds passed. The local database is PostgreSQL 16.15 with PostGIS 3.4.2, not GitHub's PostgreSQL 18 environment. The server adapter is a separate export, not part of the UI root or workspace client exports. No dependency or lockfile change is required. Dependencies were restored from the previously verified offline bundle; a fresh online frozen install remains part of CI.

GitHub jobs were failing before executing steps at the last observed retry. Local browser navigation was separately blocked by an administrator policy; that policy was not changed. No browser acceptance, remote CI success, independent security review, E2EE conformance, deployment or production activation is inferred from these local results. No database migration or policy-original change is included.

## Definite prerequisite rejections

The remote desktop suite exposed an interaction between a known pre-mutation action gate and generic server-failure handling. Program commands now return `409` with their existing prerequisite code when the current workflow cannot proceed because custody, exchange or Treasury prerequisites are missing. The gate still executes before validation/mutation, and an actual PostgreSQL regression verifies repeated rejection leaves the draft version, receipt and outbox counts unchanged. The proxy passes this definite application rejection through; actual `5xx`, dropped responses and timeouts remain uncertain and are not retried automatically. The browser test continues to verify the exact prerequisite code and unchanged record. HTTP status semantics: RFC 9110 sections 15.5.10 and 15.6.4, https://www.rfc-editor.org/rfc/rfc9110.html. This changes the status for known unavailable-action commands from `503` to `409`, not the gate or its requirements.
