const supabase = require('../config/supabase');

class ResolutionTask {
  static async createMany(tasks) {
    if (!tasks?.length) return [];
    const payload = tasks.map((task) => ({
      ...task,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('resolution_tasks').insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  static async listByPlan(planId) {
    const { data, error } = await supabase
      .from('resolution_tasks')
      .select('*')
      .eq('plan_id', planId)
      .order('date', { ascending: true })
      .order('order_index', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async listByPlanInRange(planId, startDate, endDate) {
    let query = supabase
      .from('resolution_tasks')
      .select('*')
      .eq('plan_id', planId)
      .order('date', { ascending: true })
      .order('order_index', { ascending: true });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async listByUserDateRange(userId, startDate, endDate) {
    let query = supabase
      .from('resolution_tasks')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('order_index', { ascending: true });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async getById(taskId) {
    const { data, error } = await supabase
      .from('resolution_tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    if (error) throw error;
    return data;
  }

  static async countByPhase(phaseId, status) {
    let query = supabase
      .from('resolution_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', phaseId);

    if (status) {
      query = query.eq('status', status);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  static async listByPhase(phaseId) {
    const { data, error } = await supabase
      .from('resolution_tasks')
      .select('*')
      .eq('phase_id', phaseId)
      .order('date', { ascending: true })
      .order('order_index', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async updateStatus(taskId, status) {
    const { data, error } = await supabase
      .from('resolution_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async unlockPhaseTasks(phaseId) {
    const { data, error } = await supabase
      .from('resolution_tasks')
      .update({ locked: false, updated_at: new Date().toISOString() })
      .eq('phase_id', phaseId)
      .select();
    if (error) throw error;
    return data || [];
  }
}

module.exports = ResolutionTask;
