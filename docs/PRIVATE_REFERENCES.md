# Currently authorized private references

Record, founding-unit and evidence IDs are references, not access credentials. Each copy control explains clipboard retention and performs a fresh authenticated read before displaying or copying its ID. A denied, malformed or mismatched result has no cached-reference fallback. Clipboard permission denial offers only the reference from that successful current read for manual copying.

The record control binds the response to the current actor and realm, the exact record and its current capability version. The founding-unit control reads the current person's membership snapshot and requires the same unit, association, claim and holder status. A removed, transferred, duplicated or substituted unit cannot be copied from an earlier view. The evidence control requires the current actor, record and a non-stale record version, one exact attachment ID and unchanged immutable byte metadata. Copying an evidence ID does not download its bytes or approve quarantined evidence.

## Session and view boundaries

Every copy attempt retains its initiating session-generation check through validation and performs that check again immediately before displaying the verified reference and invoking the clipboard API. A current-session 401 clears the private workspace before error-body parsing. A successful response from an earlier session cannot release its reference after another sign-in.

Leaving the view, changing the selected record/version, editing or beginning an incompatible action invalidates pending copy controls. A separate **Cancel reference copy** action discards a held read. Refreshing memberships drops the earlier membership snapshot before reading a new one. Once the browser clipboard call has begun, the app cannot recall a copy or control clipboard history, syncing or other applications.

The response, session guard and verified reference remain in tab memory. No record content or identifier is added to the browser navigation URL or persistent browser storage by these controls. A later copy always performs another current read.

## API compatibility and verification

Membership snapshots include the authenticated actor/realm context. Evidence lists include that context and the record ID/version observed by the authorized database read. These are correlation metadata, not tokens or grants. The matching API and private UI must be deployed together; missing or mismatched context fails closed. Existing server authorization, record visibility and RLS remain authoritative. No migration or private production activation is introduced.

Unit tests cover matching references, authorized non-owner record reads, actor/realm substitution, changed or removed memberships, ambiguous evidence, stale record versions and invalidation after successful validation but before disclosure. Existing PostgreSQL suites verify the current membership reader and owner/delegate evidence context under restricted runtime roles.

Desktop/mobile journeys cover a real founding unit and attachment, fresh reads on each copy, removed membership, changed evidence context, clipboard permission denial, pending-copy cancellation, navigation, actual session expiry, accessibility and empty persistent browser storage. The existing record-reference browser journeys continue to cover fresh access, denied reads and draft-edit cancellation. Actual CI execution and visual inspection establish acceptance separately from test collection.
