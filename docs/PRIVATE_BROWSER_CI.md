# Independent desktop and mobile acceptance

The successful [PR 51 database job](https://github.com/neophilism/The-Cornerstone/actions/runs/39035584423/job/117404595522) took 18 minutes 32 seconds of its 20-minute budget while running the complete database suites followed by 69 desktop and 69 mobile cases. Subsequent features add more browser cases. The GitHub workflow now runs the two complete browser projects in parallel, each with its own fresh PostgreSQL/PostGIS service. It retains the existing 20-minute limits and every test.

## Jobs and merge acceptance

| Check                        | Required work                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`                   | The existing complete database integration sequence, migration/readiness checks, and actual logical backup/restore rehearsal, once.                              |
| `private-browser (desktop)`  | A fresh job-local database, complete bootstrap, explicit browser fixtures, compiled API/portal/staff/worker and every desktop private browser case.              |
| `private-browser (mobile)`   | A different fresh job-local database with the same preparation and every mobile private browser case.                                                            |
| `private-browser-acceptance` | Runs after the matrix even on failure, cancellation or skipped dependencies, and succeeds only when the matrix result is `success`.                              |
| `verify`                     | Existing unit/domain checks, source/secret/format checks, all application builds, compiled private-proxy HTTP checks, public browsers and worker process checks. |
| `local-setup`                | Existing actual Docker bootstrap, repeated setup preservation, runtime readiness and authenticated synthetic API checks.                                         |

The matrix has `fail-fast: false`, so a failure in one project does not cancel the other project's failure evidence. Its separate check names remain visible. The owner’s full-head merge gate requires **both individual browser checks, their aggregate, database, verify and local-setup**, together with the separate source/security metadata checks. An aggregate success does not replace inspection of individual results, and a successful database-only job does not establish browser acceptance. This workflow does not configure repository branch protections.

Each project uploads its own `private-browser-verification-desktop` or `private-browser-verification-mobile` artifact, even when tests fail. The artifact includes the project's traces and existing screenshot names. No test filter, case exclusion, retry, timeout expansion or shared mutable database is introduced. The browser jobs do not wait for, download, restore or reuse the database integration job's state.

## Fresh browser bootstrap

Each job starts the same pinned PostgreSQL 18/PostGIS image, creates separate restricted `cornerstone_runtime` and `cornerstone_worker` accounts through the existing bootstrap, applies every checksum-checked migration, and seeds synthetic personas/routing. The exact documented loopback CI URLs remain within the existing credential scanner's narrow exceptions; no exception is broadened.

`scripts/test-field-key.mjs` generates a distinct random, masked field key for each job. That job uses its key for fixture encryption and the API process. Keys, database files and credentials are not uploaded or exchanged between projects. The existing private test server still removes owner/worker credentials from the API, permits only its limited environment in portal/staff, and starts the real synthetic activity worker using its separate account.

`node --import tsx tests/private-browser-setup.ts` prepares only the records that older browser journeys previously received as side effects of database integration suites. It requires explicit simulation mode, a supplied valid field key, all three role-specific connections to the same loopback `cornerstone_test` database, and no existing case records. It verifies restricted runtime/worker roles and exact schema compatibility before writing. An existing database is rejected; nothing is wiped or reset.

| Browser prerequisite  | Preserved contents and consumers                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed association    | `Invented closed association`, its certified event, two eligible claims, personal acceptances, a completed synthetic roll and two active units. Used by workspace, roster and finance journeys; roster still rejects re-enrollment of those used claims.        |
| Voluntary invitation  | A separate certified event and fresh eligible claims for the two seeded participants, in a submitted unclosed `Invented voluntary invitation`. Used by navigation and personal consent journeys.                                                                |
| Larger invitation     | `Invented larger invitation`, with **2,501** distinct proposed units, including both seeded participants and 2,499 extra synthetic actors. The existing scale journey still crosses the actual 2,500 boundary; no approval or closure is pre-recorded.          |
| Finance prerequisites | The original synthetic published offer and effective compact, member ownership, fiscal assignment and the closed association. The fixed fixture rate remains 1/20 with the original method and protected baseline; no calculation/review result is precomputed. |
| Activity pages        | 125 actual old unread notifications and their receipts, linked to a readable participant dossier with the original microsecond timestamps.                                                                                                                      |
| Record pages          | 205 old participant dossiers named `Invented older preparation NNN`, retaining timestamp ties and the existing beyond-200 paging target.                                                                                                                        |

The small closed/open rolls use the existing real synthetic workflow helpers. Bulk eligible claims, effective finance prerequisites and old paging rows retain the explicit downstream fixture boundary from their original producers. No legal finding, actual Exchange, executed compact or real notice is asserted. The original database integration files and all their negative/concurrency/rollback assertions remain unchanged in `database` and run exactly once.

For a local reproduction, use a **fresh** explicitly isolated loopback `cornerstone_test` database with the separate role credentials and one supplied `FIELD_ENCRYPTION_KEY` shared by setup and test processes. Build packages, create the restricted roles, apply migrations, seed personas, run the setup command, build API/portal/staff/worker, then run `pnpm test:private --project=desktop` or `--project=mobile`. Use a different fresh database/job for a parallel project. The setup refuses existing case data rather than providing a reset command.

## Verification boundary

Local checks validate environment refusal, fixture types, the complete migration inventory, unchanged original suite commands, matrix isolation/aggregate configuration, test collection, formatting and source/credential integrity. Final acceptance requires the actual GitHub workflow at the candidate commit: all database/restore, both complete isolated browser projects and the unchanged verification jobs. Source review and collection are not presented as successful browser execution or measured runtime improvement.
