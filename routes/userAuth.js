const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { USER_JWT_SECRET } = require('../config/requireUser');

const router = express.Router();

// POST /api/auth/register { login, password, name, email, phone }
router.post('/api/auth/register', async (req, res) => {
  try {
    const { login, password, name, email, phone } = req.body || {};
    if (!login || !password) return res.status(400).json({ error: 'login and password required' });
    const existing = await User.findOne({ email: email || login });
    if (existing) return res.status(400).json({ error: 'User already exists' });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({
      email: email || `${login}@local`,
      first_name: name || login,
      last_name: '',
      telephone: phone || '',
      password: hash,
    });
    await user.save();
    const token = jwt.sign({ sub: String(user._id), login }, USER_JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login { login, password }
router.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};
    if (!login || !password) return res.status(400).json({ error: 'login and password required' });
    const user = await User.findOne({ email: login });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: String(user._id), login }, USER_JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;