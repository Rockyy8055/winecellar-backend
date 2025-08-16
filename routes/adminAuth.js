const express = require('express');
const jwt = require('jsonwebtoken');
const { ADMIN_JWT_SECRET } = require('../config/requireAdmin');

const router = express.Router();

const ADMIN_EMAIL = 'winecellarcustomerservice@gmail.com';
const ADMIN_PASSWORD = 'Winecellar.';

router.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ sub: 'admin', email }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

module.exports = router;