const supabase = require('../config/supabase');

const TABLE = 'opik_trace_mirror';

const scoreKeys = ['tone_score', 'specificity_score', 'realism_score', 'goal_alignment_score'];

const buildScorePayload = (scores = {}) => {
  const payload = {};
  scoreKeys.forEach((key) => {
    const value = Number(scores[key]);
    payload[key] = Number.isFinite(value) ? value : null;
  });
  return payload;
};

async function logTrace({
  userId,
  messageType,
  inputContext,
  output,
  metadata,
  scores,
  traceId,
  traceUrl
}) {
  if (!userId || !messageType) return null;
  const now = new Date().toISOString();
  const outputText = output?.generated_text || output?.text || '';
  const payload = {
    user_id: userId,
    message_type: messageType,
    input_context: inputContext || {},
    output: output || {},
    output_snippet: outputText ? String(outputText).slice(0, 320) : null,
    agent_version: metadata?.agent_version || null,
    prompt_version: metadata?.prompt_version || null,
    experiment_id: metadata?.experiment_id || null,
    trace_id: traceId || null,
    trace_url: traceUrl || null,
    metadata: metadata || {},
    logged_at: now,
    ...buildScorePayload(scores)
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { logTrace };
