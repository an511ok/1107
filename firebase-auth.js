import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = window.FIREBASE_CONFIG;
const modal = document.getElementById('authModal');
const signInButtons = [document.getElementById('googleSignIn'), document.getElementById('googleSignInModal')].filter(Boolean);
const authError = document.getElementById('authError');
const note = document.getElementById('authConfigNote');
let auth = null;

function showModal() { modal?.classList.add('open'); }
function closeModal() { modal?.classList.remove('open'); }
function setError(message = '') { if (authError) authError.textContent = message; }
function renderUser(user) {
  const name = document.getElementById('profileName');
  const email = document.getElementById('profileEmail');
  const avatar = document.getElementById('profileAvatar');
  const label = document.getElementById('authButtonLabel');
  if (name) name.textContent = user?.displayName || '訪客';
  if (email) email.textContent = user?.email || '登入以確認身分';
  if (avatar) {
    avatar.replaceChildren();
    if (user?.photoURL) {
      const image = document.createElement('img');
      image.src = user.photoURL;
      image.alt = '';
      avatar.append(image);
    } else avatar.textContent = user?.displayName?.trim()?.[0] || '訪';
  }
  if (label) label.textContent = user ? '登出' : 'Google 登入';
  signInButtons.forEach(button => { button.disabled = false; });
}
function readableError(error) {
  const messages = {
    'auth/unauthorized-domain': '此網站網域尚未加入 Firebase 授權網域。請將公開網址的主機名稱加入 Firebase Authentication 設定。',
    'auth/operation-not-allowed': 'Firebase 尚未啟用 Google 登入提供者。',
    'auth/popup-closed-by-user': '登入視窗已關閉，尚未完成登入。',
    'auth/popup-blocked': '瀏覽器封鎖了登入視窗，請允許此網站開啟視窗後重試。',
    'auth/network-request-failed': '網路連線失敗，請確認網路後重試。',
    'auth/invalid-api-key': 'Firebase 設定無效，請檢查 firebase-config.js。'
  };
  return messages[error?.code] || `登入未完成：${error?.message || '未知錯誤'}`;
}
async function handleSignIn() {
  setError();
  if (!auth) {
    showModal();
    if (note) note.textContent = '尚未加入 Firebase 網頁應用程式設定。請依 FIREBASE_SETUP.md 建立 firebase-config.js，再部署網站。';
    return;
  }
  const user = auth.currentUser;
  if (user) {
    try { await signOut(auth); }
    catch (error) { setError(readableError(error)); }
    return;
  }
  const buttons = signInButtons;
  buttons.forEach(button => { button.disabled = true; });
  if (note) note.textContent = '';
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) await signInWithRedirect(auth, provider);
    else await signInWithPopup(auth, provider);
  } catch (error) {
    setError(readableError(error));
    buttons.forEach(button => { button.disabled = false; });
  }
}

signInButtons.forEach(button => button.addEventListener('click', handleSignIn));
document.getElementById('closeAuth')?.addEventListener('click', closeModal);
modal?.addEventListener('click', event => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

if (firebaseConfig && typeof firebaseConfig === 'object' && firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    if (note) note.textContent = '使用 Firebase Authentication 驗證 Google 帳戶；行程仍儲存在此瀏覽器。';
    onAuthStateChanged(auth, renderUser);
    getRedirectResult(auth).catch(error => setError(readableError(error)));
  } catch (error) {
    if (note) note.textContent = `Firebase 初始化失敗：${error.message}`;
  }
} else {
  signInButtons.forEach(button => button.disabled = false);
}
