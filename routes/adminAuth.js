const express = require('express');
const jwt = require('jsonwebtoken');
const { ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME } = require('../config/requireAdmin');
const { buildCookieOptions } = require('../config/cookieOptions');

const router = express.Router();

const ADMIN_EMAIL = 'winecellarcustomerservice@gmail.com';
const ADMIN_PASSWORD = 'Winecellar.';
const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

function setAdminSessionCookie(res, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, buildCookieOptions({ maxAge: ADMIN_SESSION_MAX_AGE }));
}

function clearAdminSessionCookie(res) {
  res.cookie(ADMIN_COOKIE_NAME, '', buildCookieOptions({ maxAge: 0, expires: new Date(0) }));
}

router.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ sub: 'admin', email }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
    setAdminSessionCookie(res, token);
    return res.status(200).json({ token, message: 'Login successful' });
  }
  return res.status(401).json({ message: 'Invalid credentials' });
});

router.post('/api/admin/logout', (_req, res) => {
  clearAdminSessionCookie(res);
  return res.status(200).json({ message: 'Logout successful' });
});

module.exports = router;