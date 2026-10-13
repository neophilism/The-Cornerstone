import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedDisposableCiDatabase as permitted} from '../scripts/allowed-ci-db.mjs';
const uri=(user,password,host='127.0.0.1',port='5432',db='cornerstone_test')=>
  'postgresql:'+'//'+user+':'+password+'@'+host+':'+port+'/'+db;
test('accept only exact, documented synthetic CircleCI accounts on loopback',()=>{
 const cases=[['cornerstone_migration','synthetic_ci_only'],['cornerstone_runtime','synthetic_ci_runtime_only'],['cornerstone_worker','synthetic_ci_worker_only']];
 for(const [user,password] of cases){
  assert.equal(permitted('.circleci/config.yml',uri(user,password)),true);
  assert.equal(permitted('.circleci/config.yml',uri(user,password,'localhost')),true);
  assert.equal(permitted('README.md',uri(user,password)),false);
  assert.equal(permitted('.circleci/config.yml',uri(user,password,'db.internal')),false);
  assert.equal(permitted('.circleci/config.yml',uri(user,password,'127.0.0.1','5433')),false);
  assert.equal(permitted('.circleci/config.yml',uri(user,password,'127.0.0.1','5432','production')),false);
  assert.equal(permitted('.circleci/config.yml',uri(user,password+'x')),false);
 }
});
test('never exempt real/local or mistaken role credentials',()=>{
 assert.equal(permitted('.circleci/config.yml',uri('prod_admin','real_password','localhost')),false);
 assert.equal(permitted('.circleci/config.yml',uri('cornerstone_worker','synthetic_ci_only')),false);
 assert.equal(permitted('.circleci/config.yml','not a database URL'),false);
});
