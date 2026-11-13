import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, signInWithCustomToken } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = window.FIREBASE_CONFIG;
const modal = document.getElementById('authModal');
const signInButtons = [document.getElementById('googleSignIn'), document.getElementById('googleSignInModal')].filter(Boolean);
const lineButtons = [document.getElementById('lineSignInModal')].filter(Boolean);
const authError = document.getElementById('authError');
const note = document.getElementById('authConfigNote');
let auth = null;
let pendingLine = false;

function showModal() { modal?.classList.add('open'); }
function closeModal() { modal?.classList.remove('open'); }
function setError(message = '') { if (authError) authError.textContent = message; }
function renderUser(user) {
  const name = document.getElementById('profileName');
  const email = document.getElementById('profileEmail');
  const avatar = document.getElementById('profileAvatar');
  const label = document.getElementById('authButtonLabel');
  if (name) name.textContent = user?.displayName || user?.email || '訪客';
  if (email) email.textContent = user ? (user.providerData?.[0]?.providerId === 'custom' ? 'LINE 帳戶' : user.email || 'Google 帳戶') : '登入以確認身分';
  if (avatar) {
    avatar.replaceChildren();
    if (user?.photoURL) { const image = document.createElement('img'); image.src = user.photoURL; image.alt = ''; avatar.append(image); }
    else avatar.textContent = user?.displayName?.trim()?.[0] || user?.email?.[0] || '訪';
  }
  if (label) label.textContent = user ? '登出' : '登入';
  [...signInButtons, ...lineButtons].forEach(button => { button.disabled = false; });
}
function readableError(error) {
  const messages = {
    'auth/unauthorized-domain': '此網站網域尚未加入 Firebase 授權網域。',
    'auth/operation-not-allowed': 'Firebase 尚未啟用此登入方式。',
    'auth/popup-closed-by-user': '登入視窗已關閉，尚未完成登入。',
    'auth/popup-blocked': '瀏覽器封鎖了登入視窗，請允許此網站開啟視窗後重試。',
    'auth/network-request-failed': '網路連線失敗，請確認網路後重試。',
    'auth/invalid-api-key': 'Firebase 設定無效，請檢查設定檔。'
  };
  return messages[error?.code] || `登入未完成：${error?.message || '未知錯誤'}`;
}
async function handleGoogleSignIn() {
  setError();
  if (!auth) { showModal(); if (note) note.textContent = 'Firebase 尚未完成設定，請檢查 firebase-config.js。'; return; }
  if (auth.currentUser) { try { await signOut(auth); } catch (error) { setError(readableError(error)); } return; }
  [...signInButtons, ...lineButtons].forEach(button => { button.disabled = true; });
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) { setError(readableError(error)); [...signInButtons, ...lineButtons].forEach(button => { button.disabled = false; }); }
}
async function handleLineSignIn() {
  setError();
  if (!auth) { setError('Firebase 尚未完成設定。'); return; }
  if (auth.currentUser) { try { await signOut(auth); } catch (error) { setError(readableError(error)); } return; }
  if (!firebaseConfig?.lineLoginStartUrl) { setError('LINE 登入尚未部署後端：請依 LINE_FIREBASE_SETUP.md 完成 Firebase Functions 與 LINE Developers 設定。'); return; }
  lineButtons.forEach(button => { button.disabled = true; });
  try {
    const response = await fetch(firebaseConfig.lineLoginStartUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error(`LINE login start failed (${response.status})`);
    const { url } = await response.json();
    if (!url || new URL(url).origin !== 'https://access.line.me') throw new Error('Invalid LINE authorization URL');
    pendingLine = true;
    location.assign(url);
  } catch (error) { setError(`無法開始 LINE 登入：${error.message}`); lineButtons.forEach(button => { button.disabled = false; }); }
}
signInButtons.forEach(button => button.addEventListener('click', handleGoogleSignIn));
lineButtons.forEach(button => button.addEventListener('click', handleLineSignIn));
document.getElementById('closeAuth')?.addEventListener('click', closeModal);
modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

if (firebaseConfig?.apiKey && firebaseConfig?.authDomain && firebaseConfig?.projectId && firebaseConfig?.appId) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    if (note) note.textContent = '使用 Google 或 LINE 帳戶登入；行程仍儲存在此瀏覽器。';
    onAuthStateChanged(auth, async user => {
      if (user) { renderUser(user); return; }
      const params = new URLSearchParams(location.hash.slice(1));
      const token = params.get('line_token');
      if (token && !pendingLine) {
        pendingLine = true;
        history.replaceState(null, '', location.pathname + location.search);
        try { await signInWithCustomToken(auth, token); }
        catch (error) { setError(`LINE 登入未完成：${readableError(error)}`); }
      } else renderUser(null);
    });
    getRedirectResult(auth).catch(error => setError(readableError(error)));
    const lineError = new URLSearchParams(location.search).get('line_error');
    if (lineError) {
      const clean = new URL(location.href); clean.searchParams.delete('line_error'); history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
      setError(lineError === 'cancelled' ? '已取消 LINE 登入。' : 'LINE 身分驗證失敗，請重試。'); showModal();
    }
  } catch (error) { if (note) note.textContent = `Firebase 初始化失敗：${error.message}`; }
} else [...signInButtons, ...lineButtons].forEach(button => { button.disabled = false; });
