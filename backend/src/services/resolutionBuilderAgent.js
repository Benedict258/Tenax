const Task = require('../models/Task');
const ruleStateService = require('./ruleState');
const { DateTime } = require('luxon');
const llmService = require('./llm');
const ResolutionBuilderSession = require('../models/ResolutionBuilderSession');
const ResolutionBuilderMessage = require('../models/ResolutionBuilderMessage');
const ResolutionPlan = require('../models/ResolutionPlan');
const ResolutionPhase = require('../models/ResolutionPhase');
const ResolutionTask = require('../models/ResolutionTask');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_PATTERNS = [
  { label: 'Monday', dayOfWeek: 1, pattern: /\b(mon|monday)\b/ },
  { label: 'Tuesday', dayOfWeek: 2, pattern: /\b(tue|tues|tuesday)\b/ },
  { label: 'Wednesday', dayOfWeek: 3, pattern: /\b(wed|weds|wednesday)\b/ },
  { label: 'Thursday', dayOfWeek: 4, pattern: /\b(thu|thur|thurs|thursday)\b/ },
  { label: 'Friday', dayOfWeek: 5, pattern: /\b(fri|friday)\b/ },
  { label: 'Saturday', dayOfWeek: 6, pattern: /\b(sat|saturday)\b/ },
  { label: 'Sunday', dayOfWeek: 0, pattern: /\b(sun|sunday)\b/ }
];

const DEFAULT_BLOCKS = [{ label: 'Evening', time: { hour: 19, minute: 0 } }];
const DAY_PART_BLOCKS = [
  { key: 'morning', label: 'Morning', time: { hour: 7, minute: 30 } },
  { key: 'afternoon', label: 'Afternoon', time: { hour: 13, minute: 0 } },
  { key: 'evening', label: 'Evening', time: { hour: 19, minute: 0 } },
  { key: 'night', label: 'Night', time: { hour: 21, minute: 0 } }
];

const YES_TRIGGERS = ['yes', 'yep', 'sure', 'ok', 'okay', 'approve', 'approved', 'go ahead', 'do it'];
const NO_TRIGGERS = ['no', 'nope', 'cancel', 'stop', 'not now'];
const EDIT_TRIGGERS = ['edit', 'change', 'adjust', 'partial'];
const PACE_OPTIONS = ['light', 'standard', 'intense'];

const normalize = (value = '') => value.toLowerCase().trim();

const formatTimeLabel = (hour, minute = 0) => {
  const safeHour = Math.min(Math.max(hour, 0), 23);
  const safeMinute = Math.min(Math.max(minute, 0), 59);
  const displayHour = safeHour % 12 || 12;
  const suffix = safeHour >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${String(safeMinute).padStart(2, '0')} ${suffix}`;
};

function parseDuration(input, timezone = 'UTC') {
  const normalized = normalize(input);
  const weekMatch = normalized.match(/(\d+)\s*(week|weeks|wk|wks)/);
  if (weekMatch) {
    const weeks = Number(weekMatch[1]);
    return Number.isFinite(weeks) && weeks > 0 ? { weeks, endDate: null } : null;
  }
  const monthMatch = normalized.match(/(\d+)\s*(month|months|mo)/);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    if (Number.isFinite(months) && months > 0) {
      return { weeks: months * 4, endDate: null };
    }
  }

  const isoMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const end = DateTime.fromISO(isoMatch[1], { zone: timezone });
    if (end.isValid) {
      const weeks = Math.max(1, Math.round(end.diff(DateTime.now().setZone(timezone), 'weeks').weeks));
      return { weeks, endDate: end.toISODate() };
    }
  }

  const monthDayMatch = normalized.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/);
  if (monthDayMatch) {
    const month = monthDayMatch[1];
    const day = monthDayMatch[2];
    const year = DateTime.now().setZone(timezone).year;
    const end = DateTime.fromFormat(`${month} ${day} ${year}`, 'LLLL d yyyy', { zone: timezone });
    if (end.isValid) {
      const weeks = Math.max(1, Math.round(end.diff(DateTime.now().setZone(timezone), 'weeks').weeks));
      return { weeks, endDate: end.toISODate() };
    }
  }

  return null;
}

function parseHoursPerWeek(text) {
  const normalized = normalize(text);
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(hours|hrs|hr)\b/);
  if (match) {
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const numberMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const value = Number(numberMatch[1]);
    if (Number.isFinite(value) && value > 0 && value <= 80) {
      return value;
    }
  }
  if (normalized.includes('couple')) return 2;
  if (normalized.includes('few')) return 3;
  return null;
}

function parseDays(text) {
  const normalized = normalize(text);
  if (normalized.includes('weekday')) {
    return DAY_PATTERNS.filter((day) => day.dayOfWeek >= 1 && day.dayOfWeek <= 5);
  }
  if (normalized.includes('weekend')) {
    return DAY_PATTERNS.filter((day) => day.dayOfWeek === 6 || day.dayOfWeek === 0);
  }
  const matches = DAY_PATTERNS.filter((day) => day.pattern.test(normalized));
  const unique = [];
  matches.forEach((day) => {
    if (!unique.some((entry) => entry.dayOfWeek === day.dayOfWeek)) {
      unique.push(day);
    }
  });
  return unique;
}

function parseBlocks(text) {
  const normalized = normalize(text);
  const blocks = [];

  const rangeMatch = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*(am|pm)\b/);
  if (rangeMatch) {
    const startHour = Number(rangeMatch[1]);
    const meridiem = rangeMatch[3];
    if (!Number.isNaN(startHour)) {
      let hour = startHour;
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      blocks.push({ label: formatTimeLabel(hour, 0), time: { hour, minute: 0 } });
    }
  }

  const timeMatches = [...normalized.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g)];
  timeMatches.forEach((match) => {
    const hourRaw = Number(match[1]);
    const minuteRaw = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3];
    if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return;
    let hour = hourRaw;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    blocks.push({ label: formatTimeLabel(hour, minuteRaw), time: { hour, minute: minuteRaw } });
  });

  const twentyFourMatches = [...normalized.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)];
  twentyFourMatches.forEach((match) => {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;
    blocks.push({ label: formatTimeLabel(hour, minute), time: { hour, minute } });
  });

  DAY_PART_BLOCKS.forEach((block) => {
    if (normalized.includes(block.key)) {
      blocks.push({ label: block.label, time: block.time });
    }
  });

  const unique = [];
  blocks.forEach((block) => {
    if (!unique.some((entry) => entry.label === block.label)) {
      unique.push(block);
    }
  });

  return unique;
}

function resolveSessionsPerWeek(hoursPerWeek, daysAvailable, pace = 'standard') {
  if (!daysAvailable) return 1;
  const base = hoursPerWeek ? Math.max(1, Math.round(hoursPerWeek / 2)) : daysAvailable;
  const paceFactor = pace === 'light' ? 0.8 : pace === 'intense' ? 1.2 : 1;
  const sessions = Math.round(base * paceFactor);
  return Math.max(1, Math.min(daysAvailable, sessions));
}

function buildRoadmap(goal, outcome, durationWeeks) {
  const title = outcome ? `${goal} -> ${outcome}` : `${goal} Roadmap`;
  const phases = [
    {
      phase_index: 0,
      title: 'Foundations',
      description: 'Core concepts and quick wins.',
      objectives: ['Learn the core concepts', 'Build momentum with small exercises'],
      topics: [{ title: 'Basics', subtopics: ['Key terms', 'Core workflows'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    },
    {
      phase_index: 1,
      title: 'Applied Practice',
      description: 'Structured practice and repetition.',
      objectives: ['Practice consistently', 'Apply concepts to real tasks'],
      topics: [{ title: 'Applied drills', subtopics: ['Repetition', 'Feedback'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    }
  ];
  return { goal, duration_weeks: durationWeeks, title, phases };
}

function extractJsonBlock(text = '') {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

function sanitizeRoadmap(raw, fallbackGoal, fallbackOutcome, durationWeeks) {
  if (!raw || typeof raw !== 'object') {
    return buildRoadmap(fallbackGoal, fallbackOutcome, durationWeeks || 6);
  }

  const phasesRaw = Array.isArray(raw.phases) ? raw.phases : [];
  const phases = phasesRaw
    .map((phase, index) => {
      const resources = Array.isArray(phase?.resources)
        ? phase.resources.filter((resource) => resource?.title && resource?.url)
        : [];

      return {
        phase_index: Number.isFinite(Number(phase?.phase_index)) ? Number(phase.phase_index) : index,
        title: typeof phase?.title === 'string' ? phase.title.trim() : '',
        description: typeof phase?.description === 'string' ? phase.description.trim() : '',
        objectives: Array.isArray(phase?.objectives) ? phase.objectives.filter(Boolean) : [],
        topics: Array.isArray(phase?.topics) ? phase.topics : [],
        resources,
        duration_weeks: Number.isFinite(Number(phase?.duration_weeks)) ? Number(phase.duration_weeks) : null,
        completion_criteria: phase?.completion_criteria || { type: 'threshold', threshold: 0.8 }
      };
    })
    .filter((phase) => phase.title && phase.description);

  if (!phases.length) {
    return buildRoadmap(fallbackGoal, fallbackOutcome, durationWeeks || 6);
  }

  const totalWeeks = durationWeeks || raw.duration_weeks || phases.length;
  const missingDuration = phases.some((phase) => !phase.duration_weeks);
  if (missingDuration) {
    const baseWeeks = Math.max(1, Math.floor(totalWeeks / phases.length));
    let remainder = Math.max(0, totalWeeks - baseWeeks * phases.length);
    phases.forEach((phase) => {
      const extra = remainder > 0 ? 1 : 0;
      phase.duration_weeks = baseWeeks + extra;
      remainder -= extra;
    });
  }

  return {
    goal: raw.goal || fallbackGoal,
    duration_weeks: raw.duration_weeks || durationWeeks,
    title: raw.title || `${fallbackGoal} Roadmap`,
    phases
  };
}

async function buildRoadmapWithResearch(goal, outcome, durationWeeks, user) {
  const prompt = `You are Tenax Resolution Builder. Create a structured learning roadmap with real resources.
Goal: ${goal}
Outcome definition: ${outcome || 'Not specified'}
Duration: ${durationWeeks} weeks

Return JSON only with this shape:
{
  "goal": "...",
  "duration_weeks": ${durationWeeks},
  "title": "...",
  "phases": [
    {
      "phase_index": 0,
      "title": "...",
      "description": "...",
      "objectives": ["..."],
      "topics": [{"title":"...","subtopics":["..."],"type":"core"}],
      "resources": [{"title":"...","url":"https://...","kind":"docs|video|course","difficulty":"beginner|intermediate|advanced"}],
      "completion_criteria": {"type":"threshold","threshold":0.8}
    }
  ]
}

Rules:
- 4 to 7 phases.
- Provide real, valid URLs.
- Ensure objectives and topics are practical.
`;

  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 900,
      temperature: 0.25,
      opikMeta: {
        action: 'resolution_roadmap',
        user_id: user?.id,
        resolution_goal: goal
      }
    });
    const parsed = extractJsonBlock(response.text);
    return sanitizeRoadmap(parsed, goal, outcome, durationWeeks);
  } catch (error) {
    console.warn('[ResolutionBuilder] LLM roadmap generation failed:', error.message);
    return buildRoadmap(goal, outcome, durationWeeks);
  }
}

function buildSchedulePreview(state) {
  const roadmap = state.roadmap?.phases || [];
  const days = state.days_free || [];
  const blocks = state.preferred_blocks && state.preferred_blocks.length ? state.preferred_blocks : DEFAULT_BLOCKS;
  if (!roadmap.length || !days.length) return [];

  const sessionsPerWeek = resolveSessionsPerWeek(state.time_commitment_hours, days.length, state.pace);
  const selectedDays = days.slice(0, sessionsPerWeek);
  const focusTemplates = ['Learn new concept', 'Guided practice', 'Applied build', 'Review + recap'];
  const preview = [];
  const maxEntries = Math.max(6, Math.min(12, selectedDays.length * 3));
  let focusIndex = 0;

  roadmap.forEach((phase, phaseIndex) => {
    const phaseWeeks = phase.duration_weeks || 1;
    for (let week = 0; week < phaseWeeks; week += 1) {
      selectedDays.forEach((day, dayIndex) => {
        if (preview.length >= maxEntries) return;
        const block = blocks[(dayIndex + week) % blocks.length];
        const focus = focusTemplates[focusIndex % focusTemplates.length];
        preview.push({
          day_of_week: day.dayOfWeek,
          day_label: day.label,
          time: block.time,
          time_label: block.label,
          phase_index: phaseIndex,
          phase_name: phase.title,
          focus
        });
        focusIndex += 1;
      });
      if (preview.length >= maxEntries) return;
    }
  });

  return preview;
}

function buildScheduleMessage(schedule) {
  if (!schedule?.length) return 'Schedule preview not ready yet.';
  return schedule.map((slot) => (
    `${slot.day_label}: ${slot.phase_name} - ${slot.focus} (${slot.time_label})`
  )).join('\n');
}

function buildResourcesMessage(resources) {
  if (!resources?.length) return 'No resources added.';
  const lines = resources.map((resource, index) => (
    `${index + 1}. ${resource.title} (${resource.kind || resource.type})`
  ));
  return lines.join('\n');
}

function buildRoadmapMessage(roadmap) {
  if (!roadmap?.phases?.length) return 'No roadmap generated yet.';
  return roadmap.phases.map((phase, index) => (
    `Phase ${index + 1}: ${phase.title} - ${phase.description}`
  )).join('\n');
}

function getDateForWeekDay(baseDate, dayOfWeek, weekOffset = 0) {
  const start = baseDate.plus({ weeks: weekOffset }).startOf('week');
  const targetWeekday = dayOfWeek === 0 ? 7 : dayOfWeek;
  return start.set({ weekday: targetWeekday });
}

function generateResolutionTasks({
  user,
  planId,
  phases,
  durationWeeks,
  daysFree,
  preferredBlocks,
  hoursPerWeek,
  pace
}) {
  const tasks = [];
  if (!phases.length || !daysFree.length || !durationWeeks) return tasks;

  const blocks = preferredBlocks.length ? preferredBlocks : DEFAULT_BLOCKS;
  const sessionsPerWeek = resolveSessionsPerWeek(hoursPerWeek, daysFree.length, pace);
  const totalSessions = durationWeeks * sessionsPerWeek;
  const totalPhaseWeeks = phases.reduce((sum, phase) => sum + (phase.duration_weeks || 1), 0) || phases.length;
  let remainingSessions = totalSessions;

  const phaseSessions = phases.map((phase, index) => {
    const share = phase.duration_weeks || 1;
    const estimated = Math.max(1, Math.round((share / totalPhaseWeeks) * totalSessions));
    const sessions = index === phases.length - 1 ? remainingSessions : Math.min(remainingSessions, estimated);
    remainingSessions -= sessions;
    return sessions;
  });

  const baseDate = DateTime.now().setZone(user.timezone || 'UTC');
  let slotIndex = 0;

  const slotList = [];
  for (let week = 0; week < durationWeeks; week += 1) {
    const selectedDays = daysFree.slice(0, sessionsPerWeek);
    selectedDays.forEach((day, dayIndex) => {
      const block = blocks[(dayIndex + week) % blocks.length];
      const date = getDateForWeekDay(baseDate, day.dayOfWeek, week);
      slotList.push({
        date,
        day,
        block
      });
    });
  }

  phases.forEach((phase, phaseIndex) => {
    const sessions = phaseSessions[phaseIndex] || 1;
    const topics = Array.isArray(phase.topics) ? phase.topics : [];
    const objectives = Array.isArray(phase.objectives) ? phase.objectives : [];
    for (let i = 0; i < sessions; i += 1) {
      const slot = slotList[slotIndex];
      if (!slot) break;
      const topic = topics[i % (topics.length || 1)] || { title: phase.title };
      const objective = objectives[i % (objectives.length || 1)] || `Advance ${phase.title}`;
      const description = topic.subtopics && topic.subtopics.length
        ? `Focus on ${topic.title}. Cover: ${topic.subtopics.join(', ')}.`
        : `Focus on ${topic.title || phase.title} and apply it with practice.`;
      const resources = Array.isArray(phase.resources) ? phase.resources : [];

      tasks.push({
        user_id: user.id,
        plan_id: planId,
        phase_id: phase.id,
        date: slot.date.toISODate(),
        start_time: slot.block.time ? `${String(slot.block.time.hour).padStart(2, '0')}:${String(slot.block.time.minute).padStart(2, '0')}:00` : null,
        title: `${phase.title}: ${topic.title || 'Focused session'}`,
        objective,
        description,
        resources_json: resources,
        status: 'todo',
        order_index: i,
        locked: phaseIndex > 0
      });
      slotIndex += 1;
    }
  });

  return tasks;
}

async function mirrorTasksToExecution(tasks, userId) {
  const unlocked = tasks.filter((task) => !task.locked);
  if (!unlocked.length) return;
  const payload = unlocked.map((task) => ({
    user_id: userId,
    title: task.title,
    description: task.description,
    category: 'Resolution',
    start_time: task.start_time ? DateTime.fromISO(`${task.date}T${task.start_time}`).toUTC().toISO() : null,
    severity: 'p1',
    priority: 'P1',
    created_via: 'resolution_builder',
    metadata: {
      resolution_plan_id: task.plan_id,
      resolution_task_id: task.id,
      resources: task.resources_json,
      objective: task.objective
    }
  }));
  await Task.createMany(payload);
  await ruleStateService.refreshUserState(userId);
}

class ResolutionBuilderFlow {
  constructor(user, sessionRecord) {
    this.user = user;
    this.sessionRecord = sessionRecord;
    this.state = sessionRecord?.state_json || {
      step: 1,
      resolution_goal: '',
      target_outcome: '',
      duration_weeks: null,
      end_date: null,
      time_commitment_hours: null,
      days_free: [],
      preferred_blocks: [],
      pace: 'standard',
      roadmap: null,
      resources: [],
      schedule_preview: [],
      permission: null,
      active: true,
      completed: false,
      time_step: 'hours',
      edit_mode: false
    };
  }

  publicState() {
    return { ...this.state };
  }

  async saveState() {
    await ResolutionBuilderSession.updateState(this.sessionRecord.id, this.state);
  }

  async logMessage(role, contentText, stepKey, contentJson) {
    await ResolutionBuilderMessage.create({
      session_id: this.sessionRecord.id,
      step_key: stepKey,
      role,
      content_text: contentText,
      content_json: contentJson
    });
  }

  async start() {
    return {
      reply: 'Welcome to Tenax Resolution Builder. What is your New Year resolution or big goal?',
      state: this.publicState()
    };
  }

  async captureResolution(input) {
    if (!input) {
      return { reply: 'Share a resolution goal so we can build your roadmap.', state: this.publicState() };
    }
    this.state.resolution_goal = input;
    this.state.step = 2;
    await this.saveState();
    return {
      reply: 'What does success look like for this goal? Examples: fundamentals, projects, job-ready, interview prep.',
      state: this.publicState()
    };
  }

  async captureOutcome(input) {
    if (!input) {
      return { reply: 'Give me a short success definition so the roadmap stays aligned.', state: this.publicState() };
    }
    this.state.target_outcome = input;
    this.state.step = 3;
    await this.saveState();
    return {
      reply: 'How long do you want to complete this resolution? (e.g., 4 weeks, 8 weeks, or 2026-03-01)',
      state: this.publicState()
    };
  }

  async captureDuration(input) {
    const parsed = parseDuration(input, this.user.timezone || 'UTC');
    if (!parsed?.weeks) {
      return { reply: 'Please share a duration in weeks or a target end date (YYYY-MM-DD).', state: this.publicState() };
    }
    this.state.duration_weeks = parsed.weeks;
    this.state.end_date = parsed.endDate || null;
    this.state.step = 4;
    this.state.time_step = 'hours';
    await this.saveState();
    return {
      reply: 'Time reality check: how many hours per week can you realistically commit?',
      state: this.publicState()
    };
  }

  async captureTimeReality(input) {
    if (this.state.time_step === 'hours') {
      const hours = parseHoursPerWeek(input);
      if (!hours) {
        return { reply: 'How many hours per week can you commit? Example: 6 hours.', state: this.publicState() };
      }
      this.state.time_commitment_hours = hours;
      this.state.time_step = 'days';
      await this.saveState();
      return { reply: 'Which days are usually free for this? Example: Mon, Wed, Sat.', state: this.publicState() };
    }

    if (this.state.time_step === 'days') {
      const days = parseDays(input);
      if (!days.length) {
        return { reply: 'List the days that are usually free (e.g. Tue Thu Sat or weekdays).', state: this.publicState() };
      }
      this.state.days_free = days;
      this.state.time_step = 'blocks';
      await this.saveState();
      return { reply: 'Preferred learning time blocks? Example: evenings, 7-9pm, or 6:30am.', state: this.publicState() };
    }

    const blocks = parseBlocks(input);
    if (!blocks.length) {
      return { reply: 'Share a preferred time block (e.g. evenings or 7:30pm).', state: this.publicState() };
    }
    this.state.preferred_blocks = blocks;
    this.state.step = 5;
    await this.saveState();
    return { reply: 'Pick a pace: light, standard, or intense.', state: this.publicState() };
  }

  async capturePace(input) {
    const normalized = normalize(input);
    const pace = PACE_OPTIONS.find((option) => normalized.includes(option));
    if (!pace) {
      return { reply: 'Choose a pace: light, standard, or intense.', state: this.publicState() };
    }
    this.state.pace = pace;
    this.state.step = 6;

    const roadmap = await buildRoadmapWithResearch(
      this.state.resolution_goal,
      this.state.target_outcome,
      this.state.duration_weeks,
      this.user
    );
    this.state.roadmap = roadmap;
    await this.saveState();

    const roadmapText = buildRoadmapMessage(roadmap);
    return {
      reply: `Roadmap draft:\n${roadmapText}\n\nWould you like learning resources added? (yes/no)`,
      state: this.publicState()
    };
  }

  async handleResources(input) {
    const normalized = normalize(input);
    const wantsResources = YES_TRIGGERS.some((trigger) => normalized.includes(trigger));
    const rejectsResources = NO_TRIGGERS.some((trigger) => normalized.includes(trigger));

    if (!wantsResources && !rejectsResources) {
      return { reply: 'Say "yes" to add resources or "no" to skip them.', state: this.publicState() };
    }

    if (wantsResources) {
      this.state.resources = (this.state.roadmap?.phases || []).flatMap((phase) => phase.resources || []);
    } else {
      this.state.resources = [];
    }

    this.state.schedule_preview = buildSchedulePreview({
      ...this.state,
      roadmap: this.state.roadmap,
      resources: this.state.resources
    });
    this.state.step = 7;
    await this.saveState();

    const resourcesText = wantsResources ? `Resources added:\n${buildResourcesMessage(this.state.resources)}\n\n` : '';
    const scheduleText = buildScheduleMessage(this.state.schedule_preview);
    return {
      reply: `${resourcesText}Schedule preview (not yet added):\n${scheduleText}\n\nShould I add this learning roadmap to your daily schedule? Reply approve, edit, or cancel.`,
      state: this.publicState()
    };
  }

  async handlePermission(input) {
    const normalized = normalize(input);

    if (this.state.edit_mode) {
      const days = parseDays(input);
      const blocks = parseBlocks(input);
      if (!days.length && !blocks.length) {
        return { reply: 'Tell me the new days or times you want (e.g. Tue Thu 7pm).', state: this.publicState() };
      }
      if (days.length) this.state.days_free = days;
      if (blocks.length) this.state.preferred_blocks = blocks;
      this.state.edit_mode = false;
      this.state.schedule_preview = buildSchedulePreview(this.state);
      await this.saveState();
      const scheduleText = buildScheduleMessage(this.state.schedule_preview);
      return {
        reply: `Updated preview:\n${scheduleText}\n\nApprove this schedule, edit again, or cancel.`,
        state: this.publicState()
      };
    }

    if (EDIT_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.edit_mode = true;
      await this.saveState();
      return { reply: 'Tell me what to change (days or times) for the preview.', state: this.publicState() };
    }

    if (NO_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.permission = false;
      this.state.completed = true;
      this.state.active = false;
      this.state.step = 8;
      await this.saveState();
      return { reply: 'No changes made. You can restart Tenax Resolution Builder anytime.', state: this.publicState() };
    }

    if (YES_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.permission = true;
      await this.saveState();
      return null;
    }

    return { reply: 'Reply approve, edit, or cancel so I can proceed.', state: this.publicState() };
  }

  async handoffToExecution() {
    if (!this.state.duration_weeks) {
      return { reply: 'Duration is missing. Share it to continue.', state: this.publicState() };
    }
    const roadmap = this.state.roadmap;
    if (!roadmap?.phases?.length) {
      return { reply: 'Roadmap missing. Restart the builder to try again.', state: this.publicState() };
    }

    const plan = await ResolutionPlan.create({
      user_id: this.user.id,
      title: roadmap.title,
      goal_text: this.state.resolution_goal,
      target_outcome: this.state.target_outcome,
      duration_weeks: this.state.duration_weeks,
      end_date: this.state.end_date,
      availability_json: {
        hours_per_week: this.state.time_commitment_hours,
        days_free: this.state.days_free,
        preferred_blocks: this.state.preferred_blocks,
        pace: this.state.pace
      },
      status: 'active',
      roadmap_json: roadmap
    });

    const phasesPayload = roadmap.phases.map((phase) => ({
      plan_id: plan.id,
      phase_index: phase.phase_index,
      title: phase.title,
      description: phase.description,
      objectives_json: phase.objectives || [],
      topics_json: phase.topics || [],
      resources_json: phase.resources || [],
      completion_status: 'pending',
      completion_criteria_json: phase.completion_criteria || { type: 'threshold', threshold: 0.8 }
    }));

    const phases = await ResolutionPhase.createMany(phasesPayload);
    const tasks = generateResolutionTasks({
      user: this.user,
      planId: plan.id,
      phases,
      durationWeeks: this.state.duration_weeks,
      daysFree: this.state.days_free,
      preferredBlocks: this.state.preferred_blocks,
      hoursPerWeek: this.state.time_commitment_hours,
      pace: this.state.pace
    });

    const createdTasks = await ResolutionTask.createMany(tasks);
    await mirrorTasksToExecution(createdTasks, this.user.id);

    this.state.completed = true;
    this.state.active = false;
    this.state.step = 8;
    await this.saveState();

    return {
      reply: `Approved. ${createdTasks.length} roadmap sessions added. Execution Agent will handle reminders from here.`,
      state: this.publicState(),
      created_tasks: createdTasks.length,
      plan_id: plan.id
    };
  }

  async handleInput(text) {
    const trimmed = (text || '').trim();
    const normalized = normalize(trimmed);
    if (!trimmed) {
      return { reply: 'Add a quick response so I can keep the roadmap moving.', state: this.publicState() };
    }
    if (NO_TRIGGERS.includes(normalized) && this.state.step < 7) {
      this.state.completed = true;
      this.state.active = false;
      await this.saveState();
      return { reply: 'No changes made. You can restart Tenax Resolution Builder anytime.', state: this.publicState() };
    }

    if (this.state.step === 1) {
      return this.captureResolution(trimmed);
    }
    if (this.state.step === 2) {
      return this.captureOutcome(trimmed);
    }
    if (this.state.step === 3) {
      return this.captureDuration(trimmed);
    }
    if (this.state.step === 4) {
      return this.captureTimeReality(trimmed);
    }
    if (this.state.step === 5) {
      return this.capturePace(trimmed);
    }
    if (this.state.step === 6) {
      return this.handleResources(trimmed);
    }
    if (this.state.step === 7) {
      const permissionResult = await this.handlePermission(trimmed);
      if (permissionResult) return permissionResult;
      return this.handoffToExecution();
    }
    return { reply: 'Resolution Builder is complete. Start again if you want a new roadmap.', state: this.publicState() };
  }
}

async function getOrCreateSession(user) {
  const existing = await ResolutionBuilderSession.getActiveByUser(user.id);
  if (existing) return existing;
  return ResolutionBuilderSession.create(user.id, null);
}

async function startSession(user) {
  const sessionRecord = await getOrCreateSession(user);
  const flow = new ResolutionBuilderFlow(user, sessionRecord);
  const response = await flow.start();
  await flow.logMessage('assistant', response.reply, 'start', response.state);
  return response;
}

async function handleMessage(user, text) {
  const sessionRecord = await getOrCreateSession(user);
  const flow = new ResolutionBuilderFlow(user, sessionRecord);
  await flow.logMessage('user', text, `step_${flow.state.step}`);
  const response = await flow.handleInput(text);
  if (response?.reply) {
    await flow.logMessage('assistant', response.reply, `step_${flow.state.step}`, response.state);
  }
  if (flow.state.completed) {
    await ResolutionBuilderSession.setStatus(sessionRecord.id, 'finished');
  }
  return response;
}

async function isActive(userId) {
  const session = await ResolutionBuilderSession.getActiveByUser(userId);
  return Boolean(session?.status === 'active');
}

async function clearSession(userId) {
  const session = await ResolutionBuilderSession.getActiveByUser(userId);
  if (!session) return;
  await ResolutionBuilderSession.setStatus(session.id, 'cancelled');
}

module.exports = {
  startSession,
  handleMessage,
  isActive,
  clearSession
};
