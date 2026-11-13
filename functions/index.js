const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('node:crypto');

initializeApp();
const lineChannelId = defineString('LINE_CHANNEL_ID');
const lineChannelSecret = defineSecret('LINE_CHANNEL_SECRET');
const appOrigin = defineString('APP_ORIGIN');
const allowedOrigin = defineString('ALLOWED_ORIGIN');
const COOKIE_NAME = '__Host-dayflow_line_state';
const MAX_AGE_SECONDS = 10 * 60;

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function setCors(req, res) {
  const origin = req.get('origin');
  if (origin !== allowedOrigin.value()) return false;
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}
function redirectWithError(res, code) {
  const url = new URL('/', appOrigin.value());
  url.searchParams.set('line_error', code);
  res.redirect(302, url.toString());
}

exports.lineLoginStart = onRequest({ cors: false }, (req, res) => {
  if (!setCors(req, res)) return res.status(403).send('Origin not allowed');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  res.set('Set-Cookie', `${COOKIE_NAME}=${state}.${nonce}; Path=/; Max-Age=${MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=None`);
  const callback = `${req.protocol}://${req.get('host')}/lineLoginCallback`;
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', lineChannelId.value());
  authorize.searchParams.set('redirect_uri', callback);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'openid profile');
  authorize.searchParams.set('nonce', nonce);
  res.json({ url: authorize.toString() });
});

exports.lineLoginCallback = onRequest({ cors: false, secrets: [lineChannelSecret] }, async (req, res) => {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE_NAME}=`));
  const saved = cookie?.slice(COOKIE_NAME.length + 1).split('.') || [];
  const { state, code, error } = req.query;
  res.set('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None`);
  if (error || !state || !code || saved.length !== 2 || !safeEqual(state, saved[0])) return redirectWithError(res, 'cancelled');
  try {
    const callback = `${req.protocol}://${req.get('host')}/lineLoginCallback`;
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: callback, client_id: lineChannelId.value(), client_secret: lineChannelSecret.value() });
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    if (!tokenResponse.ok) throw new Error('LINE token exchange failed');
    const tokens = await tokenResponse.json();
    const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: tokens.id_token, client_id: lineChannelId.value() }) });
    if (!verifyResponse.ok) throw new Error('LINE ID token verification failed');
    const identity = await verifyResponse.json();
    if (!identity.sub || !identity.nonce || !safeEqual(identity.nonce, saved[1])) throw new Error('LINE identity verification failed');
    const uid = `line:${identity.sub}`;
    const claims = { provider: 'line', lineName: identity.name || '', linePicture: identity.picture || '' };
    const userRef = getFirestore().collection('lineAuthUsers').doc(crypto.createHash('sha256').update(uid).digest('hex'));
    const existing = await userRef.get();
    if (!existing.exists) await userRef.create({ uid, createdAt: new Date() });
    const customToken = await getAuth().createCustomToken(uid, claims);
    const target = new URL('/', appOrigin.value());
    target.hash = new URLSearchParams({ line_token: customToken }).toString();
    res.redirect(303, target.toString());
  } catch (err) {
    console.error('LINE login callback failed:', err.message);
    redirectWithError(res, 'verification_failed');
  }
});
