const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { requireAdmin } = require('../config/requireAdmin');
const { buildCookieOptions } = require('../config/cookieOptions');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  const msg = 'JWT_SECRET environment variable is required for authentication.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  } else {
    console.warn(msg + ' Authentication will not work correctly until it is set.');
  }
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_session';

const UNIT_TO_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDurationMs(value, fallbackMs) {
  if (!value) return fallbackMs;
  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }
  const match = /^\s*(\d+)\s*(ms|s|m|h|d)\s*$/i.exec(value);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return amount * (UNIT_TO_MS[unit] || 1);
}

const COOKIE_MAX_AGE = parseDurationMs(JWT_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...buildCookieOptions({
      maxAge: COOKIE_MAX_AGE,
    }),
  });
}

function clearAuthCookie(res) {
  res.cookie(COOKIE_NAME, '', {
    ...buildCookieOptions({
      maxAge: 0,
      expires: new Date(0),
    }),
  });
}

function createSessionToken(userId) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign({ userId: String(userId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sendAuthRequired(res, message = 'Authentication required') {
  return res.status(401).json({ success: false, message, code: 'AUTH_REQUIRED' });
}

async function resolveUserFromCookie(req, res) {
  if (req._authResolved) return;
  req._authResolved = true;
  req.userId = null;
  req.user = null;

  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token || !JWT_SECRET) {
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || !payload.userId) {
      return;
    }
    req.userId = payload.userId;
    const userDoc = await User.findById(payload.userId).lean();
    if (!userDoc) {
      req.userId = null;
      clearAuthCookie(res);
      return;
    }
    req.user = toPublicUser(userDoc);
  } catch (err) {
    req.userId = null;
    req.user = null;
    clearAuthCookie(res);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to verify auth token:', err.message);
    }
  }
}

async function attachUser(req, res, next) {
  try {
    await resolveUserFromCookie(req, res);
  } catch (err) {
    console.error('attachUser error:', err);
  }
  next();
}

async function requireAuth(req, res, next) {
  await resolveUserFromCookie(req, res);
  if (!req.userId) {
    return sendAuthRequired(res);
  }
  return next();
}

async function optionalAuth(req, res, next) {
  await resolveUserFromCookie(req, res);
  return next();
}

function toPublicUser(user) {
  if (!user) return null;
  const doc = typeof user.toObject === 'function' ? user.toObject() : user;
  const id = doc._id ? String(doc._id) : doc.id ? String(doc.id) : null;
  return {
    id,
    _id: id,
    email: doc.email || null,
    name: doc.name || null,
    phone: doc.phone || null,
  };
}

function requireAuthWithMessage(message) {
  return async (req, res, next) => {
    await resolveUserFromCookie(req, res);
    if (!req.userId) {
      return sendAuthRequired(res, message);
    }
    return next();
  };
}

// POST /api/auth/signup
router.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword } = req.body || {};
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'name, email, password, and confirmPassword are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const normEmail = normalizeEmail(email);
    if (!normEmail) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }
    const existing = await User.findOne({ email: normEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phone, email: normEmail, passwordHash });
    const token = createSessionToken(user._id);
    setAuthCookie(res, token);
    return res.status(201).json({ success: true, message: 'Signup successful.', user: toPublicUser(user) });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Unable to sign up right now.' });
  }
});

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email and password are required.' });
    }

    const normEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normEmail });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = createSessionToken(user._id);
    const now = new Date();
    user.last_login = now;
    user.modified_at = now;
    await user.save({ timestamps: false });
    setAuthCookie(res, token);
    return res.status(200).json({ success: true, message: 'Login successful', user: toPublicUser(user) });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Unable to login right now.' });
  }
});

// GET /api/auth/me
router.get('/api/auth/me', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.sendStatus(401);
  }

  return res.status(200).json(toPublicUser(req.user));
});

// POST /api/auth/logout
router.post('/api/auth/logout', requireAuth, (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({ success: true, message: 'Logout successful' });
});

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    return res.status(500).json({ success: false, message: 'Unable to fetch users right now.' });
  }
});

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

module.exports = { router, requireAuth, optionalAuth, attachUser, sendAuthRequired, requireAuthWithMessage };