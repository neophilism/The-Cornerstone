// Exact disposable CI PostgreSQL accounts; not a general localhost-secret exemption.
// Only these credentials in the checked-in CircleCI fixture configuration may appear.
const passwords = Object.freeze({
  cornerstone_migration: 'synthetic_ci_only',
  cornerstone_runtime: 'synthetic_ci_runtime_only',
  cornerstone_worker: 'synthetic_ci_worker_only',
});
export function allowedDisposableCiDatabase(filename, uri) {
  if (filename !== '.circleci/config.yml' || typeof uri !== 'string') return false;
  const match = /^postgresql:\/\/([a-z_]+):([a-z_]+)@(?:127\.0\.0\.1|localhost):5432\/cornerstone_test$/.exec(uri);
  return !!match && Object.hasOwn(passwords, match[1]) && passwords[match[1]] === match[2];
}
