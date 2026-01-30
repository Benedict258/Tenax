const supabase = require('../config/supabase');

class ResolutionDailyItem {
  static async createMany(items) {
    if (!items?.length) return [];
    const payload = items.map((item) => ({
      ...item,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    const { data, error } = await supabase.from('resolution_daily_items').insert(payload).select();
    if (error) throw error;
    return data || [];
  }

  static async listByPlan(planId) {
    const { data, error } = await supabase
      .from('resolution_daily_items')
      .select('*')
      .eq('plan_id', planId)
      .order('date', { ascending: true })
      .order('order_index', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async unlockPhaseItems(phaseId) {
    const { data, error } = await supabase
      .from('resolution_daily_items')
      .update({ locked: false, updated_at: new Date().toISOString() })
      .eq('phase_id', phaseId)
      .select();
    if (error) throw error;
    return data || [];
  }
}

module.exports = ResolutionDailyItem;
