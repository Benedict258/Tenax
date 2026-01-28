const supabase = require('../config/supabase');

class ResolutionBuilderSession {
  static async getActiveByUser(userId) {
    const { data, error } = await supabase
      .from('resolution_builder_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  static async create(userId, state = {}) {
    const { data, error } = await supabase
      .from('resolution_builder_sessions')
      .insert([{ user_id: userId, status: 'active', state_json: state }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateState(sessionId, state) {
    const { data, error } = await supabase
      .from('resolution_builder_sessions')
      .update({ state_json: state, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async setStatus(sessionId, status) {
    const { data, error } = await supabase
      .from('resolution_builder_sessions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = ResolutionBuilderSession;
