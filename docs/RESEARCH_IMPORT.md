# Approved research import and publication

Publication approval covers the five supplied source files and two draft acts. `policy/SOURCE_MANIFEST.json` records the original filenames, roles, lengths and hashes; original bytes are unchanged. `pnpm check:secrets` rejects undeclared source artifacts and verifies approved hashes as well as credentials.

`python scripts/import-research.py` reproduces the public JSON projection. The offline tool requires Python 3.11+, openpyxl and python-docx. It rejects changed source hashes, formulas needing an extraction policy, altered sheet/header inventories, duplicate IDs, unmatched census IDs and unresolved event links. `--check` compares the generated structure without rewriting it. Source libraries are used only for read-only extraction; no new workbook is authored.

The six sheet record counts are independently pinned: event evidence 231; citation audit 231; workforce evidence 128; worksites 120; method 17; coverage audit 37. The census contains the same 231 stable event IDs, including the C-036A through C-036D suffixes. Original worksheet rows and census paragraph numbers are retained. The raw research screen is broader than the draft eligibility test; source phrases such as 'qualifying event' remain source wording only. Public displays explicitly label every event research-only.

The importer performs no external URL fetch, citation verification, inferred individual eligibility, geocoding or automatic certification. Citation-check claims and September 28, 2026 dates are attributed to the supplied workbook. Workforce and worksite findings retain their limits; raw coverage leads do not enter the event list. New entries or corrections require reviewed original/source versions and regenerated projections. A research exclusion or missing row cannot bar an unlisted petition.

The public projection is separate from private records. Its content package has a dedicated research entry point, keeping this dataset out of unrelated client bundles. Search uses public fields and supports jurisdiction filters, stable pagination and chronology from source date labels. It does not infer residence or legal priority. Map boundaries and moderated contributions remain pending.

Downloads use a fixed source registry, verify the actual bytes at request time, provide SHA-256/ETag metadata, and never accept arbitrary filesystem paths. Legislative downloads are identified as proposals and excluded from search indexing as final law.

Verification: `pnpm test` includes hash, all-sheet/ID reconciliation, provenance, URL safety and search/pagination tests. Public browser checks exercise downloads of all seven originals, cache validation, research search, source rows, unlisted results and desktop/mobile accessibility. CI evidence must be attached to the release commit before recording these browser checks as passed.
