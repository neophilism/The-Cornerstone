import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedDisposableCiDatabase as permitted } from '../scripts/allowed-ci-db.mjs';

const uri = (user, password, host = '127.0.0.1', port = '5432', db = 'cornerstone_test') =>
  'postgresql:' + '//' + user + ':' + password + '@' + host + ':' + port + '/' + db;

test('accept only exact, documented synthetic CircleCI accounts on loopback', () => {
  const cases = [
    ['cornerstone_migration', 'synthetic_ci_only'],
    ['cornerstone_runtime', 'synthetic_ci_runtime_only'],
    ['cornerstone_worker', 'synthetic_ci_worker_only'],
  ];
  for (const [user, password] of cases) {
    assert.equal(permitted('.circleci/config.yml', uri(user, password)), true);
    assert.equal(permitted('.circleci/config.yml', uri(user, password, 'localhost')), true);
    assert.equal(permitted('README.md', uri(user, password)), false);
    assert.equal(permitted('.circleci/config.yml', uri(user, password, 'db.internal')), false);
    assert.equal(permitted('.circleci/config.yml', uri(user, password, '127.0.0.1', '5433')), false);
    assert.equal(
      permitted('.circleci/config.yml', uri(user, password, '127.0.0.1', '5432', 'production')),
      false,
    );
    assert.equal(permitted('.circleci/config.yml', uri(user, password + 'x')), false);
  }
});

test('never exempt real/local or mistaken role credentials', () => {
  assert.equal(permitted('.circleci/config.yml', uri('prod_admin', 'real_password', 'localhost')), false);
  assert.equal(permitted('.circleci/config.yml', uri('cornerstone_worker', 'synthetic_ci_only')), false);
  assert.equal(permitted('.circleci/config.yml', 'not a database URL'), false);
});

test('allow exactly documented GitHub Actions CI and .env example accounts', () => {
  assert.equal(
    permitted('.github/workflows/ci.yml', uri('cornerstone_migration', 'synthetic_ci_only', 'localhost')),
    true,
  );
  assert.equal(
    permitted('.github/workflows/ci.yml', uri('cornerstone_worker', 'synthetic_ci_worker_only', 'localhost')),
    true,
  );
  assert.equal(
    permitted('.env.example', uri('cornerstone_runtime', 'local_test_only', 'localhost', '5432', 'cornerstone')),
    true,
  );
  assert.equal(
    permitted(
      '.env.example',
      uri('cornerstone_worker', 'local_worker_test_only', 'localhost', '5432', 'cornerstone'),
    ),
    true,
  );
  assert.equal(
    permitted('.env.example', uri('cornerstone_worker', 'real_password', 'localhost', '5432', 'cornerstone')),
    false,
  );
  assert.equal(
    permitted(
      '.env.example',
      uri('cornerstone_migration', 'local_worker_test_only', 'localhost', '5432', 'cornerstone'),
    ),
    false,
  );
  assert.equal(
    permitted('README.md', uri('cornerstone_runtime', 'local_test_only', 'localhost', '5432', 'cornerstone')),
    false,
  );
});

test('scanner still must detect credentials on loopback outside exact allowlist', () => {
  for (const bad of [
    uri('cornerstone_migration', 'synthetic_ci_only', '127.0.0.1', '5432', 'production'),
    uri('cornerstone_migration', 'local_test_only', 'db.private'),
    uri('root', 'actual_password', 'localhost', '5432', 'cornerstone'),
  ])
    assert.equal(permitted('.github/workflows/ci.yml', bad), false);
});
