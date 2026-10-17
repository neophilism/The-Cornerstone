# Reviewed private record printing

The private workspace no longer sends the live page to the printer. `Print record` uses the same bounded, current-version review and two authenticated reads as JSON export, with separate explicit consent for the browser print dialog. A changed saved version resets consent. Failed access, cancellation or session expiry cannot print cached record content.

Both reads bind the authenticated reader and realm to the exact record and its current capability version. A retained session check runs at the preview callback and immediately before preparing the synchronous print surface. A session change after successful validation still prevents printing. A held success or non-JSON 401 from an earlier sign-in cannot disclose content or clear a replacement session. These checks use the same session-bound disclosure helper as record and receipt downloads.

Only the exact reviewed synthetic record envelope is inserted into a temporary print surface, using `textContent`; user data is never interpreted as HTML. The surrounding workspace, activity, other records, forms and unsaved edits are hidden in print media. Browser-menu printing also hides the private workspace unless the reviewed print surface is present. Public policy printing is unchanged.

The temporary surface is removed after the print dialog closes, when the review is cancelled or when its owning component unmounts. The UI reports only that the browser dialog was requested, not that a paper copy or PDF was produced. Copies and printer queues cannot be recalled and are not encrypted by the app.

The existing export unit and PostgreSQL suites verify reader context, permission and exact-version binding. Session-disclosure unit tests cover the final promise-continuation gap. Desktop/mobile browser tests additionally inspect the rendered print media, exact printed payload, fresh consent after a concurrent update, denial, late-response cancellation and held successful/expired reads across a different sign-in. Browser tests intercept the system print call to inspect its input; they do not claim physical printer delivery.

## Record references

The separate `Copy record ID` control now explains clipboard retention and rechecks current record access before copying only the UUID. It never treats a reference as authorization. Denied or malformed reads cannot fall back to the cached identifier. Beginning an edit or leaving the component suppresses a late read. If browser clipboard permission is unavailable, the UI offers only the freshly authorized identifier for manual selection. Tests intercept the clipboard API; they do not change operating-system clipboard permissions.
