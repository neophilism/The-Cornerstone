# Hosted public release acceptance

The existing Render preview is checked at its exact authorized deployment-branch commit. A successful build or a Render `live` status does not by itself establish that the public pages and source files are being served correctly.

`scripts/preview-smoke.mjs` verifies the fixed public origin, `https://cornerstone-policy-preview.onrender.com`. Run it with `EXPECTED_PREVIEW_COMMIT` set to the exact 40-character deployment revision. It waits up to four minutes for that revision's healthy proposal-only API, then checks the following observable behavior:

- The homepage, policy page and one representative research detail return HTTP 200 with the nonce-based content security policy. The policy page links all seven registered originals. Research retains its research-only scope, evidence provenance and workbook link.
- Every original in `policy/SOURCE_MANIFEST.json` downloads with its registered filename, media type, exact content length, no-sniff/no-index controls, SHA-256 metadata and digest ETag. Cache controls must require revalidation or prevent storage; the deployed public proxy currently applies `no-store`. The streamed body is bounded to the recorded byte count, and its independently computed SHA-256 digest must match the manifest.
- Each digest produces a conditional HTTP 304. An unregistered document route returns 404. Redirects are rejected so another origin cannot supply the acceptance response.
- The health endpoint still reports the same exact commit and closed protected intake after all downloads. A revision change during verification fails acceptance.

Readiness can retry while Render deploys. Once the requested release is present, a missing page, corrupt or truncated original, changed scope, metadata mismatch or failed conditional response fails the run. It cannot be hidden by retrying until a later response passes. Each request has a timeout, and all consumed response bodies have byte bounds.

The deployed-public-preview GitHub workflow resolves `cornerstone/application`, runs this verifier and retains the successful JSON evidence for fourteen days. The evidence contains the origin, revision, verification time and observed bytes/digests for all seven documents. The original files and approved publication scope are unchanged. Unit tests exercise incorrect bytes, metadata, redirects, size bounds, stale/mixed releases, missing policy links and research scope, and failed conditional responses; normal application CI continues to run the public browser journeys and the complete private/database checks.

This is public HTTP acceptance. It does not activate private intake, prove provider recovery, verify all external research citations, certify an event or person, create institutional authority, or attest independent security review. The approved source manifest and proposal/research limitations remain authoritative.
