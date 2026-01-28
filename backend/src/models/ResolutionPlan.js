const supabase = require('../config/supabase');

class ResolutionPlan {
  static async create(payload) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('resolution_plans')
      .insert([{ ...payload, created_at: now, updated_at: now }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async update(planId, updates) {
    const { data, error } = await supabase
      .from('resolution_plans')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', planId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async getActiveByUser(userId) {
    const { data, error } = await supabase
      .from('resolution_plans')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'draft'])
      .order('created_at', { ascending: false })
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async getById(planId) {
    const { data, error } = await supabase.from('resolution_plans').select('*').eq('id', planId).single();
    if (error) throw error;
    return data;
  }
}

module.exports = ResolutionPlan;
