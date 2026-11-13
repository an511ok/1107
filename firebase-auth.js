import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, signInWithCustomToken,
  getIdTokenResult,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = window.FIREBASE_CONFIG;
const modal = document.getElementById('authModal');
const topAuthButton = document.getElementById('googleSignIn');
const googleButton = document.getElementById('googleSignInModal');
const lineButton = document.getElementById('lineSignInModal');
const authError = document.getElementById('authError');
const note = document.getElementById('authConfigNote');
let auth = null;
let lineCallback = null;
let lineCallbackState = null;
let consumingLineToken = false;

function showModal() { modal?.classList.add('open'); }
function closeModal() { modal?.classList.remove('open'); }
function setError(message = '') { if (authError) authError.textContent = message; }
function setButtonsDisabled(disabled) {
  [topAuthButton, googleButton, lineButton].filter(Boolean).forEach(button => { button.disabled = disabled; });
}
async function renderUser(user) {
  const name = document.getElementById('profileName');
  const email = document.getElementById('profileEmail');
  const avatar = document.getElementById('profileAvatar');
  const label = document.getElementById('authButtonLabel');
  let isLineUser = false;
  let lineName = '';
  let linePicture = '';
  if (user) {
    try {
      const claims = (await getIdTokenResult(user)).claims;
      if (claims.provider === 'line') { isLineUser = true; lineName = claims.lineName || ''; linePicture = claims.linePicture || ''; }
    } catch { /* The signed-in state still remains valid if profile claims cannot be fetched. */ }
  }
  const displayName = lineName || user?.displayName || user?.email || '訪客';
  if (name) name.textContent = displayName;
  if (email) email.textContent = user ? (isLineUser ? 'LINE 帳戶' : user.email || 'Google 帳戶') : '登入以確認身分';
  if (avatar) {
    avatar.replaceChildren();
    const photoURL = linePicture || user?.photoURL;
    if (photoURL) {
      const image = document.createElement('img');
      image.src = photoURL;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      avatar.append(image);
    } else avatar.textContent = displayName.trim()?.[0] || '訪';
  }
  if (label) label.textContent = user ? '登出' : '登入';
  setButtonsDisabled(false);
  if (user) closeModal();
}
function readableError(error) {
  const messages = {
    'auth/unauthorized-domain': '此網站網域尚未加入 Firebase 授權網域。',
    'auth/operation-not-allowed': 'Firebase 尚未啟用此登入方式。',
    'auth/popup-closed-by-user': '登入視窗已關閉，尚未完成登入。',
    'auth/popup-blocked': '瀏覽器封鎖登入視窗，請允許此網站開啟視窗後重試。',
    'auth/network-request-failed': '網路連線失敗，請確認網路後重試。',
    'auth/invalid-api-key': 'Firebase 設定無效，請檢查設定檔。'
  };
  return messages[error?.code] || `登入未完成：${error?.message || '未知錯誤'}`;
}

async function handleTopAuthAction() {
  setError();
  if (auth?.currentUser) {
    try { await signOut(auth); }
    catch (error) { setError(readableError(error)); }
    return;
  }
  showModal();
}

async function handleGoogleSignIn() {
  setError();
  if (!auth) { showModal(); if (note) note.textContent = 'Firebase 尚未完成設定，請檢查 firebase-config.js。'; return; }
  if (auth.currentUser) { await handleTopAuthAction(); return; }
  setButtonsDisabled(true);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    setError(readableError(error));
    setButtonsDisabled(false);
  }
}

async function handleLineSignIn() {
  setError();
  if (!auth) { setError('Firebase 尚未完成設定。'); return; }
  if (auth.currentUser) { await handleTopAuthAction(); return; }
  const startUrl = firebaseConfig?.lineLoginStartUrl;
  if (!startUrl) { setError('LINE 登入後端尚未部署；請先完成 LINE Developers 與 Firebase Functions 設定。'); return; }
  setButtonsDisabled(true);
  try {
    const response = await fetch(startUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error(`登入服務回應 ${response.status}`);
    const { url, state } = await response.json();
    if (!url || new URL(url).origin !== 'https://access.line.me' || typeof state !== 'string' || state.length < 32) {
      throw new Error('登入服務回傳資料無效');
    }
    sessionStorage.setItem('dayflow.line.login-state', state);
    location.assign(url);
  } catch (error) {
    setError(`無法開始 LINE 登入：${error.message}`);
    setButtonsDisabled(false);
  }
}

topAuthButton?.addEventListener('click', handleTopAuthAction);
googleButton?.addEventListener('click', handleGoogleSignIn);
lineButton?.addEventListener('click', handleLineSignIn);
document.getElementById('closeAuth')?.addEventListener('click', closeModal);
modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

const callbackParams = new URLSearchParams(location.hash.slice(1));
lineCallback = callbackParams.get('line_token');
lineCallbackState = callbackParams.get('line_state');
if (lineCallback || lineCallbackState) history.replaceState(null, '', location.pathname + location.search);

if (firebaseConfig?.apiKey && firebaseConfig?.authDomain && firebaseConfig?.projectId && firebaseConfig?.appId) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    if (note) note.textContent = '使用 Google 或 LINE 帳戶登入；行程仍儲存在此瀏覽器。';
    onAuthStateChanged(auth, async user => {
      if (user) { await renderUser(user); return; }
      if (lineCallback && !consumingLineToken) {
        consumingLineToken = true;
        let expectedState = '';
        try {
          expectedState = sessionStorage.getItem('dayflow.line.login-state') || '';
          sessionStorage.removeItem('dayflow.line.login-state');
        } catch { /* Treat unavailable session storage as a failed CSRF check. */ }
        if (!expectedState || !lineCallbackState || expectedState !== lineCallbackState) {
          lineCallback = null;
          setError('LINE 登入驗證逾時或狀態不符，請重新登入。');
          showModal();
          await renderUser(null);
          return;
        }
        try { await signInWithCustomToken(auth, lineCallback); }
        catch (error) { setError(`LINE 登入未完成：${readableError(error)}`); showModal(); await renderUser(null); }
        finally { lineCallback = null; lineCallbackState = null; }
        return;
      }
      await renderUser(null);
    });
    getRedirectResult(auth).catch(error => { setError(readableError(error)); showModal(); });
    const lineError = new URLSearchParams(location.search).get('line_error');
    if (lineError) {
      const clean = new URL(location.href);
      clean.searchParams.delete('line_error');
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
      try { sessionStorage.removeItem('dayflow.line.login-state'); } catch { /* Ignore unavailable storage. */ }
      setError(lineError === 'cancelled' ? '已取消 LINE 登入。' : 'LINE 登入驗證失敗或逾時，請重試。');
      showModal();
    }
  } catch (error) {
    if (note) note.textContent = `Firebase 初始化失敗：${error.message}`;
  }
} else {
  setButtonsDisabled(false);
}
