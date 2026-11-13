# LINE Login + Firebase Authentication

This repository now contains the static-site login UI and a Firebase Functions v2 backend scaffold. LINE channel credentials are never placed in the website. The backend validates LINE OAuth state and ID-token nonce, then uses Firebase Admin to mint a custom token that the web client exchanges with `signInWithCustomToken()`.

## What is already implemented

- A LINE sign-in choice in the existing sign-in dialog.
- LINE authorization-code flow, callback validation, Firebase custom-token issuance, and client-side state checking.
- Firebase Functions deployment configuration targeting project `project-74953083216937910597`.
- Unit tests for signed OAuth state validation.

LINE login is not active until a LINE Login channel is created, its credentials and callback are configured, and the Functions are deployed.

## Setup needed in your accounts

1. In LINE Developers, create a **LINE Login channel** under a provider. Enable the OpenID Connect `openid` scope and profile scope. Keep the Channel Secret private.
2. Copy `functions/.env.example` to `functions/.env.project-74953083216937910597` and replace `LINE_CHANNEL_ID` with the channel's Channel ID. Keep `APP_ORIGIN`, `ALLOWED_ORIGIN`, and `LINE_CALLBACK_URL` as shown unless the site URL or function region changes. This parameter file is git-ignored.
3. Install/use Firebase CLI and sign in with a project owner/editor account. The project may need the Blaze billing plan to deploy Cloud Functions; upgrading billing can incur charges, so review and approve that in Firebase Console yourself before deployment.
4. From the repository root, set the channel secret without putting it in a file or chat:

   ```sh
   firebase functions:secrets:set LINE_CHANNEL_SECRET --project project-74953083216937910597
   ```

   Enter the secret only at the CLI's secure prompt.
5. Deploy:

   ```sh
   firebase deploy --only functions --project project-74953083216937910597
   ```

   The project uses region `us-central1`. Confirm the deployed `lineLoginCallback` URL matches `LINE_CALLBACK_URL` exactly.
6. In LINE Developers, set that exact deployed HTTPS callback URL in the LINE Login channel's Callback URL.
7. Set `lineLoginStartUrl` in `firebase-config.js` to the deployed `lineLoginStart` URL, then commit and push that public URL value. It is an endpoint, not a secret. Do not add the Channel Secret to `firebase-config.js`.
8. Test from the published HTTPS website on desktop and mobile. Firebase Authentication Authorized domains must include `an511ok.github.io`.

## Security notes

- `.gitignore` excludes `functions/.env.*`, dependency folders and Firebase local state. Never commit LINE Channel Secret or service-account private keys.
- OAuth state is HMAC-signed with the LINE Channel Secret, has a 10-minute expiry and is bound to browser session storage; LINE ID token signature, audience, issuer, expiration and nonce are checked before Firebase token issuance.
- The HTTP start endpoint only accepts the exact configured website Origin and uses CORS. CORS is not a substitute for rate controls; monitor Cloud Functions usage and consider Firebase App Check before broad public use.
- LINE Login here only authenticates the user. It does not sync calendar data across devices. Existing events and tasks remain in browser localStorage.
- Admin SDK token signing in Cloud Functions may require the runtime service account to have `iam.serviceAccounts.signBlob` (Service Account Token Creator) permission. Do not download or commit a service-account key to solve this.
