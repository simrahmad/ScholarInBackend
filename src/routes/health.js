const express = require("express");
const router = express.Router();

// Public — no auth required. Used to confirm the server is up
// (e.g. from a monitoring tool, or just curl-ing it after deploy).
router.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

module.exports = router;
