const supabase = require('../config/supabase');

class Conversation {
  static async findActiveByUser(userId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  static async create(userId) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('conversations')
      .insert([{ user_id: userId, status: 'active', created_at: now, updated_at: now }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async ensureActive(userId) {
    const existing = await Conversation.findActiveByUser(userId);
    if (existing) {
      return existing;
    }
    return Conversation.create(userId);
  }

  static async touch(conversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = Conversation;
