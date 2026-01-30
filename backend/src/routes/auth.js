const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserChannel = require('../models/UserChannel');
const supabase = require('../config/supabase');
const router = express.Router();

// Register user
router.post('/register', async (req, res) => {
  try {
    const requiredFields = ['name', 'preferred_name', 'email', 'password', 'role', 'reason_for_using', 'primary_goal', 'daily_start_time', 'timezone'];
    const missing = requiredFields.filter((field) => {
      const value = req.body[field];
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return value === undefined || value === null || value === '';
    });

    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const {
      name,
      preferred_name,
      email,
      phone_number,
      password,
      role,
      reason_for_using,
      primary_goal,
      daily_start_time,
      timezone,
      enforce_daily_p1,
      enforce_workout,
      enforce_pre_class_reading,
      enforce_post_class_review,
      availability_pattern,
      timetable_upload_enabled,
      google_calendar_connected,
      tone_preference
    } = req.body;

    const existingUser = (phone_number ? await User.findByPhone(phone_number) : null) || await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this phone or email' });
    }

    const supabaseAuth = supabase.supabaseAuth || supabase;
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: process.env.APP_URL || process.env.SUPABASE_AUTH_REDIRECT_URL
      }
    });

    if (authError) {
      console.error('Supabase auth signup error:', authError.message);
      return res.status(400).json({ error: authError.message });
    }

    const user = await User.create({
      id: authData?.user?.id,
      name,
      preferred_name,
      email,
      phone_number,
      role,
      reason_for_using,
      primary_goal,
      daily_start_time,
      timezone,
      enforce_daily_p1,
      enforce_workout,
      enforce_pre_class_reading,
      enforce_post_class_review,
      availability_pattern,
      timetable_upload_enabled,
      google_calendar_connected,
      tone_preference,
      whatsapp_identity: { phone_number }
    });

    if (phone_number) {
      await UserChannel.link(user.id, 'whatsapp', phone_number, { verified: true, metadata: { source: 'signup' } });
    }

    const needsEmailConfirmation = !authData?.session;
    const token = needsEmailConfirmation
      ? null
      : jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(201).json({
      message: needsEmailConfirmation
        ? 'User registered successfully. Check your email to verify before signing in.'
        : 'User registered successfully.',
      user: {
        id: user.id,
        name: user.name,
        preferred_name: user.preferred_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        reason_for_using: user.reason_for_using,
        primary_goal: user.primary_goal,
        daily_start_time: user.daily_start_time,
        timezone: user.timezone,
        tone_preference: user.tone_preference,
        phone_verified: user.phone_verified
      },
      needs_email_confirmation: needsEmailConfirmation,
      supabase_session: authData?.session || null,
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const supabaseAuth = supabase.supabaseAuth || supabase;
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      const message = authError.message || 'Invalid credentials';
      return res.status(401).json({ error: message });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

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
        preferred_name: user.preferred_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        reason_for_using: user.reason_for_using,
        primary_goal: user.primary_goal,
        daily_start_time: user.daily_start_time,
        timezone: user.timezone,
        tone_preference: user.tone_preference,
        phone_verified: user.phone_verified
      }, 
      token,
      supabase_session: authData?.session
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
