# Security scope and activation gates

The public website has no sensitive case intake. Proposal records, official records, synthetic training, and independently held ranking keys have different trust boundaries. Every private API denies access across realms and requires a scoped session, record permission, conflict check, and current workflow state. Technical administration does not confer policy authority.

The E2EESA repository was located and inspected at commit ddfbd40c47d13890ebb81ea91c81fe329417058e. Relevant specification areas include client integrity, server trust, identity/device authority, attachments, recovery, telemetry, secure development, supply chain, and independent verification. This application does not claim E2EESA conformance or certification.

The initial application-field encryption adapter uses Node's AES-256-GCM with a random nonce and record/version binding. The authorized API can decrypt. This is application encryption at rest, and does not satisfy the standard's ciphertext-only infrastructure or client-authorized E2EE-device requirements. It is limited to synthetic development until recipient-device/key lifecycle, approved review endpoints, backup retention, code transparency, and independent assessment are resolved. No server-held key is advertised as end-to-end encryption.

| Area                  | Initial implementation / gate                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and sessions | OIDC discovery, PKCE/state/nonce, opaque server sessions, CSRF and audience checks; local persona access restricted to synthetic localhost development                        |
| Private records       | Separate realms, encrypted payloads, application authorization, restricted SQL role and RLS; real intake gated pending independent review                                     |
| Evidence              | Bounded encrypted synthetic text, quarantine and explicit format validation; real files still require approved storage, scanning, custody, retention and recipient processing |
| Rankings              | Separate independently governed custody; real submissions disabled until protocol and key-release review                                                                      |
| Authority             | Verified enactment/appointment/function records required; a technical feature flag cannot supply authority                                                                    |
| Telemetry             | No advertising, analytics SDK, session replay, or private-content diagnostic export                                                                                           |
| Delivery              | Pinned lockfile, checks, immutable release inventory; independent approvals, signing/witnesses and assessment remain explicit prerequisites for protected production          |
| Recovery              | Synthetic restore tests do not attest production RPO; journal and key continuity require independent custody and measured provider drills                                     |

Public explanation can be released separately. No sensitive intake, E2EE claim, real sealed ranking, public disbursement, or official program activation follows merely from deployment.

Synthetic member ballots use server-field encryption, immutable rows and scoped database access. Shared records exclude individual choices. Assigned reviewers and the authorized API can decrypt them; small published tallies can reveal choices by inference. This adapter supplies neither independently sealed ranking custody nor anonymous election guarantees. See MEMBERSHIP_AND_VOTING.md.
