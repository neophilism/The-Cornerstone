# Recovering a personal membership response or ballot

Founding consent, withdrawal, larger-association scale choices and personal member ballots now retain one exact request while the outcome is unknown. The original record version, invitation or unit, choice, acknowledgment and idempotency key are frozen together. A lost response, malformed receipt or denied retry does not unlock a new response or ballot.

The recovery control retries only those original bytes. Other workspace actions and navigation remain locked; closing the tab warns that the in-memory retry request will be lost. No request is saved in browser storage. This cannot prevent closing a browser or recall a committed response.

A correlated historical record and receipt confirms the original write. The workspace then fetches current permissions and state before displaying further actions. This matters when consent changed or voting closed after the original write: replay must not display an older state as current. A failed current-state refresh shows the confirmed receipt but does not offer another action against the historical version.

Server receipt replay rechecks present association visibility, including conflicts and case grants. The private ballot path uses the same current-access guard as ordinary commands. A receipt key is not new authority. Existing transactional constraints continue to allow one immutable ballot per frozen founding unit; consent can change only through a new deliberate action while its founding period remains open.

Unit cases cover immutable request bytes and mismatched response correlation. The real PostgreSQL membership suite checks concurrent identical consent, historical replay without another version, changed-payload denial, wrong-person denial and revoked-access denial. Desktop/mobile journeys commit consent before losing its response, deny a retry, substitute a ballot receipt, verify locked controls/navigation, and recover one stored outcome. All fixtures remain synthetic; no legal membership or vote is created.
