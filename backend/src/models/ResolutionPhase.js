const supabase = require('../config/supabase');

class ResolutionPhase {
  static async createMany(phases) {
    if (!phases?.length) return [];
    const payload = phases.map((phase) => ({
      ...phase,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('resolution_phases').insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  static async listByPlan(planId) {
    const { data, error } = await supabase
      .from('resolution_phases')
      .select('*')
      .eq('plan_id', planId)
      .order('phase_index', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async getById(phaseId) {
    const { data, error } = await supabase
      .from('resolution_phases')
      .select('*')
      .eq('id', phaseId)
      .single();
    if (error) throw error;
    return data;
  }

  static async getNextPhase(planId, phaseIndex) {
    const { data, error } = await supabase
      .from('resolution_phases')
      .select('*')
      .eq('plan_id', planId)
      .gt('phase_index', phaseIndex)
      .order('phase_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async updateStatus(phaseId, status) {
    const { data, error } = await supabase
      .from('resolution_phases')
      .update({ completion_status: status, updated_at: new Date().toISOString() })
      .eq('id', phaseId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = ResolutionPhase;
