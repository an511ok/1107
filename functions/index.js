const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createSignedState, verifySignedState } = require('./line-state');

initializeApp();

const lineChannelId = defineString('LINE_CHANNEL_ID');
const lineChannelSecret = defineSecret('LINE_CHANNEL_SECRET');
const appOrigin = defineString('APP_ORIGIN');
const allowedOrigin = defineString('ALLOWED_ORIGIN');
const lineCallbackUrl = defineString('LINE_CALLBACK_URL');

function oneQueryValue(value) {
  return typeof value === 'string' ? value : '';
}

function setCors(req, res) {
  const origin = req.get('origin');
  if (!origin || origin !== allowedOrigin.value()) return false;
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '600');
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return true;
}

function getAppReturnUrl() {
  const url = new URL(appOrigin.value());
  if (url.protocol !== 'https:' || url.origin !== allowedOrigin.value() || url.search || url.hash) {
    throw new Error('Invalid APP_ORIGIN configuration');
  }
  return url;
}

function redirectWithError(res, code) {
  const url = getAppReturnUrl();
  url.searchParams.set('line_error', code);
  res.redirect(303, url.toString());
}

exports.lineLoginStart = onRequest(
  { region: 'us-central1', cors: false, secrets: [lineChannelSecret] },
  (req, res) => {
    if (!setCors(req, res)) return res.status(403).send('Origin not allowed');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    try {
      const callbackUrl = new URL(lineCallbackUrl.value());
      if (callbackUrl.protocol !== 'https:' || callbackUrl.search || callbackUrl.hash) {
        return res.status(500).json({ error: 'LINE callback URL is not configured correctly' });
      }

      const { state, csrf, nonce } = createSignedState(lineChannelSecret.value());
      const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', lineChannelId.value());
      authorizeUrl.searchParams.set('redirect_uri', callbackUrl.toString());
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('scope', 'openid profile');
      authorizeUrl.searchParams.set('nonce', nonce);
      res.status(200).json({ url: authorizeUrl.toString(), state: csrf });
    } catch (error) {
      console.error('Unable to start LINE login:', error.message);
      res.status(500).json({ error: 'LINE login is not configured' });
    }
  },
);

exports.lineLoginCallback = onRequest(
  { region: 'us-central1', cors: false, secrets: [lineChannelSecret] },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') return res.status(405).send('Method not allowed');

    try {
      const secret = lineChannelSecret.value();
      const state = oneQueryValue(req.query.state);
      const statePayload = verifySignedState(state, secret);
      if (!statePayload) return redirectWithError(res, 'invalid_state');
      if (oneQueryValue(req.query.error)) return redirectWithError(res, 'cancelled');

      const code = oneQueryValue(req.query.code);
      if (!code) return redirectWithError(res, 'verification_failed');

      const callbackUrl = lineCallbackUrl.value();
      const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          client_id: lineChannelId.value(),
          client_secret: secret,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error('LINE authorization-code exchange failed');
      const tokens = await tokenResponse.json();
      if (!tokens.id_token) throw new Error('LINE did not return an ID token');

      const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: tokens.id_token, client_id: lineChannelId.value(), nonce: statePayload.nonce }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!verifyResponse.ok) throw new Error('LINE ID-token verification failed');
      const identity = await verifyResponse.json();
      if (
        !identity.sub ||
        identity.aud !== lineChannelId.value() ||
        identity.iss !== 'https://access.line.me' ||
        !Number.isFinite(identity.exp) || identity.exp * 1000 <= Date.now() ||
        !identity.nonce || identity.nonce !== statePayload.nonce
      ) {
        throw new Error('LINE identity claims are invalid');
      }

      const uid = `line_${identity.sub}`;
      const customToken = await getAuth().createCustomToken(uid, {
        provider: 'line',
        lineName: String(identity.name || '').slice(0, 100),
        linePicture: String(identity.picture || '').slice(0, 2048),
      });
      const appUrl = getAppReturnUrl();
      appUrl.hash = new URLSearchParams({ line_token: customToken, line_state: statePayload.csrf }).toString();
      res.redirect(303, appUrl.toString());
    } catch (error) {
      console.error('LINE login callback failed:', error.message);
      try {
        redirectWithError(res, 'verification_failed');
      } catch {
        res.status(500).send('LINE login is not configured');
      }
    }
  },
);
