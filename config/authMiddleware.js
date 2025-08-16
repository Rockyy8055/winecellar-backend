const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(
      token,
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIxMjM0NTYiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJleHAiOjE3MzU2ODcxNTh9.Jw_PYkwQBUwRxDYh7WCmVqL0aUphDoCesZrWzm_Tz4s"
    );
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token." });
  }
};

module.exports = authMiddleware;
