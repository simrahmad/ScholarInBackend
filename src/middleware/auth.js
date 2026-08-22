const { initFirebaseAdmin } = require("../config/firebase");

/**
 * Verifies the Firebase ID token sent in the Authorization header.
 * On success, attaches the verified uid to req.userId — every route
 * downstream trusts req.userId, and ONLY req.userId, never a uid
 * the client sends in the request body.
 *
 * Android side: attach the token like this before calling any protected route:
 *   val idToken = FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token
 *   request.header("Authorization", "Bearer $idToken")
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

    try {
    const auth = initFirebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    req.userId = decoded.uid;
    req.userEmail = decoded.email || null;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

module.exports = { requireAuth };
