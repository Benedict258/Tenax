const supabase = require('../config/supabase');
const User = require('./User');

class UserChannel {
  static async link(userId, channel, externalId, { verified = false, metadata = {} } = {}) {
    const existing = await supabase
      .from('user_channels')
      .select('*')
      .eq('user_id', userId)
      .eq('channel', channel)
      .maybeSingle();

    const payload = {
      user_id: userId,
      channel,
      external_id: externalId,
      verified,
      metadata,
      created_at: new Date().toISOString()
    };

    if (existing.data) {
      const { data, error } = await supabase
        .from('user_channels')
        .update({ ...payload, created_at: existing.data.created_at })
        .eq('id', existing.data.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('user_channels')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findUserByChannel(channel, externalId) {
    const { data, error } = await supabase
      .from('user_channels')
      .select('user_id')
      .eq('channel', channel)
      .eq('external_id', externalId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return User.findById(data.user_id);
  }
}

module.exports = UserChannel;
