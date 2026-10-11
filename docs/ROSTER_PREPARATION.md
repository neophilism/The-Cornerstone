# Founding roster preparation

The association form accepts a fixed two-column CSV (`claimId,personId`) containing invented development references. Import reads the file in the browser and stages a preview; the organizer must choose **Use imported roster** before it replaces the current form. Saving the draft is a separate action. A failed import leaves the existing roster intact.

The parser accepts a UTF-8 byte-order mark, CRLF and quoted cells, normalizes UUID case, rejects extra columns and malformed references, and rejects repeated claims or people. Both source bytes and the resulting JSON are bounded by the existing draft size limit. That technical bound is not a statutory membership ceiling. The parser accepts 2,501 entries without granting larger-association approval.

The form presents 20 proposed founders at a time, with navigation and removal. Accessible eligible claims may be selected by title to fill the corresponding claim and holder references. A supplied roster can contain references to other people's claims without exposing their evidence. Import does not certify eligibility, grant access, answer an invitation, cast a vote or create a unit. The server independently verifies actual ownership, eligibility, personal consent and the one-active-roll rule.

Unit tests cover interchange, normalization, duplicate detection, invalid references and size boundaries. Desktop/mobile browser acceptance covers staging, explicit replacement, a rejected import that preserves the form, saved/reloaded references and server rejection of already-enrolled claims. These checks apply to synthetic preparation, not real identity onboarding or protected intake.
