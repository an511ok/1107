const test = require('node:test');
const assert = require('node:assert/strict');
const { createSignedState, verifySignedState } = require('../line-state');

const secret = 'test-channel-secret';
const now = 1_800_000_000_000;

test('signed state round-trips and carries independent CSRF and nonce values', () => {
  const created = createSignedState(secret, now);
  assert.match(created.state, /^[a-f0-9]+$/i);
  const payload = verifySignedState(created.state, secret, now + 1);
  assert.equal(payload.csrf, created.csrf);
  assert.equal(payload.nonce, created.nonce);
  assert.notEqual(payload.csrf, payload.nonce);
});

test('rejects state signed by another secret', () => {
  const { state } = createSignedState(secret, now);
  assert.equal(verifySignedState(state, 'different-secret', now), null);
});

test('rejects altered and malformed state', () => {
  const { state } = createSignedState(secret, now);
  const altered = `${state.slice(0, -1)}${state.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifySignedState(altered, secret, now), null);
  assert.equal(verifySignedState('not-a-signed-state', secret, now), null);
  assert.equal(verifySignedState('', secret, now), null);
});

test('rejects expired and future-dated state', () => {
  const { state } = createSignedState(secret, now);
  assert.equal(verifySignedState(state, secret, now + 10 * 60 * 1000 + 1), null);
  const { state: futureState } = createSignedState(secret, now + 1);
  assert.equal(verifySignedState(futureState, secret, now), null);
});
