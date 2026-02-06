const supabase = require('../config/supabase');

class Task {
  static async create(taskData) {
    const { 
      user_id, 
      title, 
      description, 
      category, 
      start_time, 
      duration_minutes, 
      recurrence,
      priority,
      created_via 
    } = taskData;
    
    const { data, error } = await supabase
      .from('tasks')
      .insert([{
        user_id,
        title,
        description,
        category,
        start_time,
        duration_minutes,
        recurrence,
        priority: priority || 5,
        created_via: created_via || 'web'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByUserId(user_id, status = null) {
    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    query = query.order('priority', { ascending: true })
                 .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async delete(id) {
    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getTodaysTasks(user_id, timezone = 'UTC') {
    const { DateTime } = require('luxon');
    const start = DateTime.now().setZone(timezone || 'UTC').startOf('day').toUTC();
    const end = start.plus({ days: 1 });
    const startISO = start.toISO();
    const endISO = end.toISO();
    
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .not('status', 'in', '("archived","deleted")')
      .or(`and(start_time.is.null,created_at.gte.${startISO},created_at.lt.${endISO}),and(start_time.gte.${startISO},start_time.lt.${endISO})`)
      .order('priority', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

module.exports = Task;
