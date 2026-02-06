const supabase = require('../config/supabase');

class Task {
  static normalizePriority(priority) {
    if (typeof priority === 'number') {
      return priority;
    }
    const label = String(priority || '').toUpperCase();
    if (label === 'P1') return 1;
    if (label === 'P2') return 2;
    if (label === 'P3') return 3;
    return 5;
  }

  static normalizeSeverity(severity) {
    if (!severity) return 'p2';
    const value = String(severity).toLowerCase();
    if (value === 'p1' || value === 'p2' || value === 'p3') {
      return value;
    }
    return 'p2';
  }

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
        priority: Task.normalizePriority(priority),
        created_via: created_via || 'web',
        severity: Task.normalizeSeverity(severity),
        metadata: metadata || {},
        p1_metadata: p1_metadata || {}
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async createMany(taskDataList = []) {
    if (!taskDataList.length) return [];
    const payload = taskDataList.map((task) => ({
      user_id: task.user_id,
      title: task.title,
      description: task.description,
      category: task.category || 'Other',
      start_time: task.start_time,
      duration_minutes: task.duration_minutes,
      recurrence: task.recurrence || null,
      priority: Task.normalizePriority(task.priority),
      created_via: task.created_via || 'system',
      severity: Task.normalizeSeverity(task.severity),
      metadata: task.metadata || {},
      p1_metadata: task.p1_metadata || {}
    }));

    const { data, error } = await supabase
      .from('tasks')
      .insert(payload)
      .select();

    if (error) throw error;
    return data || [];
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

  static async updateFields(id, fields) {
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

  static async delete(id) {
    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();

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

    if (error) {
      console.error('[Task] getTodaysTasks Supabase error:', error);
      throw error;
    }
    return data || [];
  }

  static async findByUserSince(user_id, sinceISO) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async findRecent(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async findByResolutionTaskIds(user_id, resolutionTaskIds = []) {
    if (!resolutionTaskIds.length) return [];
    const { data, error } = await supabase
      .from('tasks')
      .select('id, metadata')
      .eq('user_id', user_id)
      .eq('created_via', 'resolution_builder')
      .in('metadata->>resolution_task_id', resolutionTaskIds);

    if (error) throw error;
    return data || [];
  }

  static async listByDateRange(user_id, startISO, endISO) {
    if (!user_id || !startISO || !endISO) return [];
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .not('status', 'in', '("archived","deleted")')
      .gte('start_time', startISO)
      .lt('start_time', endISO)
      .order('start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}

module.exports = Task;
