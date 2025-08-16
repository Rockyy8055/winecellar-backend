const express = require("express");
const jwt = require("jsonwebtoken");
const { generateAccessToken } = require("../controllers/userController");
const router = express.Router();

router.post("/refresh-token", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const accessToken = generateAccessToken(decoded);
    res.status(200).json({ accessToken });
  } catch (err) {
    res.status(400).json({ error: "Invalid token." });
  }
});

module.exports = router;
