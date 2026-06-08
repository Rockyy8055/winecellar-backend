const WebUser = require('../models/WebUser');
const bcrypt = require('bcryptjs');
const WebUserLogin = require('../models/webUserLogs');
const jwt = require('jsonwebtoken');
const OTP = require('../models/otp');
const otpGenerator = require('otp-generator');
const { sendMail } = require('../services/emailService');
const { buildCookieOptions } = require('../config/cookieOptions');

const JWT_SECRET = process.env.JWT_SECRET;
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
  return Number(match[1]) * (UNIT_TO_MS[match[2].toLowerCase()] || 1);
}

const COOKIE_MAX_AGE = parseDurationMs(JWT_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createWebUserSessionToken(user) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(
    { id: String(user._id), username: user.username, userType: 'WebUser' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...buildCookieOptions({
      maxAge: COOKIE_MAX_AGE,
    }),
  });
}

function toPublicWebUser(user) {
  return {
    id: String(user._id),
    _id: String(user._id),
    username: user.username,
    email: user.email,
    name: user.username,
    authModel: 'WebUser',
  };
}

const createWebUser = async (user) => {
  const { username, email, password } = user;

  try {
    // Check if a user with the same email already exists
    const existingUser = await WebUser.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return null; 
    }
    const existingUsername = await WebUser.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existingUsername) {
      return null; 
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newWebUser = new WebUser({
      username,
      email,
      password: hashedPassword, 
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return await newWebUser.save();
  } catch (err) {
    return null; 
  }
};

const loginWebUser = async (req, res) => {
    const { username, email, password } = req.body;
  
    try {
      const login = String(username || email || '').trim();
      if (!login || !password) {
        return res.status(400).json({ error: "Username/email and password are required" });
      }

      const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const user = await WebUser.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        ],
      });
      if (!user) {
        return res.status(400).json({ error: "Invalid username or password" });
      }
  
      // Compare the provided password with the stored hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Invalid username or password" });
      }
  
      const token = createWebUserSessionToken(user);
      setAuthCookie(res, token);
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      const newWebUserLogin = new WebUserLogin({
        user_id: user._id,
        login_time: Date.now(),
        chrom_ip: clientIp,
        token,
      });
  
      await newWebUserLogin.save();
  
      res.status(200).json({ success: true, message: "Login successful", token, user: toPublicWebUser(user) });
    } catch (err) {
      res.status(500).json({ error: "Error logging in WebUser" });
    }
  };

const checkUserExistence = async (req, res) => {
    const { username, email } = req.body;
    try {
        const user = await WebUser.findOne({ 
          $or: [
            { username: { $regex: new RegExp(`^${username}$`, 'i') } }, 
            { email: { $regex: new RegExp(`^${email}$`, 'i') } }
          ] 
         });
        if (user) {
          return res.status(200).json({ exists: true });
        } else {
          return res.status(200).json({ exists: false });
        }
    } catch (err) {
      res.status(500).json({ error: "Error checking user existence" });
    }
};

const sendOtp = async (req, res) => {
    const { email, username } = req.body;
    const lowerEmail = normalizeEmail(email);
    const cleanUsername = String(username || '').trim();
    const currentDate = new Date().toISOString().split('T')[0];
  
    try {
      if (!lowerEmail || !cleanUsername) {
        return res.status(400).json({ message: 'Email and username are required' });
      }

      const existingEmail = await WebUser.findOne({ email: { $regex: new RegExp(`^${lowerEmail}$`, 'i') } });
      const existingUsername = await WebUser.findOne({ username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') } });
  
      if (existingEmail) {
        return res.status(400).json({ message: 'Email is already taken' });
      }
  
      if (existingUsername) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
  
      const otpCountToday = await OTP.countDocuments({
        email: lowerEmail,
        date: currentDate,
      });
  
      if (otpCountToday >= 5) {
        return res.status(400).json({ message: 'OTP request limit of 5 per day reached' });
      }
  
      // Generate OTP
      const otp = otpGenerator.generate(6, {
        digits: true,
        alphabets: false,
        specialChars: false,
      });
  
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
  
      const existingOtp = await OTP.findOne({ email: { $regex: new RegExp(`^${lowerEmail}$`, 'i') }, isExpire: false });
  
      if (existingOtp) {
        existingOtp.isExpire = true;
        await existingOtp.save();
      }
  
      const otpDoc = new OTP({
        email: lowerEmail,
        otp: otp,
        expiresAt: expiresAt,
        isExpire: false, 
        date: currentDate, 
        requestCount: otpCountToday + 1,
      });
  
      await otpDoc.save();
  
      await sendMail(email, 'Your OTP Code', `Your OTP code is: ${otp}`);

      res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
};

const verifyOtp = async (req, res) => {
    const { email, otp, username, password } = req.body;
    const lowerEmail = normalizeEmail(email);
    const cleanUsername = String(username || '').trim();
  
    try {
      if (!lowerEmail || !otp || !cleanUsername || !password) {
        return res.status(400).json({ message: 'Email, OTP, username, and password are required' });
      }

      const otpDoc = await OTP.findOne({ email: { $regex: new RegExp(`^${lowerEmail}$`, 'i') }, isExpire: false });
  
      if (!otpDoc) {
        return res.status(400).json({ message: 'OTP not found for the given email or has expired' });
      }
  
      if (new Date() > otpDoc.expiresAt) {
        otpDoc.isExpire = true;
        await otpDoc.save();
        return res.status(400).json({ message: 'OTP has expired' });
      }

      if (otpDoc.otp === otp) {
        const savedWebUser = await createWebUser({ username: cleanUsername, email: lowerEmail, password });
        if (!savedWebUser) {
          return res.status(400).json({ message: "Something is wrong" }); 
        } else {
          const user = savedWebUser;
          const token = createWebUserSessionToken(user);
          setAuthCookie(res, token);
          const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

          const newWebUserLogin = new WebUserLogin({
            user_id: user._id,
            login_time: Date.now(),
            chrom_ip: clientIp,
            token,
          });
          await newWebUserLogin.save();
          otpDoc.isExpire = true;
          await otpDoc.save();
          res.status(200).json({ success: true, message: 'OTP verified and user created successfully', token, user: toPublicWebUser(user) });
        }
      } else {
        return res.status(400).json({ message: 'Invalid OTP' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
};

module.exports = { loginWebUser, checkUserExistence, sendOtp, verifyOtp };
