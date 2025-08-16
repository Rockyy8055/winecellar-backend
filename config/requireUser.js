const jwt = require('jsonwebtoken');

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'dev-user-secret';

function decodeUserFromAuthHeader(req) {
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      return jwt.verify(token, USER_JWT_SECRET);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function requireUser(req, res, next) {
  const payload = decodeUserFromAuthHeader(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  req.user = payload; // { sub, login, iat, exp }
  next();
}

module.exports = { requireUser, decodeUserFromAuthHeader, USER_JWT_SECRET };