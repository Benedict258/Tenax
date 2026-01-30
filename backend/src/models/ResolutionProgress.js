const supabase = require('../config/supabase');

class ResolutionProgress {
  static async createMany(entries) {
    if (!entries?.length) return [];
    const payload = entries.map((entry) => ({
      ...entry,
      created_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('resolution_progress').insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  static async updateStatus(phaseId, status) {
    const payload = {
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null
    };
    const { data, error } = await supabase
      .from('resolution_progress')
      .update(payload)
      .eq('phase_id', phaseId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = ResolutionProgress;
