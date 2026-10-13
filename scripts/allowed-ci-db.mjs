// Exact disposable CI PostgreSQL accounts; not a general localhost-secret exemption.
// Only exact synthetic accounts from checked-in CI and .env.example may appear.
const passwords = Object.freeze({
  cornerstone_migration: 'synthetic_ci_only',
  cornerstone_runtime: 'synthetic_ci_runtime_only',
  cornerstone_worker: 'synthetic_ci_worker_only',
});

export function allowedDisposableCiDatabase(filename, uri) {
  if (typeof uri !== 'string') return false;
  if (filename === '.circleci/config.yml' || filename === '.github/workflows/ci.yml') {
    const match =
      /^postgresql:\/\/([a-z_]+):([a-z_]+)@(?:127\.0\.0\.1|localhost):5432\/cornerstone_test$/.exec(
        uri,
      );
    return !!match && Object.hasOwn(passwords, match[1]) && passwords[match[1]] === match[2];
  }
  if (filename === '.env.example') {
    const match =
      /^postgresql:\/\/([a-z_]+):(local_test_only|local_worker_test_only)@localhost:5432\/cornerstone$/.exec(
        uri,
      );
    return (
      !!match &&
      Object.hasOwn(passwords, match[1]) &&
      match[2] ===
        (match[1] === 'cornerstone_worker' ? 'local_worker_test_only' : 'local_test_only')
    );
  }
  return false;
}
