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
      created_via,
      severity,
      metadata,
      p1_metadata
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
        created_via: created_via || 'web',
        severity: severity || 'p2',
        metadata: metadata || {},
        p1_metadata: p1_metadata || {}
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
    
    query = query.order('severity', { ascending: true })
                 .order('priority', { ascending: true })
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

  static async getActiveP1Tasks(user_id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .eq('severity', 'p1')
      .not('status', 'in', '("done","archived")')
      .order('priority', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async updateP1State(id, fields) {
    const payload = {
      ...fields,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async getTodaysTasks(user_id) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .neq('status', 'archived')
      .or(`start_time.is.null,and(start_time.gte.${startISO},start_time.lt.${endISO})`)
      .order('priority', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[Task] getTodaysTasks Supabase error:', error);
      throw error;
    }
    return data || [];
  }
}

module.exports = Task;