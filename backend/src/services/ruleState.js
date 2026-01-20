const crypto = require('crypto');
const supabase = require('../config/supabase');
const Task = require('../models/Task');

const ACK_COMPLETE_STATES = new Set(['ack_received', 'cleared']);

class RuleStateService {
  async getActiveP1Tasks(userId) {
    return Task.getActiveP1Tasks(userId);
  }

  async fetchState(userId) {
    const { data, error } = await supabase
      .from('user_rule_states')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  hashState(taskIds, pendingAckCount) {
    const serialized = JSON.stringify({ taskIds: taskIds.sort(), pendingAckCount });
    return crypto.createHash('md5').update(serialized).digest('hex');
  }

  async refreshUserState(userId) {
    const [existingState, activeTasks] = await Promise.all([
      this.fetchState(userId),
      this.getActiveP1Tasks(userId)
    ]);

    const activeIds = activeTasks.map((task) => task.id);
    const pendingAckCount = activeTasks.filter(
      (task) => !ACK_COMPLETE_STATES.has(task.p1_enforcement_state)
    ).length;

    const payload = {
      user_id: userId,
      active_p1_task_ids: activeIds,
      pending_ack_count: pendingAckCount,
      blocked_action_count: existingState?.blocked_action_count || 0,
      last_global_surface_at: existingState?.last_global_surface_at || null,
      last_state_hash: this.hashState([...activeIds], pendingAckCount),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('user_rule_states')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getUserState(userId) {
    const state = await this.fetchState(userId);
    if (state) return state;
    return this.refreshUserState(userId);
  }

  shouldBlockNonCompletion(state) {
    return (state?.pending_ack_count || 0) > 0;
  }

  formatTaskList(tasks) {
    if (!tasks.length) return '';
    return tasks.map((task, idx) => `${idx + 1}. ${task.title}`).join('\n');
  }

  buildGuardrailMessage(tasks) {
    if (!tasks.length) {
      return 'You have no P1 tasks right now. Let me know when you add one.';
    }

    const taskLines = this.formatTaskList(tasks);
    return [
      '⚠️ P1 guardrail is active.',
      'Wrap these before starting anything new:',
      taskLines,
      '\nReply "done [task]" once you clear one so I can unlock other requests.'
    ].join('\n');
  }

  buildBanner(tasks) {
    if (!tasks.length) return '';
    const names = tasks.map((task) => `"${task.title}"`).slice(0, 3).join(', ');
    const remainder = tasks.length > 3 ? ` + ${tasks.length - 3} more` : '';
    return `⚠️ P1 focus: ${names}${remainder}. Reply when one is cleared.`;
  }

  async recordEvent(event) {
    const payload = Array.isArray(event) ? event : [event];
    const enriched = payload.map((item) => ({
      ...item,
      metadata: item.metadata || {}
    }));

    const { error } = await supabase
      .from('rule_enforcement_events')
      .insert(enriched);

    if (error) throw error;
  }

  async recordSurface({ userId, tasks, surfaceType, channel = 'whatsapp', metadata = {} }) {
    if (!tasks?.length) {
      return null;
    }

    const now = new Date().toISOString();
    const events = tasks.map((task) => ({
      user_id: userId,
      task_id: task.id,
      severity: task.severity || 'p1',
      surface_type: surfaceType,
      action: 'surfaced',
      channel,
      outcome: 'delivered',
      metadata: {
        ...metadata,
        p1_enforcement_state: task.p1_enforcement_state || 'unacknowledged'
      }
    }));

    await this.recordEvent(events);

    await Promise.all(tasks.map((task) => {
      const nextState = task.p1_enforcement_state === 'unacknowledged'
        ? 'ack_requested'
        : task.p1_enforcement_state;

      return Task.updateP1State(task.id, {
        p1_last_surface_at: now,
        p1_enforcement_state: nextState
      });
    }));

    const refreshed = await this.refreshUserState(userId);

    await supabase
      .from('user_rule_states')
      .update({ last_global_surface_at: now })
      .eq('user_id', userId);

    return refreshed;
  }

  async recordBlockedAction({ userId, action, channel = 'whatsapp', metadata = {} }) {
    const state = await this.getUserState(userId);
    const now = new Date().toISOString();

    await this.recordEvent({
      user_id: userId,
      task_id: metadata.task_id || null,
      severity: 'p1',
      surface_type: 'inbound_guard',
      action: 'blocked_action',
      channel,
      outcome: action,
      metadata
    });

    await supabase
      .from('user_rule_states')
      .update({
        blocked_action_count: (state?.blocked_action_count || 0) + 1,
        updated_at: now
      })
      .eq('user_id', userId);
  }

  async recordAcknowledgement({ userId, task, ackVia = 'whatsapp' }) {
    if (!task) return null;

    const isComplete = task.status === 'done';
    const nextState = isComplete ? 'cleared' : 'ack_received';
    const updatedTask = await Task.updateP1State(task.id, {
      p1_enforcement_state: nextState,
      p1_ack_via: ackVia,
      p1_protected_until: null
    });

    await this.recordEvent({
      user_id: userId,
      task_id: task.id,
      severity: 'p1',
      surface_type: 'inbound_guard',
      action: 'received_ack',
      channel: ackVia,
      outcome: isComplete ? 'task_completed' : 'acknowledged',
      metadata: {
        previous_state: task.p1_enforcement_state
      }
    });

    await this.refreshUserState(userId);
    return updatedTask;
  }
}

module.exports = new RuleStateService();
