# Public release — 2026-10-16

Accepted main `b6891ef2d1f0fe1a63dd1c4beedcfdd99fb0ea5c` passed its exact-head source, build, unit, PostgreSQL and desktop/mobile checks. The `cornerstone/application` deployment branch was fast-forwarded to that commit with an expected-head check. Render reported the existing public preview live at 2026-10-16T15:35:31Z. The service remains the public proposal site; private intake is not activated.

Direct HTTP verification from the development environment timed out. The deployed-preview workflow independently resolves the current deployment-branch SHA and verifies it against the public health endpoint, proposal-only mode and homepage content-security policy. Consult the workflow's actual result before treating endpoint acceptance as complete. Provider deployment status and measured HTTP behavior are separate evidence.

Advance the deployment branch only by fast-forward to a merged, fully checked candidate. Render auto-deploy is enabled, so a duplicate manual deployment is unnecessary. Human review remains deferred follow-up under the owner policy; actual failed tests and technical controls remain binding.
