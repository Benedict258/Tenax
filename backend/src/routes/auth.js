const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone_number, role } = req.body;
    
    // Validation
    if (!name || !email || !phone_number || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user exists
    const existingUser = await User.findByPhone(phone_number) || await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this phone or email' });
    }
    
    // Create user
    const user = await User.create({ name, email, phone_number, role });
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    res.status(201).json({ 
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        phone_verified: user.phone_verified
      }, 
      token 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, phone_number } = req.body;
    
    if (!email && !phone_number) {
      return res.status(400).json({ error: 'Email or phone number required' });
    }
    
    // Find user
    const user = email ? await User.findByEmail(email) : await User.findByPhone(phone_number);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      { userId: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    res.json({ 
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        phone_verified: user.phone_verified
      }, 
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify phone number
router.post('/verify-phone', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    // TODO: Implement actual OTP verification with Twilio
    // For now, accept any 6-digit code
    if (!otp || otp.length !== 6) {
      return res.status(400).json({ error: 'Invalid OTP format' });
    }
    
    const user = await User.updatePhoneVerified(userId, true);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Phone verified successfully',
      user: {
        id: user.id,
        name: user.name,
        phone_verified: user.phone_verified
      }
    });
  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({ error: 'Phone verification failed' });
  }
});

module.exports = router;