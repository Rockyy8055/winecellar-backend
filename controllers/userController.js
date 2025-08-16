const bcrypt = require("bcrypt");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const User = require("../models/user");

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIxMjM0NTYiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJleHAiOjE3MzU2ODcxNTh9.Jw_PYkwQBUwRxDYh7WCmVqL0aUphDoCesZrWzm_Tz4s",
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiIxMjM0NTYiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJleHAiOjE3MzYyOTEwNTh9.ZjxIcPmI9VPnenJAsMmFRo7CfcSalVHUHlQhRw7qllQ",
    { expiresIn: "7d" }
  );
};

const saveUser = async (req, res) => {
  console.log(req.body);
  const { email, first_name, last_name, telephone, password, role } = req.body;

  try {
    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Validate password (example: minimum 8 characters, at least one letter and one number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters long and contain at least one letter and one number",
      });
    }

    // Check if a user with the same email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
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
    res.status(200).json({ message: "User saved successfully" });
  } catch (err) {
    console.error("Error saving user:", err);
    res.status(500).json({ error: "Error saving user" });
  }
};

const signInUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res
      .status(200)
      .json({ message: "Sign-in successful", accessToken, refreshToken });
  } catch (err) {
    console.error("Error signing in user:", err);
    res.status(500).json({ error: "Error signing in user" });
  }
};

module.exports = { saveUser, signInUser, generateAccessToken };
