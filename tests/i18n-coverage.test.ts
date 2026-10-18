import test from 'node:test';
import assert from 'node:assert/strict';
import {dictionary,translate,translationCoverage} from '../packages/i18n/src/index.js';
test('unknown locale never becomes prototype lookup',()=>{
  assert.throws(()=>translate('__proto__' as never),/Unsupported locale/);
  assert.throws(()=>translate('fr' as never),/Unsupported locale/);
});
test('translation coverage is structural and not a human-review claim',()=>{
  const result=translationCoverage();
  assert.equal(result.length,2);
  assert.ok(result.every(row=>row.structureComplete));
  assert.ok(result.every(row=>row.humanReviewed===false));
  assert.equal(translate('es').privacy,dictionary.es.privacy);
});
