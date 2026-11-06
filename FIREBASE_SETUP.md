# Firebase Google 登入設定

前端登入程式已加入網站，但此儲存庫尚未有 Firebase 專案設定。Google 登入在完成下列一次性設定前會顯示提示，不會假裝登入成功。

## 1. 建立 Firebase 網頁應用程式

1. 在 Firebase Console 建立或選取專案，新增一個 Web app。
2. Authentication → Sign-in method（或 Sign-in providers）→ 啟用 **Google**。
3. Authentication → Settings → Authorized domains，加入正式網站主機名稱。GitHub Pages 專案網站通常為 `an511ok.github.io`（不含 `https://`、路徑或結尾斜線）。
4. 在 Web app 設定頁複製 Firebase config 中的 `apiKey`、`authDomain`、`projectId`、`appId`。

## 2. 安裝公開的前端設定檔

複製 `firebase-config.example.js` 為 `firebase-config.js`，將上述四個實際值填入；再把 `firebase-config.js` 一併提交並推送至 `main`。此設定檔會公開給網站訪客：Firebase Web config 是識別專案用的公開設定，不可放入服務帳戶 JSON、Admin SDK 私鑰或其他秘密。請另以 Firebase Security Rules、授權網域及 API 限制保護專案。

## 3. 部署及測試

部署完成後，使用正式 HTTPS 網站測試。桌面瀏覽器使用彈出式登入；手機瀏覽器使用重新導向登入。若 GitHub Pages 網址仍顯示 404，先完成 GitHub Pages 發布設定。若看到 `auth/unauthorized-domain`，確認正式主機名稱已加入 Authorized domains。

## 資料與隱私範圍

目前登入僅驗證 Google 身分並在側欄顯示帳戶資訊。既有行程和待辦仍存於該瀏覽器的 localStorage，登入不會將它們上傳或同步到其他裝置；跨裝置同步需另外設計 Firestore 資料模型與安全規則。
