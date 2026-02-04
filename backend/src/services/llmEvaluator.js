const llmService = require('./llm');

const SCORE_KEYS = [
  'tone_score',
  'specificity_score',
  'realism_score',
  'goal_alignment_score',
  'resolution_alignment_score'
];

class LlmEvaluatorService {
  async evaluate({ messageType, userGoal, userSchedule, taskMetadata, generatedText }) {
    const prompt = [
      'You are Tenax\'s quality judge.',
      'Rate the provided agent output on five dimensions from 1 (poor) to 5 (excellent).',
      'Return strict JSON with keys tone_score, specificity_score, realism_score, goal_alignment_score, resolution_alignment_score.',
      'Do not include explanations.',
      '',
      `message_type: ${messageType}`,
      `user_goal: ${userGoal || 'Not provided'}`,
      `user_schedule: ${JSON.stringify(userSchedule || [])}`,
      `task_metadata: ${JSON.stringify(taskMetadata || {})}`,
      `generated_text: ${generatedText}`,
      '',
      'JSON response:'
    ].join('\n');

    const response = await llmService.generate(prompt, {
      temperature: 0,
      maxTokens: 200,
      opikMeta: {
        action: 'regression_llm_judge',
        message_type: messageType
      }
    });

    const parsed = this.parseScores(response.text);

    return parsed;
  }

  parseScores(rawText) {
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Unable to parse evaluator response: ${cleaned}`);
    }

    const scores = {};
    SCORE_KEYS.forEach((key) => {
      const value = Number(data[key]);
      scores[key] = Number.isFinite(value) ? Math.max(1, Math.min(5, Number(value.toFixed(3)))) : 0;
    });

    return scores;
  }
}

module.exports = new LlmEvaluatorService();
