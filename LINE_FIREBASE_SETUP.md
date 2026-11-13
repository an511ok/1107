# LINE Login + Firebase Auth 部署備註

此功能使用 LINE Login OAuth 2.1，後端驗證 LINE ID token 後，以 Firebase Admin SDK 簽發 custom token；LINE channel secret 不會放在靜態網站。

## 開發者需要先提供／設定

1. LINE Developers 建立 LINE Login channel，完成 LINE 使用者條款與必要的 channel 設定；提供 Channel ID。Channel secret 請只用 Firebase Functions secret 命令設定，絕不可放進網站檔或聊天。
2. LINE Login channel 的 Callback URL 填入部署後 `lineLoginCallback` HTTPS Function URL。
3. Firebase 專案啟用 Cloud Functions 與 Firestore。Firebase CLI 登入有部署權限的專案管理員帳號。
4. 專案根目錄設定 Firebase Functions：`firebase init functions`（JavaScript；若已初始化請保留既有 firebase.json/firebase config），確保根目錄 `firebase.json` 指向 `functions`。
5. 設定參數：`LINE_CHANNEL_ID`（LINE Developers 的 Channel ID）、`APP_ORIGIN`（`https://an511ok.github.io/1107/`）、`ALLOWED_ORIGIN`（`https://an511ok.github.io`）。使用 `firebase functions:secrets:set LINE_CHANNEL_SECRET` 設定 LINE Channel secret。
6. `firebase deploy --only functions` 部署 `lineLoginStart` 和 `lineLoginCallback`，複製兩個 HTTPS Function URL，寫入 `firebase-config.js` 的 `lineLoginStartUrl`、`lineLoginCallbackUrl`。Callback URL 必須與 LINE Developers 設定完全一致。
7. 將 Firebase Authentication 的 Authorized domains 加入 GitHub Pages 主機 `an511ok.github.io`。
8. Firestore rules 預設拒絕用戶直接讀寫 `lineAuthUsers` 集合；前端登入後仍只驗證身份。若要同步行程，需另外建模並以 `request.auth.uid` 限制資料存取。

## 安全注意

- 不要提交 `.env`、Firebase Admin service account JSON、LINE Channel secret 或私鑰。
- Firebase config 內的 LINE Function URL 是公開端點；函式會限制 Origin、使用短期 HttpOnly state/nonce cookie、驗證 LINE ID token、nonce 和 OAuth state。
- GitHub Pages 是靜態主機，不支援安全保存 LINE Channel secret 或執行 LINE OAuth code exchange；因此 LINE 登入不能只靠前端 Firebase SDK。
