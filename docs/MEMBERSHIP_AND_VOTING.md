# Synthetic association membership and voting

Migration 008 adds voluntary founding invitations and member decisions to the participant workspace. The adapter uses invented records only. It does not charter an association, confer legal membership, or collect official votes.

## Founding journey

Create and submit a bounded association draft referencing actual synthetic eligible claims and their owners. Each invited person can inspect the association and personally accept or decline its unchanged terms; an organizer cannot answer for another person. Acceptance requires an affirmative acknowledgement of equal base rights, one vote, inspection and first opportunities, without compelled work, relocation, training, capital or personal debt. Consent can be withdrawn during the published founding period. No invitation or acceptance creates a unit by itself.

An assigned Labor persona can close an ordinary roll only after the final UTC calendar date of the 180-day period, with every invitation accepted, no unresolved timely claims, eligible linked claims and the required written findings. Closing atomically creates one active unit per claim and adds the member role. It does not elevate identity assurance or confer any staff role. Personal claims and their evidence are not exposed to other members through association access.

The simulation currently supports ordinary same-event rolls of 2–2,500 people. The design also permits qualifying larger associations and small cohorts combined across events. Those paths require additional consent, findings and claim-specific exchange-priority handling and are not implemented by this adapter. Single-successor activation remains gated. These are implementation limits, not changes to the proposed policy.

## Member decisions

An active founding-unit holder can draft a resolution for an accessible closed association. The server derives its unit count, fixes its association and freezes the actual unit IDs when voting opens. Every active holder in the frozen roll may cast one ballot, including a successor when that separately reviewed transfer adapter becomes available. Ballot replacement is unavailable in this initial adapter.

A member sees their own choice and receipt. Shared record payloads and exports contain participation counts and salted commitments, never individual choices. Ballot bodies are encrypted and bound to the ballot, resolution and unit; choices are verified against their commitments on reading and tallying. Database policies restrict ballot rows to the unit holder or assigned Labor reviewer. These ballots are server-decryptable, not cryptographically sealed rankings or anonymous elections; authorized reviewers can inspect them. Published tallies in a small association can reveal choices by inference.

After the closing UTC calendar date, the assigned Labor persona tallies against all frozen units. Abstentions and missing votes remain in the denominator. More than half of all units must vote yes. The tally records yes, no, abstention, uncast and total counts. It does not execute a compact, ranking, merger or financial transfer.

## Verification

`node --import tsx tests/membership.integration.ts` requires the isolated, migrated and seeded simulation database. It exercises actual event/claim findings, evidence, consent and withdrawal, elapsed founding periods, closed rolls, scopes, conflicts, duplicate units, frozen ballots, idempotent retries, private versions, immutable ciphertext and all-unit tallies. Only the in-process test harness can advance its service clock; HTTP callers cannot.

The database CI job creates one ephemeral masked field key shared by its synthetic integration fixtures and private browser server. It is discarded with the job and is never a provider credential. Browser checks cover personal consent, membership inspection, two-person voting and persisted receipts on desktop and mobile, with accessibility checks and screenshots. CI results, rather than this description, establish whether a particular commit passes.
