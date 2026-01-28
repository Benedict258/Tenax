const supabase = require('../config/supabase');

class ResolutionBuilderMessage {
  static async create({ session_id, step_key, role, content_text, content_json }) {
    const payload = {
      session_id,
      step_key,
      role,
      content_text,
      content_json,
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('resolution_builder_messages')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async listBySession(sessionId, limit = 200) {
    const { data, error } = await supabase
      .from('resolution_builder_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
}

module.exports = ResolutionBuilderMessage;
