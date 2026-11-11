import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyMatches } from '../api/_key.js';

test('the dashboard key must match exactly', () => {
  assert.equal(keyMatches('secret', 'secret'), true);
  assert.equal(keyMatches('secret ', 'secret'), false);
  assert.equal(keyMatches('Secret', 'secret'), false);
  assert.equal(keyMatches('', 'secret'), false);
  assert.equal(keyMatches(null, 'secret'), false);
  assert.equal(keyMatches('secret', undefined), false);
  assert.equal(keyMatches('a-much-longer-wrong-key', 'secret'), false);
});
