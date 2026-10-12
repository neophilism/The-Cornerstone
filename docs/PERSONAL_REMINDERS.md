# Personal calendar reminders

A signed-in participant or staff user can export a generic all-day reminder from an accessible record's next-step area. Export requires an explicitly chosen date and affirmative consent. It rechecks current record access before producing a file. Access denial, malformed responses and navigation while the check is in flight produce no download. A pending check is aborted when the component closes. Calendar exports do not mutate case records or contact any calendar provider.

The file contains a generic title and description, chosen date, generation timestamp, independent random event identifier and software identifier. Case titles, record IDs, evidence, names, contact details, location, attendees, organizers and workspace links are excluded. Repeated exports of the same date within the open form reuse the same bytes and event identifier; importer deduplication is not guaranteed. Closing the view discards this memory. No browser storage is used.

The consent text explains calendar-provider/shared-calendar visibility and that imported copies cannot be recalled. `CLASS:PRIVATE` is advisory, not encryption or a provider guarantee. Users configure notifications in their own calendar. No delivery, legal service, statutory deadline or official action is established.

The writer accepts only `date` and `consent: true`. It validates actual dates, leap days, year boundaries and the exclusive following-day end. Year overflow and additional data fields are rejected. Content uses CRLF and 75-octet UTF-8 folding without splitting characters. Control-character injection is rejected. The helper is exposed at `@cornerstone/domain/reminders` without changing the main policy engine.

Standards basis: RFC 5545 sections 3.1, 3.6.1, 3.8.2.2, 3.8.2.4, 3.8.4.7 and 3.8.7.2; https://www.rfc-editor.org/rfc/rfc5545.html. No live calendar-provider behavior is attested.

Verification is in `tests/reminders.test.ts` and `tests/private/reminders.spec.ts`. The browser journey covers consent, actual file bytes, repeat export, revoked access, navigation during a held response, accessibility and desktop/mobile layout. Local and remote execution results are recorded separately in the PR and progress checkpoint; a test's presence is not evidence it passed. No migration or protected-production activation is included.
