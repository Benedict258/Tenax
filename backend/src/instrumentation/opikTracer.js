const opikBridge = require('../utils/opikBridge');
const variantConfig = require('../config/experiment');

const TRACE_FUNCTION_MAP = {
  daily_plan: 'log_daily_plan_trace',
  reminder: 'log_reminder_trace',
  eod_summary: 'log_eod_summary_trace'
};

class OpikAgentTracer {
  constructor() {
    this.agentVersion = variantConfig.agentVersion || 'v1.0';
    this.defaultExperimentId = variantConfig.experimentId || 'control';
  }

  async traceAgentOutput({
    messageType,
    userId,
    userGoal,
    userSchedule,
    taskMetadata,
    generatedText,
    promptVersion,
    experimentId
  }) {
    const functionName = TRACE_FUNCTION_MAP[messageType];

    if (!functionName) {
      throw new Error(`Unsupported message type: ${messageType}`);
    }

    const metadata = {
      agent_version: this.agentVersion,
      prompt_version: promptVersion || 'default',
      experiment_id: experimentId || this.defaultExperimentId,
      user_id: userId,
      message_type: messageType
    };

    const inputContext = {
      user_goal: userGoal || 'unspecified_goal',
      user_schedule: userSchedule || [],
      task_metadata: taskMetadata || {}
    };

    const output = {
      generated_text: generatedText
    };

    return opikBridge.log(functionName, {
      input_context: inputContext,
      output,
      metadata
    });
  }
}

module.exports = new OpikAgentTracer();
