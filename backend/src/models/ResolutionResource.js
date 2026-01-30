const supabase = require('../config/supabase');

class ResolutionResource {
  static async createMany(resources) {
    if (!resources?.length) return [];
    const payload = resources.map((resource) => ({
      ...resource,
      created_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('resolution_resources').insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  static async listByPhase(phaseId) {
    const { data, error } = await supabase
      .from('resolution_resources')
      .select('*')
      .eq('phase_id', phaseId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }
}

module.exports = ResolutionResource;
