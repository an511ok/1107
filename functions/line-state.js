const crypto = require('node:crypto');

const STATE_TTL_MS = 10 * 60 * 1000;

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createSignedState(secret, now = Date.now()) {
  const payload = {
    csrf: crypto.randomBytes(32).toString('hex'),
    nonce: crypto.randomBytes(32).toString('hex'),
    issuedAt: now,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('hex');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('hex');
  const signedPayload = `${encodedPayload}.${signature}`;
  return { state: Buffer.from(signedPayload).toString('hex'), csrf: payload.csrf, nonce: payload.nonce };
}

function verifySignedState(state, secret, now = Date.now()) {
  if (typeof state !== 'string' || state.length > 2048 || !/^[a-f0-9]+$/i.test(state)) return null;
  let decodedState;
  try { decodedState = Buffer.from(state, 'hex').toString('utf8'); } catch { return null; }
  const parts = decodedState.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'hex').toString('utf8'));
    const age = now - payload.issuedAt;
    if (!payload.csrf || !payload.nonce || !Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { createSignedState, verifySignedState };
