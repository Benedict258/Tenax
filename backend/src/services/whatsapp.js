const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    const disableSend = process.env.TWILIO_DISABLE_SEND === 'true';

    if (!disableSend && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
      const configuredFrom = process.env.TWILIO_WHATSAPP_NUMBER;

      if (!configuredFrom) {
        console.log('[WhatsApp] Missing TWILIO_WHATSAPP_NUMBER - running in test mode');
        this.enabled = false;
        return;
      }

      const normalizedFrom = configuredFrom.startsWith('whatsapp:')
        ? configuredFrom
        : `whatsapp:${configuredFrom}`;

      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      this.fromNumber = normalizedFrom;
      this.enabled = true;
    } else {
      const reason = disableSend
        ? 'Twilio sends disabled via TWILIO_DISABLE_SEND=true'
        : 'Twilio not configured';
      console.log(`[WhatsApp] ${reason} - running in test mode`);
      this.enabled = false;
    }
  }

  async sendMessage(to, message) {
    const fallbackTo = process.env.TEST_WHATSAPP_NUMBER;
    const resolvedTo = to || fallbackTo;
    if (!this.enabled) {
      console.log(`[WhatsApp Test Mode] Would send to ${resolvedTo}: ${message}`);
      return { sid: 'test-message-id', status: 'test' };
    }

    try {
      if (!resolvedTo) {
        throw new Error('Missing WhatsApp destination number');
      }
      const toNumber = resolvedTo.startsWith('whatsapp:') ? resolvedTo : `whatsapp:${resolvedTo}`;

      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: message
      });

      console.log(
        `[WhatsApp] Sent to ${resolvedTo} (sid: ${result.sid}, status: ${result.status || 'queued'}): ${message.substring(0, 80)}...`
      );
      return result;
    } catch (error) {
      console.error('[WhatsApp] Send error:', error?.message || error);
      throw error;
    }
  }

  async sendMorningSummary(user, tasks) {
    if (!this.enabled) {
      const taskList = tasks.map((t) => `- ${t.title}`).join('\n');
      console.log(`[WhatsApp Test Mode] Morning summary for ${user.name}:\n${taskList}`);
      return { sid: 'test-morning-summary', status: 'test' };
    }

    const taskList = tasks.length > 0
      ? tasks.map((t) => `- ${t.title}`).join('\n')
      : 'No tasks scheduled';

    const message = `Good morning ${user.name}.\n\nHere's your plan for today:\n\n${taskList}\n\nLet me know when you finish anything.`;
    return this.sendMessage(user.phone_number, message);
  }

  async sendTaskReminder(user, task) {
    if (!this.enabled) {
      console.log(`[WhatsApp Test Mode] Reminder for ${user.name}: ${task.title}`);
      return { sid: 'test-reminder', status: 'test' };
    }

    const message = `Reminder: "${task.title}" starts in 30 minutes.\n\nTell me when it is done.`;
    return this.sendMessage(user.phone_number, message);
  }

  async sendEndOfDaySummary(user, completedTasks, totalTasks) {
    if (!this.enabled) {
      console.log(`[WhatsApp Test Mode] EOD summary for ${user.name}: ${completedTasks}/${totalTasks}`);
      return { sid: 'test-eod-summary', status: 'test' };
    }

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const message = `Day complete.\n\nYou finished ${completedTasks}/${totalTasks} tasks (${completionRate}%).\n\nKeep it up.`;
    return this.sendMessage(user.phone_number, message);
  }
}

module.exports = new WhatsAppService();
