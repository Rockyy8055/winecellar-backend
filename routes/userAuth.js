const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('../models/user');
const { requireAdmin } = require('../config/requireAdmin');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const COOKIE_NAME = 'auth_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

router.use(cookieParser());

const isProduction = process.env.NODE_ENV === 'production';
const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: COOKIE_MAX_AGE,
  });
}

function clearAuthCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    ...baseCookieOptions,
    maxAge: 0,
  });
}

function createSessionToken(userId) {
  return jwt.sign({ userId: String(userId) }, JWT_SECRET, { expiresIn: '7d' });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sendAuthRequired(res) {
  return res.status(401).json({ message: 'Unauthorized' });
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return sendAuthRequired(res);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (_) {
    return sendAuthRequired(res);
  }
}

// Optional auth: never blocks, just sets req.userId when cookie is valid
function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      req.userId = payload.userId;
    } else {
      req.userId = null;
    }
  } catch (_) {
    req.userId = null;
  }
  next();
}

function toPublicUser(user) {
  if (!user) return null;
  return { id: String(user._id), name: user.name, email: user.email, phone: user.phone || null };
}

// POST /api/auth/signup
router.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword } = req.body || {};
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'name, email, password, and confirmPassword are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    const normEmail = normalizeEmail(email);
    if (!normEmail) {
      return res.status(400).json({ message: 'A valid email is required.' });
    }
    const existing = await User.findOne({ email: normEmail });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phone, email: normEmail, passwordHash });
    const token = createSessionToken(user._id);
    setAuthCookie(res, token);
    return res.status(201).json({ message: 'Signup successful.', user: toPublicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: 'Unable to sign up right now.' });
  }
});

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required.' });
    }
    const normEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const token = createSessionToken(user._id);
    const now = new Date();
    user.last_login = now;
    user.modified_at = now;
    await user.save({ timestamps: false });
    setAuthCookie(res, token);
    return res.status(200).json({ message: 'Login successful.', user: toPublicUser(user) });
  } catch (e) {
    return res.status(500).json({ message: 'Unable to login right now.' });
  }
});

// GET /api/auth/me
router.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return sendAuthRequired(res);
  return res.status(200).json({ message: 'Authenticated.', user: toPublicUser(user) });
});

// POST /api/auth/logout
router.post('/api/auth/logout', requireAuth, (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({ message: 'Logout successful.' });
});

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serializeAdminUser(doc) {
  if (!doc) return null;
  const name = doc.name || [doc.first_name, doc.last_name].filter(Boolean).join(' ').trim() || null;
  const email = doc.email || doc.username || null;
  const phone = doc.phone || doc.telephone || null;
  const createdAt = doc.created_at || doc.createdAt || null;
  const lastLoginAt = doc.last_login || doc.lastLoginAt || null;
  return {
    id: String(doc._id),
    name,
    email,
    phone: phone || null,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    lastLoginAt: lastLoginAt ? new Date(lastLoginAt).toISOString() : null,
  };
}

// Admin: list users
router.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
    const search = String(req.query.search || '').trim();

    const filter = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { username: regex },
        { first_name: regex },
        { last_name: regex },
      ];
    }

    const skip = (page - 1) * limit;
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      items: users.map(serializeAdminUser),
      total,
      page,
      limit,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Unable to fetch users right now.' });
  }
});

module.exports = { router, requireAuth, optionalAuth };