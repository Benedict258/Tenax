const supabase = require('../config/supabase');

class User {
  static normalizeReasons(reasons) {
    if (!reasons) return [];
    if (Array.isArray(reasons)) return reasons;
    return String(reasons)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  static async create(userData) {
    const payload = {
      name: userData.name,
      preferred_name: userData.preferred_name || userData.preferredName || userData.name,
      email: userData.email,
      phone_number: userData.phone_number,
      phone_verified: Boolean(userData.phone_verified),
      start_time: userData.start_time || userData.daily_start_time || '07:00:00',
      daily_start_time: userData.daily_start_time || userData.start_time || '07:00:00',
      timezone: userData.timezone || 'Africa/Lagos',
      role: Array.isArray(userData.role) ? userData.role.join(',') : userData.role,
      reason_for_using: User.normalizeReasons(userData.reason_for_using),
      primary_goal: userData.primary_goal,
      enforce_daily_p1: Boolean(userData.enforce_daily_p1),
      enforce_workout: Boolean(userData.enforce_workout),
      enforce_pre_class_reading: Boolean(userData.enforce_pre_class_reading),
      enforce_post_class_review: Boolean(userData.enforce_post_class_review),
      availability_pattern: userData.availability_pattern || 'mixed',
      timetable_upload_enabled: Boolean(userData.timetable_upload_enabled),
      google_calendar_connected: Boolean(userData.google_calendar_connected),
      tone_preference: userData.tone_preference || 'balanced',
      whatsapp_identity: userData.whatsapp_identity || {}
    };

    const { data, error } = await supabase
      .from('users')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateProfile(id, updates = {}) {
    const payload = {
      ...updates,
      preferred_name: updates.preferred_name || updates.preferredName,
      reason_for_using: updates.reason_for_using ? User.normalizeReasons(updates.reason_for_using) : undefined,
      role: Array.isArray(updates.role) ? updates.role.join(',') : updates.role,
      daily_start_time: updates.daily_start_time || updates.start_time,
      updated_at: new Date().toISOString()
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByPhone(phone_number) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phone_number)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // not found allowed
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  static async updatePhoneVerified(id, verified = true) {
    const { data, error } = await supabase
      .from('users')
      .update({ phone_verified: verified, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updatePreferences(id, preferences) {
    const { data, error } = await supabase
      .from('users')
      .update({ preferences, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async listAll(limit = 50) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
}

module.exports = User;