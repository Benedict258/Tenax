const opikBridge = require('../utils/opikBridge');
const variantConfig = require('../config/experiment');
const datasetExporter = require('../services/datasetExporter');
const llmEvaluator = require('../services/llmEvaluator');
const opikMirror = require('../services/opikMirror');
const experimentService = require('../services/experimentService');

const TRACE_FUNCTION_MAP = {
  daily_plan: 'log_daily_plan_trace',
  reminder: 'log_reminder_trace',
  eod_summary: 'log_eod_summary_trace',
  conversation: 'log_conversation_trace'
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
    const assigned = experimentService.assignVariant(userId);
    metadata.experiment_id = experimentId || assigned.experimentId || this.defaultExperimentId;
    metadata.experiment_variant = assigned.variant;

    const inputContext = {
      user_goal: userGoal || 'unspecified_goal',
      user_schedule: userSchedule || [],
      task_metadata: taskMetadata || {}
    };

    const output = {
      generated_text: generatedText
    };

    const tracePayload = {
      input_context: inputContext,
      output,
      metadata
    };

    datasetExporter.recordTrace(messageType, {
      user_id: userId,
      experiment_id: tracePayload.metadata.experiment_id,
      experiment_variant: tracePayload.metadata.experiment_variant,
      input_context: tracePayload.input_context,
      output: tracePayload.output
    });

    let scores = null;
    try {
      scores = await llmEvaluator.evaluate({
        messageType,
        userGoal,
        userSchedule,
        taskMetadata,
        generatedText
      });
    } catch (error) {
      console.warn('[Opik] Evaluator scoring failed:', error.message);
    }

    try {
      await opikMirror.logTrace({
        userId,
        messageType,
        inputContext,
        output,
        metadata,
        scores
      });
    } catch (error) {
      console.warn('[Opik] Mirror log failed:', error.message);
    }

    return opikBridge.log(functionName, tracePayload);
  }
}

module.exports = new OpikAgentTracer();
