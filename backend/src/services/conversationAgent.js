const llmService = require('./llm');
const toneController = require('./toneController');
const conversationContext = require('./conversationContext');
const { composeMessage } = require('./messageComposer');
const { DateTime } = require('luxon');

const MAX_MEMORY_TURNS = 6;

const extractOpeners = (turns = []) =>
  turns
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.text?.split(/\s+/).slice(0, 3).join(' '))
    .filter(Boolean)
    .slice(-5);

const safeList = (items) => (Array.isArray(items) ? items : []);

const formatTimeForUser = (iso, timezone = 'UTC') => {
  if (!iso) return 'anytime';
  const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(timezone || 'UTC');
  if (!dt.isValid) return 'anytime';
  return dt.toFormat('hh:mm a');
};

const formatTasks = (tasks = [], timezone = 'UTC') =>
  tasks.slice(0, 5).map((task) => {
    const time = task.start_time ? formatTimeForUser(task.start_time, timezone) : 'anytime';
    return `- ${task.title} (${time})`;
  }).join('\n');

const buildPrompt = ({ user, message, intent, toolResult, memoryTurns, context }) => {
  const toneContext = toneController.buildToneContext(user, context?.stats, context?.reminderStats);
  const reasons = Array.isArray(user?.reason_for_using) ? user.reason_for_using.join(', ') : user?.reason_for_using || '';
  const openers = extractOpeners(memoryTurns);
  const timezone = user?.timezone || 'UTC';
  const tasksList = context?.tasks ? formatTasks(context.tasks, timezone) : '';
  const currentTime = context?.currentTime || '';

  return [
    'You are Tenax, a friendly execution companion AI. You chat like a real person: natural, curious, and lightly coachy.',
    'Tone policy:',
    '- Be warm, direct, and helpful. Avoid robotic templates.',
    '- Use short sentences. Optional light emoji (0-2).',
    '- If the user is slipping, be gently firm and Duolingo-like (no shaming).',
    `- Current tone mode: ${toneContext.tone}.`,
    'Variation policy:',
    `- Do NOT start with any of these openings: ${openers.join(' | ') || 'none'}.`,
    '- Avoid repeating the same phrasing from recent replies.',
    '- Do not push the user into task planning repeatedly. Offer once, then keep the conversation flowing.',
    '- Do not guess or mention the current time unless the user asks or provides a time.',
    '- Do not repeat the same observation (e.g., time of day) across turns.',
    '',
    'User context:',
    `- Name: ${user?.preferred_name || user?.name || 'there'}`,
    `- Role: ${user?.role || 'unspecified'}`,
    `- Goal: ${user?.goal || user?.primary_goal || 'unspecified'}`,
    `- Focus/Reason: ${reasons || 'unspecified'}`,
    `- Tone preference: ${user?.tone_preference || 'balanced'}`,
    '',
    'Conversation memory (recent turns):',
    ...safeList(memoryTurns).slice(-MAX_MEMORY_TURNS).map((turn) => `${turn.role}: ${turn.text}`),
    '',
    'System state:',
    `- Intent: ${intent || 'chat'}`,
    toolResult ? `- Tool result: ${JSON.stringify(toolResult)}` : '- Tool result: none',
    currentTime ? `- Current time (user timezone): ${currentTime}` : '- Current time: unavailable',
    '',
    context?.tasks ? `Today/Upcoming tasks:\n${tasksList || 'No tasks'}` : 'Tasks: unavailable',
    '',
    'Rules for your reply:',
    '- Always respond as a natural chat message.',
    '- If the user is known (has a name), avoid "Nice to meet you" or first-time greetings.',
    '- If the user asks for the current time, answer with the provided current time and timezone.',
    '- If toolResult.requires_selection is true, include the options list and end with: "Reply with the number or the task name."',
    '- If toolResult.requires_time is true, ask for the time or "no fixed time".',
    '- If toolResult.requires_title is true, ask what task they want to add with a quick example.',
    '- If intent is status, summarize tasks in 2-4 lines, not a template.',
    '- If no tasks exist, do not pressure them. Offer help or ask if they want to plan, but only once.',
    '- If the user says they are busy or unmotivated, respond with empathy and one small suggestion. Ask permission before coaching more.',
    '- If the user asks about your goal, answer briefly and keep the focus on them without forcing a task question.',
    '- Ask a question only when it helps the conversation. It is okay to end without a question.',
    '- Keep responses conversational: include a short reflective line when appropriate.',
    '',
    `User message: ${message}`
  ].join('\n');
};

const fallbackReply = ({ intent, toolResult, user }) => {
  if (toolResult?.action === 'add_task' && toolResult?.status === 'created') {
    const timing = toolResult.timingText || '';
    const recurrence = toolResult.recurrenceText || '';
    return `Added "${toolResult.task?.title || 'task'}"${timing}${recurrence}. Tell me when it's done.`;
  }
  if (toolResult?.action === 'mark_complete' && toolResult?.status === 'completed') {
    return `Nice - "${toolResult.task?.title || 'that'}" is marked complete.`;
  }
  if (toolResult?.action === 'status' && Array.isArray(toolResult.todoTasks)) {
    if (!toolResult.todoTasks.length) {
      return `You're clear for now. Want to add something for today?`;
    }
    const timezone = user?.timezone || 'UTC';
    const list = toolResult.todoTasks.slice(0, 4).map((task) => {
      const time = task.start_time ? formatTimeForUser(task.start_time, timezone) : 'anytime';
      return `- ${task.title} (${time})`;
    }).join('\n');
    return `Here's your lineup:\n${list}`;
  }
  if (toolResult?.requires_selection && toolResult?.optionsList) {
    return `${toolResult.prompt}\n\n${toolResult.optionsList}\n\nReply with the number or the task name.`;
  }
  if (toolResult?.requires_time) {
    return 'When should I set it? You can reply with a time or say "no fixed time".';
  }
  if (toolResult?.requires_title) {
    return 'What should I add? Example: "add workout 6am" or "remind me to read 9pm".';
  }
  if (intent === 'greeting') {
    const tone = toneController.buildToneContext(user).tone;
    return composeMessage('greeting', tone, { name: user?.preferred_name || user?.name || 'there' }) ||
      `Hey ${user?.preferred_name || user?.name || 'there'}! Good to see you.`;
  }
  return "Got it. I'm here if you want to talk, plan, or update a task.";
};

async function generateAssistantReply({ user, message, intent, toolResult, memoryTurns = [], context = {} }) {
  const prompt = buildPrompt({ user, message, intent, toolResult, memoryTurns, context });
  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 160,
      temperature: 0.7,
      preferredModel: 'groq',
      opikMeta: {
        action: 'conversation_agent_reply',
        user_id: user?.id,
        intent: intent || 'chat'
      }
    });
    const text = response?.text?.trim();
    if (!text) {
      return fallbackReply({ intent, toolResult, user });
    }
    return text;
  } catch (error) {
    console.warn('[ConversationAgent] LLM failed, using fallback:', error.message);
    return fallbackReply({ intent, toolResult, user });
  }
}

module.exports = {
  generateAssistantReply
};

