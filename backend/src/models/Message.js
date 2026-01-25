const supabase = require('../config/supabase');

class Message {
  static async create(messageData) {
    const payload = {
      conversation_id: messageData.conversation_id,
      user_id: messageData.user_id,
      channel: messageData.channel,
      role: messageData.role,
      text: messageData.text,
      metadata: messageData.metadata || {},
      created_at: messageData.created_at || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('messages')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findRecentByConversation(conversationId, limit = 20) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).reverse();
  }
}

module.exports = Message;
