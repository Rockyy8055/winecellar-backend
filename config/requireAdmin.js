const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret';
const ADMIN_COOKIE_NAME = process.env.ADMIN_COOKIE_NAME || 'admin_session';

function extractBearerToken(req) {
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && token) {
    return token;
  }
  return null;
}

function extractCookieToken(req) {
  if (!req.cookies) {
    return null;
  }
  return req.cookies[ADMIN_COOKIE_NAME] || null;
}

function extractAdminToken(req) {
  return extractBearerToken(req) || extractCookieToken(req);
}

function requireAdmin(req, res, next) {
  try {
    const token = extractAdminToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    // Ensure token represents an admin user
    if (!payload || payload.sub !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.admin = payload; // { sub, email, iat, exp }
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
}

module.exports = { requireAdmin, ADMIN_JWT_SECRET, ADMIN_COOKIE_NAME, extractAdminToken };