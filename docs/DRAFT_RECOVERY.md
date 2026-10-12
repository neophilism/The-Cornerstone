# Recoverable draft editing

Draft recovery is an in-memory aid for a signed-in user editing one synthetic record. It does not provide durable offline storage, resume a discarded view, establish authority or activate real private intake. The current browser form is not remounted merely because a newer record version is observed. Other record actions are disabled while editing, so an attachment or workflow transition cannot silently replace open inputs.

## Stale version

A `STALE_VERSION` rejection means the attempted save did not write. The form retains its unsaved inputs and pauses further saves. **Load current saved version** rechecks record access and obtains current, version-bound edit capabilities without replacing the form. The comparison considers only editable workflow fields. Independent changes can be combined; competing edits to the same field require an explicit local/current choice. Arrays and structured fields are atomic, not guessed element-by-element merges. Clearing a field is a real change, distinct from zero, false and empty text.

**Continue with reviewed draft** updates only the in-memory editing baseline and form values. It does not save. The user reviews the result and then saves against the inspected version. A further concurrent change produces another stale rejection and review. A transitioned or currently non-editable record cannot be rebased into an editable draft. Returning from a comparison leaves the original unsaved form intact.

## Uncertain outcome

A network interruption, timeout, server error or malformed success response can occur after a commit. The editor therefore freezes the exact command, original expected version and idempotency key, disables field changes, and offers **Retry exact save**. It does not label the save as failed or invent a new key. A matching historical record and receipt resolve the retry; current server permissions still govern recovery. Receipt correlation in the client is not a digital-signature or independent-attestation check.

A rejected retry does not establish the outcome of the original unconfirmed save. The editor retains the frozen command after any unsuccessful retry, including authorization, rate-limit or stale-version responses; it neither unlocks changed input nor starts a three-way rebase from that later response. The user can keep retrying the original intent or deliberately close the editor under the stated in-memory recovery boundary. A definite first rejection still permits correction or the normal stale-version review.

Program create/command replay now requires an accessible current record and an accessible historical version. Previously, access loss could produce a success-shaped result containing a receipt and `record: null`. The replay path now returns a clear not-found/no-longer-accessible rejection. This does not delete receipts or change their underlying retention policy. An allowed historical replay returns its original version, not a claim that it is the latest record version, and never overwrites a later saved version.

## Navigation and privacy

The draft and frozen retry request exist only in component memory. No local/session storage, offline database or calendar/email integration is used. Closing the editor, navigating away or signing out discards this state; a reload warning is installed while input is dirty or a save is unconfirmed. Late asynchronous replies cannot restore a closed view. HTTP 401 clears the private workspace even when a proxy supplies a non-JSON denial. Closing an unconfirmed save does not cancel a server commit, and the UI explains this boundary. Recovery across discarded tabs is not claimed.

## Verification

`tests/draft-review.test.ts` covers comparison, explicit conflict resolution, clearing, structured values, cloning, response correlation, current capabilities and uncertain outcomes. `tests/draft-recovery.integration.ts` uses separate migration/runtime roles against actual PostgreSQL: racing saves, stale rejection, rebase, repeat and historical receipts, unchanged version/receipt counts, changed-key payload rejection, transitioned records, outsiders and current conflicts.

`tests/private/draft-recovery.spec.ts` adds desktop/mobile browser journeys for overlapping edits, a deliberately lost response after a real commit, exact retry, transitioned records, held replies after navigation, accessibility and screenshots. The existing ordinary edit/save/reload journey remains in place. Browser-test presence is not execution evidence; results and blockers are recorded in the PR. The isolated local PostgreSQL check is not GitHub's PostgreSQL 18 job or protected-production approval.

No migration, applied SQL change, protected provider configuration or policy-original change is included.
