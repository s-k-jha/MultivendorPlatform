const bcrypt = require('bcryptjs');
const { User, Cart } = require('../models');
const { generateToken } = require('../config/jwt');
const {USER_ROLES} = require('../utils/constant')
const nodemailer = require("nodemailer");


let otpStore = {}; 

// Register new user
const register = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      role = USER_ROLES.BUYER,
      company_name,
      company_description
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user
    const userData = {
      first_name,
      last_name,
      email,
      password,
      phone,
      role
    };

    // Add seller-specific fields
    if (role === USER_ROLES.SELLER) {
      userData.company_name = company_name;
      userData.company_description = company_description;
    }

    const user = await User.create(userData);

    // Create cart for buyers
    if (role === USER_ROLES.BUYER) {
      await Cart.create({ user_id: user.id });
    }

    // Generate token
    const token = generateToken({ id: user.id, role: user.role });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Update last login
    await user.update({ last_login: new Date() });

    // Generate token
    const token = generateToken({ id: user.id, role: user.role });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const allowedFields = [
      'first_name',
      'last_name',
      'phone',
      'date_of_birth',
      'gender',
      'company_name',
      'company_description'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const user = await User.findByPk(req.user.id);
    await user.update(updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: user.toJSON() }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const user = await User.findByPk(req.user.id);
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(current_password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await user.update({ password: new_password });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user'
      });
    }

    const token = generateToken({ id: user.id, role: user.role });

    res.json({
      success: true,
      data: { token }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};
// Send OTP
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000 }; // 5 mins

    // Send OTP via email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,  // your gmail
        pass: process.env.SMTP_PASS,   // app password
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
    });

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// Verify OTP (Signup/Login)
const verifyOtp = async (req, res) => {
  try {
    const { email, otp, role = USER_ROLES.BUYER,first_name='guest', last_name='account',password='StrongPassword@123' } = req.body;
    console.log({
      email, first_name, last_name, role, password, otp
    })
    const record = otpStore[email];
    if (!record || record.otp !==  String(otp) || Date.now() > record.expires) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Check if user exists
    let user = await User.findOne({ where: { email } });
    console.log('user', user);

    // If not, create new user
    if (!user) {
      console.log('user not found in db');
      user = await User.create({ email, is_active: 1, first_name, last_name, password });
      if (role === USER_ROLES.BUYER) {
        await Cart.create({ user_id: user.id });
      }
    }

    // Clear OTP after use
    delete otpStore[email];

    // Generate token
    const token = generateToken({ id: user.id, role: user.role });

    res.json({
      success: true,
      message: user ? "Login successful" : "Signup successful",
      data: { user: user.toJSON(), token },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  refreshToken,
  sendOtp,
  verifyOtp
};