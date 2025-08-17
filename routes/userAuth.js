const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('../models/user');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

router.use(cookieParser());

function setAuthCookie(res, token) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.auth_token;
    if (!token) return res.status(401).json({ message: 'Please login to continue.' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (_) {
    return res.status(401).json({ message: 'Please login to continue.' });
  }
}

// POST /api/auth/signup
router.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword } = req.body || {};
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    const normEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normEmail });
    if (existing) return res.status(409).json({ message: 'Email already registered.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, phone, email: normEmail, passwordHash });
    const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    return res.status(201).json({ user: { id: String(user._id), name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normEmail });
    if (!user) return res.status(404).json({ message: 'Please sign up first before login.' });
    const ok = await bcrypt.compare(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Incorrect email or password.' });
    const token = jwt.sign({ userId: String(user._id) }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    return res.status(200).json({ user: { id: String(user._id), name: user.name, email: user.email, phone: user.phone } });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/auth/me
router.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ message: 'Please login to continue.' });
  return res.status(200).json({ user: { id: String(user._id), name: user.name, email: user.email, phone: user.phone } });
});

// POST /api/auth/logout
router.post('/api/auth/logout', requireAuth, (req, res) => {
  res.cookie('auth_token', '', { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 });
  return res.status(200).json({ ok: true });
});

module.exports = { router, requireAuth };