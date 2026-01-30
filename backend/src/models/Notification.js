const supabase = require('../config/supabase');

class Notification {
  static async create(payload) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async listByUser(userId, { limit = 50, unreadOnly = false } = {}) {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async markRead(userId, ids = []) {
    if (!ids.length) return [];
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .in('id', ids)
      .select();
    if (error) throw error;
    return data || [];
  }
}

module.exports = Notification;
