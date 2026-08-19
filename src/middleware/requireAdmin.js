const userRepo = require("../repositories/userRepository");

async function requireAdmin(req, res, next) {
  try {
    const role = await userRepo.getUserRole(req.userId);
    if (!role || role.toUpperCase() !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdmin };