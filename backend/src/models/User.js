const supabase = require('../config/supabase');

class User {
  static async create(userData) {
    const { name, email, phone_number, role } = userData;
    
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email, phone_number, role }])
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