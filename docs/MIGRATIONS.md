# Migration preflight and recovery

Use a direct owner connection in `MIGRATION_DATABASE_URL`, never a runtime or worker credential or a transaction pooler. The application runtime remains separate. Inspect the exact project, branch, database and source commit before executing; production changes still require the separately reviewed recovery path and explicit approval described in DEPLOYMENT.md.

`pnpm db:check` validates the complete repository migration inventory against the database ledger without applying migrations or changing persistent data. Its output identifies pending filenames, their SHA-256 digests and the complete inventory digest. It takes the same nonblocking session advisory lock as the apply command, so a competing migration causes refusal rather than a stale observation. A successful preflight reports compatibility, not that pending migrations have been applied or that the application is authorized for production.

`pnpm db:migrate` performs that preflight and applies each pending file and its ledger entry in one transaction. Versions must be unique and contiguous from 001; applied entries must be an exact prefix. A changed digest, missing historical file, duplicate version, gap, malformed name or empty source stops the run before any new migration writes. This prevents an older checkout from silently accepting a newer database and prevents a later mismatch from being detected only after earlier pending work has committed.

The command prints no connection string or credentials. The inventory is source metadata, not a database backup or security attestation. An initial database has no ledger until migration 001 commits. Repeating an up-to-date migration run executes no files and does not change ledger timestamps.

## Failure and recovery

A failure inside a file rolls back that file's DDL, data changes and ledger entry. Earlier successfully committed files remain applied. Stop dependent application deployment, retain the failed command's diagnostic output without private data, reconcile the exact source/ledger and retry only the corrected, unapplied migration. Do not edit a migration already recorded as applied, delete ledger rows, or automatically run destructive down migrations to silence a mismatch. Restore from the reviewed provider recovery procedure when required; this runner does not itself demonstrate provider restoration, key continuity or recovery time objectives.

The lock is released on normal completion or failure and by PostgreSQL when the connection ends. Contention is an explicit error; it cannot cause two runners to share a stale plan. A transaction pooler can break session-lock ownership, which is why recognized Neon pooler hosts are refused. Other proxies must also be checked operationally; hostname validation is not a universal pooler detector.

## Acceptance

`tests/migration-plan.test.ts` covers deterministic fresh/partial/current plans, edited or removed history, gaps, duplicates, source corruption and connection-role/pooler refusal. `node --import tsx tests/migrations.integration.ts` runs against the isolated CI PostGIS database after its normal migration step. It checks the actual application ledger for no-op replay, then uses a uniquely named scratch schema for check-only behavior, successful replay, transactional DDL rollback, drift refusal and two-session exclusion. Cleanup drops only that test-created scratch schema. These tests do not mutate the supplied production branch.

The source-evidence workflow separately retains the checked-out commit, tree and checksum-bound tracked-source archive for seven days. It omits working files and Git history and has read-only repository permissions with checkout credentials not persisted. A source snapshot is not a passed test result, signature, independent assessment or institutional authorization. Review actual CI results and the deployed commit separately.
