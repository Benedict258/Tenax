const supabase = require('../config/supabase');

class ResolutionRoadmap {
  static async create(payload) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('resolution_roadmaps')
      .insert([{ ...payload, created_at: now }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async getById(id) {
    const { data, error } = await supabase
      .from('resolution_roadmaps')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  static async listByUser(userId) {
    const { data, error } = await supabase
      .from('resolution_roadmaps')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
}

module.exports = ResolutionRoadmap;
