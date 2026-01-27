const Task = require('../models/Task');
const ruleStateService = require('./ruleState');
const { DateTime } = require('luxon');
const llmService = require('./llm');

const sessions = new Map();

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

const DEFAULT_BLOCKS = [
  { label: 'Evening', time: { hour: 19, minute: 0 } }
];

const DAY_PART_BLOCKS = [
  { key: 'morning', label: 'Morning', time: { hour: 7, minute: 30 } },
  { key: 'afternoon', label: 'Afternoon', time: { hour: 13, minute: 0 } },
  { key: 'evening', label: 'Evening', time: { hour: 19, minute: 0 } },
  { key: 'night', label: 'Night', time: { hour: 21, minute: 0 } }
];

const YES_TRIGGERS = ['yes', 'yep', 'sure', 'ok', 'okay', 'approve', 'approved', 'go ahead', 'do it'];
const NO_TRIGGERS = ['no', 'nope', 'cancel', 'stop', 'not now'];
const EDIT_TRIGGERS = ['edit', 'change', 'adjust', 'partial'];

const normalize = (value = '') => value.toLowerCase().trim();

const formatTimeLabel = (hour, minute = 0) => {
  const safeHour = Math.min(Math.max(hour, 0), 23);
  const safeMinute = Math.min(Math.max(minute, 0), 59);
  const displayHour = safeHour % 12 || 12;
  const suffix = safeHour >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${String(safeMinute).padStart(2, '0')} ${suffix}`;
};

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

function resolveSessionsPerWeek(hoursPerWeek, daysAvailable) {
  if (!daysAvailable) return 1;
  if (!hoursPerWeek) return daysAvailable;
  const sessions = Math.round(hoursPerWeek / 2);
  return Math.max(1, Math.min(daysAvailable, sessions));
}

function buildRoadmap(goal, outcome) {
  const normalized = normalize(goal);
  let title = `${goal} Roadmap`;
  let phases = [];

  if (normalized.includes('javascript') || normalized.includes('js')) {
    phases = [
      { name: 'Fundamentals', description: 'Syntax, core concepts, and problem solving.', duration_weeks: 2 },
      { name: 'DOM and Browser APIs', description: 'Events, state, and browser tooling.', duration_weeks: 2 },
      { name: 'Async and APIs', description: 'Promises, async/await, data fetching.', duration_weeks: 2 },
      { name: 'Mini Projects', description: 'Small apps that reinforce the basics.', duration_weeks: 2 },
      { name: 'Capstone Build', description: 'A real-world project you can demo.', duration_weeks: 3 }
    ];
  } else if (normalized.includes('fitness') || normalized.includes('workout') || normalized.includes('gym')) {
    phases = [
      { name: 'Baseline and Goals', description: 'Assess starting point and set targets.', duration_weeks: 2 },
      { name: 'Strength Foundation', description: 'Build core lifts and form consistency.', duration_weeks: 3 },
      { name: 'Endurance and Mobility', description: 'Cardio base plus mobility routines.', duration_weeks: 3 },
      { name: 'Nutrition and Recovery', description: 'Dial in fuel, sleep, and recovery.', duration_weeks: 2 },
      { name: 'Progressive Overload', description: 'Scale intensity and track milestones.', duration_weeks: 3 }
    ];
  } else if (normalized.includes('ai') || normalized.includes('machine learning') || normalized.includes('ml')) {
    phases = [
      { name: 'Math + Python Core', description: 'Linear algebra, stats, Python workflows.', duration_weeks: 3 },
      { name: 'ML Fundamentals', description: 'Supervised learning, evaluation, feature work.', duration_weeks: 3 },
      { name: 'Deep Learning', description: 'Neural nets, embeddings, transformers.', duration_weeks: 3 },
      { name: 'Applied Projects', description: 'Build and iterate on real problems.', duration_weeks: 3 },
      { name: 'Deployment + Portfolio', description: 'Ship models and explain results.', duration_weeks: 2 }
    ];
  } else if (normalized.includes('portfolio')) {
    phases = [
      { name: 'Portfolio Strategy', description: 'Pick a theme and define target audience.', duration_weeks: 2 },
      { name: 'Project Selection', description: 'Curate 3 to 5 proof-of-skill projects.', duration_weeks: 2 },
      { name: 'Case Studies', description: 'Write problem, approach, and outcomes.', duration_weeks: 3 },
      { name: 'Visual Polish', description: 'Refine design, storytelling, and UX.', duration_weeks: 2 },
      { name: 'Distribution', description: 'Launch, share, and iterate from feedback.', duration_weeks: 2 }
    ];
  } else {
    phases = [
      { name: 'Foundations', description: 'Core concepts and quick wins.', duration_weeks: 2 },
      { name: 'Core Skills', description: 'Structured practice and repetition.', duration_weeks: 2 },
      { name: 'Applied Practice', description: 'Use the skill in real scenarios.', duration_weeks: 2 },
      { name: 'Projects and Proof', description: 'Build artifacts that show progress.', duration_weeks: 2 },
      { name: 'Capstone Milestone', description: 'Deliver a measurable result.', duration_weeks: 3 }
    ];
  }

  if (outcome) {
    title = `${goal} -> ${outcome}`;
  }

  return { title, phases };
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

function sanitizeRoadmap(raw, fallbackGoal, fallbackOutcome) {
  if (!raw || typeof raw !== 'object') {
    return buildRoadmap(fallbackGoal, fallbackOutcome);
  }

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : fallbackOutcome
      ? `${fallbackGoal} -> ${fallbackOutcome}`
      : `${fallbackGoal} Roadmap`;

  const phasesRaw = Array.isArray(raw.phases) ? raw.phases : [];
  const phases = phasesRaw
    .map((phase) => ({
      name: typeof phase?.name === 'string' ? phase.name.trim() : '',
      description: typeof phase?.description === 'string' ? phase.description.trim() : '',
      duration_weeks: Number.isFinite(Number(phase?.duration_weeks)) ? Number(phase.duration_weeks) : null
    }))
    .filter((phase) => phase.name && phase.description)
    .map((phase) => ({
      ...phase,
      duration_weeks: Math.min(8, Math.max(1, Math.round(phase.duration_weeks || 2)))
    }))
    .slice(0, 8);

  if (!phases.length) {
    return buildRoadmap(fallbackGoal, fallbackOutcome);
  }

  return { title, phases };
}

async function buildRoadmapWithResearch(goal, outcome, user) {
  const prompt = `You are Tenax Resolution Builder. Create a concise, research-backed learning roadmap for this goal.
Goal: ${goal}
Outcome definition: ${outcome || 'Not specified'}

Requirements:
- Produce 4 to 7 sequential phases.
- Each phase must include: name, description, duration_weeks (1-6).
- Keep scope realistic and execution-friendly.
- Return JSON only with this exact shape:
{"title":"...","phases":[{"name":"...","description":"...","duration_weeks":2}]}
`;

  try {
    const response = await llmService.generate(prompt, {
      maxTokens: 700,
      temperature: 0.25,
      opikMeta: {
        action: 'resolution_roadmap',
        user_id: user?.id,
        resolution_goal: goal
      }
    });
    const parsed = extractJsonBlock(response.text);
    return sanitizeRoadmap(parsed, goal, outcome);
  } catch (error) {
    console.warn('[ResolutionBuilder] LLM roadmap generation failed:', error.message);
    return buildRoadmap(goal, outcome);
  }
}

function buildResources(goal) {
  const normalized = normalize(goal);
  if (normalized.includes('javascript') || normalized.includes('js')) {
    return [
      { title: 'MDN JavaScript Guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', type: 'Docs' },
      { title: 'javascript.info', url: 'https://javascript.info', type: 'Guide' },
      { title: 'freeCodeCamp JS Algorithms', url: 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/', type: 'Course' }
    ];
  }
  if (normalized.includes('fitness') || normalized.includes('workout') || normalized.includes('gym')) {
    return [
      { title: 'Strength Training Basics (ACSM)', url: 'https://www.acsm.org', type: 'Guide' },
      { title: 'NHS Workout Plans', url: 'https://www.nhs.uk/live-well/exercise/free-fitness-ideas/', type: 'Plan' },
      { title: 'Mobility Routine Library', url: 'https://www.youtube.com/results?search_query=mobility+routine', type: 'Video' }
    ];
  }
  if (normalized.includes('ai') || normalized.includes('machine learning') || normalized.includes('ml')) {
    return [
      { title: 'fast.ai Practical Deep Learning', url: 'https://course.fast.ai', type: 'Course' },
      { title: 'Hugging Face Course', url: 'https://huggingface.co/course', type: 'Course' },
      { title: 'Kaggle Learn', url: 'https://www.kaggle.com/learn', type: 'Practice' }
    ];
  }
  if (normalized.includes('portfolio')) {
    return [
      { title: 'Portfolio Case Study Framework', url: 'https://www.nngroup.com/articles/case-study-portfolio/', type: 'Guide' },
      { title: 'Personal Branding Checklist', url: 'https://www.adobe.com/creativecloud/design/discover/personal-brand.html', type: 'Guide' },
      { title: 'Project Storytelling Tips', url: 'https://www.behance.net/galleries', type: 'Inspiration' }
    ];
  }
  return [
    { title: 'Goal Setting Worksheet', url: 'https://www.mindtools.com/a5y3vrs/smart-goals', type: 'Guide' },
    { title: 'Learning How to Learn (coursera)', url: 'https://www.coursera.org/learn/learning-how-to-learn', type: 'Course' },
    { title: 'Habit Building Basics', url: 'https://jamesclear.com/atomic-habits', type: 'Guide' }
  ];
}

function buildSchedulePreview(state) {
  const roadmap = state.roadmap || [];
  const days = state.days_free || [];
  const blocks = state.preferred_blocks && state.preferred_blocks.length ? state.preferred_blocks : DEFAULT_BLOCKS;

  if (!roadmap.length || !days.length) {
    return [];
  }

  const sessionsPerWeek = resolveSessionsPerWeek(state.time_commitment_hours, days.length);
  const selectedDays = days.slice(0, sessionsPerWeek);
  const focusTemplates = ['Learn new concept', 'Guided practice', 'Applied build', 'Review + recap'];
  const preview = [];
  const maxEntries = Math.max(6, Math.min(12, selectedDays.length * 3));
  let focusIndex = 0;

  roadmap.forEach((phase, phaseIndex) => {
    const phaseWeeks = phase.duration_weeks || 2;
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
          phase_name: phase.name,
          focus
        });
        focusIndex += 1;
      });
      if (preview.length >= maxEntries) {
        return;
      }
    }
  });

  return preview;
}

function getNextOccurrenceISO(dayOfWeek, time, timezone = 'UTC', weekOffset = 0) {
  const now = DateTime.now().setZone(timezone).plus({ weeks: weekOffset });
  let candidate = now;
  const normalizedDay = ((dayOfWeek % 7) + 7) % 7;
  while (candidate.weekday % 7 !== normalizedDay) {
    candidate = candidate.plus({ days: 1 });
  }
  let withTime = candidate.set({ hour: time.hour, minute: time.minute, second: 0, millisecond: 0 });
  if (withTime <= now) {
    withTime = withTime.plus({ days: 7 });
  }
  return withTime.toUTC().toISO();
}

function buildRoadmapMessage(roadmap) {
  if (!roadmap?.length) return 'No roadmap generated yet.';
  const lines = roadmap.map((phase, index) => (
    `Phase ${index + 1}: ${phase.name} - ${phase.description}`
  ));
  return lines.join('\n');
}

function buildResourcesMessage(resources) {
  if (!resources?.length) return 'No resources added.';
  const lines = resources.map((resource, index) => (
    `${index + 1}. ${resource.title} (${resource.type})`
  ));
  return lines.join('\n');
}

function buildScheduleMessage(schedule) {
  if (!schedule?.length) return 'Schedule preview not ready yet.';
  return schedule.map((slot) => (
    `${slot.day_label}: ${slot.phase_name} - ${slot.focus} (${slot.time_label})`
  )).join('\n');
}

class ResolutionBuilderSession {
  constructor(user) {
    this.user = user;
    this.state = {
      step: 1,
      resolution_goal: '',
      target_outcome: '',
      time_commitment_hours: null,
      days_free: [],
      preferred_blocks: [],
      roadmap_title: '',
      roadmap: [],
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

  start() {
    return {
      reply: 'Welcome to Tenax Resolution Builder. What is your New Year resolution or big goal?',
      state: this.publicState()
    };
  }

  captureResolution(input) {
    if (!input) {
      return { reply: 'Share a resolution goal so we can build your roadmap.', state: this.publicState() };
    }
    this.state.resolution_goal = input;
    this.state.step = 2;
    return {
      reply: 'What does success look like for this goal? Examples: fundamentals, projects, job-ready, interview prep.',
      state: this.publicState()
    };
  }

  captureOutcome(input) {
    if (!input) {
      return { reply: 'Give me a short success definition so the roadmap stays aligned.', state: this.publicState() };
    }
    this.state.target_outcome = input;
    this.state.step = 3;
    this.state.time_step = 'hours';
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
      return { reply: 'Which days are usually free for this? Example: Mon, Wed, Sat.', state: this.publicState() };
    }

    if (this.state.time_step === 'days') {
      const days = parseDays(input);
      if (!days.length) {
        return { reply: 'List the days that are usually free (e.g. Tue Thu Sat or weekdays).', state: this.publicState() };
      }
      this.state.days_free = days;
      this.state.time_step = 'blocks';
      return { reply: 'Preferred learning time blocks? Example: evenings, 7-9pm, or 6:30am.', state: this.publicState() };
    }

    const blocks = parseBlocks(input);
    if (!blocks.length) {
      return { reply: 'Share a preferred time block (e.g. evenings or 7:30pm).', state: this.publicState() };
    }
    this.state.preferred_blocks = blocks;
    this.state.step = 4;

    const roadmapResult = await buildRoadmapWithResearch(
      this.state.resolution_goal,
      this.state.target_outcome,
      this.user
    );
    this.state.roadmap_title = roadmapResult.title;
    this.state.roadmap = roadmapResult.phases;
    this.state.step = 5;

    const roadmapText = buildRoadmapMessage(this.state.roadmap);
    return {
      reply: `Roadmap draft:\n${roadmapText}\n\nWould you like learning resources added? (yes/no)`,
      state: this.publicState()
    };
  }

  handleResources(input) {
    const normalized = normalize(input);
    const wantsResources = YES_TRIGGERS.some((trigger) => normalized.includes(trigger));
    const rejectsResources = NO_TRIGGERS.some((trigger) => normalized.includes(trigger));

    if (!wantsResources && !rejectsResources) {
      return { reply: 'Say "yes" to add resources or "no" to skip them.', state: this.publicState() };
    }

    if (wantsResources) {
      this.state.resources = buildResources(this.state.resolution_goal);
    } else {
      this.state.resources = [];
    }

    this.state.schedule_preview = buildSchedulePreview(this.state);
    this.state.step = 7;

    const resourcesText = wantsResources ? `Resources added:\n${buildResourcesMessage(this.state.resources)}\n\n` : '';
    const scheduleText = buildScheduleMessage(this.state.schedule_preview);
    return {
      reply: `${resourcesText}Schedule preview (not yet added):\n${scheduleText}\n\nShould I add this learning roadmap to your daily schedule? Reply approve, edit, or cancel.`,
      state: this.publicState()
    };
  }

  handlePermission(input) {
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
      const scheduleText = buildScheduleMessage(this.state.schedule_preview);
      return {
        reply: `Updated preview:\n${scheduleText}\n\nApprove this schedule, edit again, or cancel.`,
        state: this.publicState()
      };
    }

    if (EDIT_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.edit_mode = true;
      return { reply: 'Tell me what to change (days or times) for the preview.', state: this.publicState() };
    }

    if (NO_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.permission = false;
      this.state.completed = true;
      this.state.active = false;
      this.state.step = 8;
      return { reply: 'No changes made. You can restart Tenax Resolution Builder anytime.', state: this.publicState() };
    }

    if (YES_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
      this.state.permission = true;
      return null;
    }

    return { reply: 'Reply approve, edit, or cancel so I can proceed.', state: this.publicState() };
  }

  async handoffToExecution() {
    const timezone = this.user?.timezone || 'UTC';
    const schedule = this.state.schedule_preview || [];
    if (!schedule.length) {
      return { reply: 'Schedule preview is empty. Restart the builder to try again.', state: this.publicState() };
    }

    const hoursPerWeek = this.state.time_commitment_hours || 0;
    const sessionsPerWeek = schedule.length || 1;
    const minutesPerSession = Math.max(30, Math.min(120, Math.round((hoursPerWeek / sessionsPerWeek) * 60) || 60));

    const tasks = [];
    let offsetWeeks = 0;
    this.state.roadmap.forEach((phase, phaseIndex) => {
      const phaseWeeks = phase.duration_weeks || 2;
      schedule.forEach((slot) => {
        const start_time = getNextOccurrenceISO(slot.day_of_week, slot.time, timezone, offsetWeeks);
        tasks.push({
          user_id: this.user.id,
          title: `${this.state.resolution_goal}: ${phase.name} - ${slot.focus}`,
          description: phase.description,
          category: 'Resolution',
          start_time,
          duration_minutes: minutesPerSession,
          recurrence: {
            pattern: 'weekly',
            day_of_week: slot.day_of_week
          },
          severity: phaseIndex === 0 ? 'p1' : 'p2',
          priority: phaseIndex === 0 ? 'P1' : 'P2',
          created_via: 'resolution_builder',
          metadata: {
            resolution_goal: this.state.resolution_goal,
            target_outcome: this.state.target_outcome,
            phase: phase.name,
            phase_index: phaseIndex,
            phase_duration_weeks: phaseWeeks,
            phase_start_week_offset: offsetWeeks,
            resources: this.state.resources,
            focus: slot.focus,
            schedule_anchor: `${slot.day_label} ${slot.time_label}`
          }
        });
      });
      offsetWeeks += phaseWeeks;
    });

    await Task.createMany(tasks);
    if (tasks.some((task) => task.severity === 'p1')) {
      await ruleStateService.refreshUserState(this.user.id);
    }

    this.state.completed = true;
    this.state.active = false;
    this.state.step = 8;

    return {
      reply: `Approved. ${tasks.length} roadmap sessions added. Execution Agent will handle reminders and accountability from here.`,
      state: this.publicState(),
      created_tasks: tasks.length
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
      return { reply: 'No changes made. You can restart Tenax Resolution Builder anytime.', state: this.publicState() };
    }

    if (this.state.step === 1) {
      return this.captureResolution(trimmed);
    }
    if (this.state.step === 2) {
      return this.captureOutcome(trimmed);
    }
    if (this.state.step === 3) {
      return await this.captureTimeReality(trimmed);
    }
    if (this.state.step === 5) {
      return this.handleResources(trimmed);
    }
    if (this.state.step === 7) {
      const permissionResult = this.handlePermission(trimmed);
      if (permissionResult) {
        return permissionResult;
      }
      return this.handoffToExecution();
    }
    return { reply: 'Resolution Builder is complete. Start again if you want a new roadmap.', state: this.publicState() };
  }
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function startSession(user) {
  const session = new ResolutionBuilderSession(user);
  sessions.set(user.id, session);
  return session.start();
}

async function handleMessage(user, text) {
  let session = getSession(user.id);
  if (!session) {
    session = new ResolutionBuilderSession(user);
    sessions.set(user.id, session);
    if (!text || !text.trim()) {
      return session.start();
    }
  }
  const response = await session.handleInput(text);
  if (response?.state && response.state.completed) {
    sessions.set(user.id, session);
  }
  return response;
}

function getState(userId) {
  const session = getSession(userId);
  if (!session) return null;
  return session.publicState();
}

function clearSession(userId) {
  sessions.delete(userId);
}

function isActive(userId) {
  const session = getSession(userId);
  return Boolean(session?.publicState().active);
}

module.exports = {
  startSession,
  handleMessage,
  getState,
  clearSession,
  isActive
};
