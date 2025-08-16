const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret';

function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = payload; // { sub, email, iat, exp }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { requireAdmin, ADMIN_JWT_SECRET };