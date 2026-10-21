# CS-22: Synthetic Fund receipt-component integrity

`fundRemittance()` computes a finite repayment from exact-cent `bigint` values. The `operating` field is **gross operating receipts**; financing proceeds, refunds and collected taxes are subsets of that gross amount, not amounts in addition to it. As in the existing `stateSurplus()` contract, a valid basis therefore requires:

`financing + refunds + collectedTaxes <= operating`.

The calculator copies the four declared own data properties exactly once and rejects missing, accessor-backed, non-`bigint`, or revoked-proxy fields with `INVALID_RECEIPTS`. Negative amounts continue to be rejected. Exclusions exceeding gross operating receipts are rejected with `RECEIPT_COMPONENTS` **before** calculating or declaring a completed remittance; silently clamping an impossible negative base to zero is not valid. Equal excluded/gross amounts are allowed and yield a zero payment base.

All already-valid finite repayment caps, exact-cent rounding and released-account behavior remain unchanged. Descriptor checks are not a general sandbox for hostile JavaScript proxies: descriptor traps can execute. External evidence must be decoded into ordinary data and authenticated upstream. These guards do **not** establish banking provenance, prevent duplicated upstream payments, or implement account reconciliation and Treasury settlement. Those require persisted source identities, authorization and transaction locks.

This is a **bounded, synthetic CS-22 contribution**, not completion of CS-22 or institutional acceptance. Accept only after pinned formatting, TypeScript/unit, source and metadata, PostgreSQL, desktop/mobile browser and aggregate checks at the actual final head, plus substantive review and safe GitHub merge. This change does not enable private intake or real payments.
