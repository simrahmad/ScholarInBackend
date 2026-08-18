const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

// Protected — this is the "did auth actually work" test endpoint for Phase 1.
// It deliberately does nothing except echo back what the backend independently
// verified about the caller, so you can confirm end-to-end that a real
// Firebase ID token from the Android app is being correctly validated here.
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({
      uid: req.userId,
      email: req.userEmail,
      message: "Token verified successfully by the backend.",
    });
  })
);

module.exports = router;
