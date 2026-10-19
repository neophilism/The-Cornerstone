# CS-23 accessibility, translation and performance evidence

The public browser suite checks WCAG 2 A/AA and 2.1 AA rules with axe on the English routes and Spanish introduction at desktop and mobile sizes. It also checks page errors and horizontal overflow. These automated checks cannot establish screen-reader usability or lived-experience acceptance.

The locale dictionary has a runtime guard and structural key coverage test. The Spanish introduction labels itself an informational translation under review. Structural coverage and a passing build do not establish translation quality or human review.

The public browser suite writes `test-results/public-performance-desktop.json` and `test-results/public-performance-mobile.json` from the isolated CI Next server. Each record contains navigation response, DOM content loaded and load timings plus transferred bytes for `/policy`, tied to the CI commit. The sample has no pass/fail latency threshold and is not a representative production workload or SLO. Performance budgets require owner-approved targets and representative traffic measurement.

Remaining acceptance: qualified Spanish review; screen-reader, keyboard and lived-experience usability; representative production performance and accessibility evidence. Protected intake and official program actions remain separately gated.

## UTC-date regression and CI follow-up (19 October 2026)

The isolated desktop and mobile test environments use synthetic state offers. The original mobile failure happened after a UTC date rollover: the publication input had used the setup-time date, while current API validation requires the publication's actual UTC day. The response was not captured, so the rollover remains a source-supported likely cause until a corrected browser run passes. The follow-up test change calculates the UTC date at the final field immediately before publishing; the existing intercepted first response and exact-request retry assertions remain intact. The public performance test's TypeScript cast was also rewritten to satisfy the configured formatter without altering timing calculations. These changes are test-fixture/formatting repairs, not authority, security or production-performance acceptance. Final-head application, database, browser-matrix and source workflows remain required.
