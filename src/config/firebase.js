const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");

let authInstance = null;

/**
 * Initializes the Firebase Admin SDK exactly once, using the MODULAR
 * API (firebase-admin/app, firebase-admin/auth) rather than the legacy
 * `require("firebase-admin")` namespace — in firebase-admin@14.x, the
 * legacy namespace's `admin.credential` is undefined, which is exactly
 * what caused "Cannot read properties of undefined (reading 'cert')".
 * This is what lets the backend independently verify a Firebase ID token
 * sent by the Android app, instead of trusting a uid the client claims to be.
 */
function initFirebaseAdmin() {
  if (authInstance) return authInstance;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not set. See .env.example."
    );
  }
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase service account file not found at: ${serviceAccountPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8")
  );

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(serviceAccount) });

  authInstance = getAuth(app);
  return authInstance;
}

module.exports = { initFirebaseAdmin };