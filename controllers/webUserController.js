const WebUser = require('../models/WebUser');
const bcrypt = require('bcryptjs');
const WebUserLogin = require('../models/webUserLogs');
const jwt = require('jsonwebtoken');
const OTP = require('../models/otp');
const otpGenerator = require('otp-generator');
const { sendMail } = require('../services/emailService');

const createWebUser = async (user) => {
  const { username, email, password } = user;

  try {
    // Check if a user with the same email already exists
    const existingUser = await WebUser.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return false; 
    }
    const user = await WebUser.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (user) {
      return false; 
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

    const savedWebUser = await newWebUser.save();
    return true; 
  } catch (err) {
    return false; 
  }
};

const loginWebUser = async (req, res) => {
    const { username, password } = req.body;
  
    try {
      const user = await WebUser.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
      if (!user) {
        return res.status(400).json({ error: "Invalid username or password" });
      }
  
      // Compare the provided password with the stored hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Invalid username or password" });
      }
  
      const token = jwt.sign({ id: user._id , username: user.username}, process.env.JWT_SECRET, { expiresIn: '1h' });
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      const newWebUserLogin = new WebUserLogin({
        user_id: user._id,
        login_time: Date.now(),
        chrom_ip: clientIp,
        token,
      });
  
      await newWebUserLogin.save();
  
      res.status(200).json({ message: "Login successful", token });
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
    const lowerEmail = email.toLowerCase();
    const currentDate = new Date().toISOString().split('T')[0];
  
    try {
      const existingEmail = await WebUser.findOne({ email: { $regex: new RegExp(`^${lowerEmail}$`, 'i') } });
      const existingUsername = await WebUser.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
  
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
    const lowerEmail = email.toLowerCase();
  
    try {
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
        const savedWebUser = await createWebUser({ username, email: lowerEmail, password });
        if (!savedWebUser) {
          return res.status(400).json({ message: "Something is wrong" }); 
        } else {
          const user = await WebUser.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
          const token = jwt.sign({ id: user._id , username: user.username}, process.env.JWT_SECRET, { expiresIn: '1h' });
          const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

          const newWebUserLogin = new WebUserLogin({
            user_id: user._id,
            login_time: Date.now(),
            chrom_ip: clientIp,
            token,
          });
          await newWebUserLogin.save();
          res.status(200).json({ message: 'OTP verified and user created successfully', token });
        }
      } else {
        return res.status(400).json({ message: 'Invalid OTP' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
};

module.exports = { loginWebUser, checkUserExistence, sendOtp, verifyOtp };