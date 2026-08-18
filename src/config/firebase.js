const admin = require("firebase-admin");
const fs = require("fs");

let initialized = false;

/**
 * Initializes the Firebase Admin SDK exactly once.
 * This is what lets the backend independently verify a Firebase ID token
 * sent by the Android app, instead of trusting a uid the client claims to be.
 */
function initFirebaseAdmin() {
  if (initialized) return admin;

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

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
  return admin;
}

module.exports = { initFirebaseAdmin };
