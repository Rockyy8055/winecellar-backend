const bcrypt = require("bcrypt");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { buildCookieOptions } = require("../config/cookieOptions");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "auth_session";

if (!JWT_SECRET) {
  const message = "JWT_SECRET environment variable is required for authentication.";
  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  } else {
    console.warn(message);
  }
}

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

const createSessionToken = (userId) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign({ userId: String(userId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const generateAccessToken = (user) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign({ _id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "15m" });
};

const generateRefreshToken = (user) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign({ _id: user._id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...buildCookieOptions({
      maxAge: COOKIE_MAX_AGE,
    }),
  });
}

const saveUser = async (req, res) => {
  console.log(req.body);
  const { email, first_name, last_name, telephone, password, role } = req.body;

  try {
    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    // Validate password (example: minimum 8 characters, at least one letter and one number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters and include letters and numbers" });
    }

    // Check if a user with the same email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      first_name,
      last_name,
      password: hashedPassword, // Store the hashed password
      telephone,
      role,
      created_at: Date.now(),
      modified_at: Date.now(),
    });

    const savedUser = await newUser.save();
    console.log("User saved successfully:", savedUser);
    res.status(201).json({ success: true, message: "User created successfully", user: newUser });
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).json({ success: false, message: "Error saving user" });
  }
};

const signInUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    // Find the user by email
    const user = await User.findOne({ email }).select("+password"); // Ensure the password is selected
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate tokens
    const sessionToken = createSessionToken(user._id);
    setAuthCookie(res, sessionToken);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const now = new Date();
    user.last_login = now;
    user.modified_at = now;
    await user.save({ timestamps: false });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        phone: user.phone || null,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    console.error("Error signing in user:", err);
    res.status(500).json({ success: false, message: "Error signing in user" });
  }
};

module.exports = { saveUser, signInUser, generateAccessToken };
