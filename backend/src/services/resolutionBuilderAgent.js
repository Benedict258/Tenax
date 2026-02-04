const Task = require('../models/Task');
const ruleStateService = require('./ruleState');
const { DateTime } = require('luxon');
const llmService = require('./llm');
const ResolutionBuilderSession = require('../models/ResolutionBuilderSession');
const ResolutionBuilderMessage = require('../models/ResolutionBuilderMessage');
const ResolutionPlan = require('../models/ResolutionPlan');
const ResolutionPhase = require('../models/ResolutionPhase');
const ResolutionTask = require('../models/ResolutionTask');
const ResolutionDailyItem = require('../models/ResolutionDailyItem');
const ResolutionRoadmap = require('../models/ResolutionRoadmap');
const ResolutionResource = require('../models/ResolutionResource');
const ResolutionProgress = require('../models/ResolutionProgress');
const scheduleService = require('./scheduleService');
const QueueService = require('./queue');
const resourceRetriever = require('./resourceRetriever');

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

const YES_TRIGGERS = ['yes', 'yep', 'sure', 'ok', 'okay', 'approve', 'approved', 'go ahead', 'do it', 'add it', 'add plan', 'add'];
const NO_TRIGGERS = ['no', 'nope', 'cancel', 'stop', 'not now', 'skip'];
const EDIT_TRIGGERS = ['edit', 'change', 'adjust', 'partial', 'change times', 'update times'];
const PACE_OPTIONS = ['light', 'standard', 'intense'];
const RESOLUTION_TYPES = ['skill_based', 'habit_based', 'outcome_based', 'hybrid'];

const normalize = (value = '') => value.toLowerCase().trim();

const slugify = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

function normalizeResolutionType(type = '') {
  const normalized = normalize(type);
  if (RESOLUTION_TYPES.includes(normalized)) return normalized;
  if (normalized === 'skill' || normalized === 'skill-based') return 'skill_based';
  if (normalized === 'habit' || normalized === 'routine') return 'habit_based';
  if (normalized === 'health') return 'habit_based';
  if (normalized === 'project' || normalized === 'outcome') return 'outcome_based';
  if (normalized === 'mixed') return 'hybrid';
  return 'skill_based';
}

function classifyResolution(goal = '') {
  const text = normalize(goal);
  const skillHints = ['learn', 'master', 'study', 'course', 'javascript', 'python', 'programming', 'ai', 'engineering', 'design', 'data'];
  const habitHints = ['daily', 'consistent', 'habit', 'routine', 'wake', 'sleep', 'meditate', 'journal'];
  const healthHints = ['jog', 'run', 'workout', 'gym', 'fitness', 'lose', 'weight', 'diet', 'healthy'];
  const projectHints = ['build', 'ship', 'launch', 'mvp', 'portfolio', 'app', 'product', 'internship', 'job'];

  const matches = {
    skill_based: skillHints.some((hint) => text.includes(hint)),
    habit_based: habitHints.some((hint) => text.includes(hint)),
    health: healthHints.some((hint) => text.includes(hint)),
    outcome_based: projectHints.some((hint) => text.includes(hint))
  };

  const active = Object.entries(matches).filter(([, value]) => value).map(([key]) => key);
  if (active.length > 1) return 'hybrid';
  if (matches.health) return 'habit_based';
  if (matches.habit_based) return 'habit_based';
  if (matches.outcome_based) return 'outcome_based';
  return 'skill_based';
}

function parseDaysPerWeek(text) {
  const normalized = normalize(text);
  const match = normalized.match(/(\d+)\s*(days|day|x)\b/);
  if (match) {
    const value = Number(match[1]);
    if (!Number.isNaN(value) && value > 0 && value <= 7) return value;
  }
  if (normalized.includes('daily')) return 7;
  if (normalized.includes('weekend')) return 2;
  return null;
}

function parseSessionMinutes(text) {
  const normalized = normalize(text);
  const match = normalized.match(/(\d+)\s*(min|minute|minutes)/);
  if (match) {
    const value = Number(match[1]);
    if (!Number.isNaN(value) && value > 0) return value;
  }
  return null;
}

function buildOutcomePrompt(type) {
  if (type === 'habit_based') {
    return 'How many days per week and how long per session? Example: 4 days/week, 20 minutes.';
  }
  if (type === 'outcome_based') {
    return 'What is the concrete deliverable and key milestones? Example: ship an MVP + 3 case studies.';
  }
  if (type === 'hybrid') {
    return 'Split it for me: skill outcome + habit frequency. Example: build 2 projects + jog 3 days/week.';
  }
  return 'What outcome do you want at the end? Example: build projects, pass interviews, or be able to do X.';
}

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

function resolveSessionsPerWeek(hoursPerWeek, daysAvailable, pace = 'standard', daysPerWeek = null) {
  if (!daysAvailable) return 1;
  if (daysPerWeek && Number.isFinite(daysPerWeek)) {
    return Math.max(1, Math.min(daysAvailable, daysPerWeek));
  }
  const base = hoursPerWeek ? Math.max(1, Math.round(hoursPerWeek / 2)) : daysAvailable;
  const paceFactor = pace === 'light' ? 0.8 : pace === 'intense' ? 1.2 : 1;
  const sessions = Math.round(base * paceFactor);
  return Math.max(1, Math.min(daysAvailable, sessions));
}

function buildRoadmap(goal, outcome, durationWeeks) {
  const title = outcome ? `${goal} -> ${outcome}` : `${goal} Roadmap`;
  const domain = goal.split(' ').slice(0, 4).join(' ').trim() || 'Goal';
  const phases = [
    {
      phase_index: 0,
      title: `${domain}: Setup + Fundamentals`,
      description: `Get the environment ready and learn the building blocks for ${domain}.`,
      phase_objective: `Understand the core building blocks needed to start ${domain}.`,
      what_to_learn: [`Core terminology for ${domain}`, 'Basic workflow', 'First practical example'],
      what_to_build: [`Create a minimal starter example for ${domain}`],
      objectives: ['Explain the fundamentals', 'Complete a small starter exercise'],
      topics: [{ title: 'Fundamentals', subtopics: ['Core terms', 'Setup', 'First steps'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'manual_confirm', criteria: [`Build a starter example for ${domain}`], end_goal: `Build a starter example for ${domain}` }
    },
    {
      phase_index: 1,
      title: `${domain}: Core Skills`,
      description: `Build the essential skills required to progress in ${domain}.`,
      phase_objective: `Develop confidence with the core mechanics of ${domain}.`,
      what_to_learn: ['Key concepts', 'Core techniques', 'Common pitfalls'],
      what_to_build: ['Solve 2 practical exercises'],
      objectives: ['Apply core techniques', 'Complete structured drills'],
      topics: [{ title: 'Core techniques', subtopics: ['Technique A', 'Technique B'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'manual_confirm', criteria: ['Complete 2 practical exercises'], end_goal: 'Complete 2 practical exercises' }
    },
    {
      phase_index: 2,
      title: `${domain}: Applied Practice`,
      description: `Practice with real-world tasks and consolidate ${domain} knowledge.`,
      phase_objective: `Apply your knowledge to real tasks.`,
      what_to_learn: ['Applied workflows', 'Quality checks', 'Self-review'],
      what_to_build: ['Finish a mini-project or routine'],
      objectives: ['Deliver a mini output', 'Reflect on results'],
      topics: [{ title: 'Applied tasks', subtopics: ['Mini project', 'Review'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'manual_confirm', criteria: ['Finish one mini output'], end_goal: 'Finish one mini output' }
    }
  ];
  return { goal, duration_weeks: durationWeeks, title, phases };
}

function buildFallbackRoadmapFromResearch(goal, outcome, durationWeeks, researchPack = []) {
  const cleanedTitles = researchPack
    .map((item) => item?.title || '')
    .filter(Boolean)
    .map((title) => title.split(/[-|:]/)[0].trim())
    .filter(Boolean);
  const uniqueTopics = [...new Set(cleanedTitles)];
  const phaseCount = Math.min(8, Math.max(5, uniqueTopics.length || 5));
  const title = outcome ? `${goal} -> ${outcome}` : `${goal} Roadmap`;
  const phases = Array.from({ length: phaseCount }).map((_, index) => {
    const topic = uniqueTopics[index] || `${goal} Focus ${index + 1}`;
    const deliverable = `Produce a concrete output using ${topic}`;
    return {
      phase_index: index,
      title: `${topic}`,
      description: `Go deep on ${topic} and connect it to ${goal}.`,
      phase_objective: `Understand and apply ${topic} toward ${goal}.`,
      what_to_learn: [`Key concepts of ${topic}`, `Common workflows for ${topic}`, `How ${topic} connects to ${goal}`],
      what_to_build: [deliverable],
      objectives: [`Explain ${topic}`, `Apply ${topic} in a practical exercise`],
      topics: [{ title: topic, type: 'core' }],
      resources: [],
      completion_criteria: { type: 'manual_confirm', criteria: [deliverable], end_goal: deliverable }
    };
  });
  return { goal, duration_weeks: durationWeeks || phaseCount, title, phases };
}

function buildHabitRoadmap(goal, durationWeeks, daysPerWeek, sessionMinutes) {
  const weeks = durationWeeks || 6;
  const phasesCount = Math.min(6, Math.max(3, Math.round(weeks / 2)));
  const baseWeeks = Math.floor(weeks / phasesCount) || 1;
  let remainder = weeks - baseWeeks * phasesCount;

  const phases = Array.from({ length: phasesCount }).map((_, index) => {
    const phaseWeeks = baseWeeks + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    const intensity = Math.round((sessionMinutes || 20) + index * 5);
    const weekStart = index * phaseWeeks + 1;
    const weekEnd = index * phaseWeeks + phaseWeeks;
    return {
      phase_index: index,
      title: `Weeks ${weekStart}-${weekEnd}: Consistency + progression`,
      description: `Maintain a ${daysPerWeek || 3} days/week routine while increasing duration to ~${intensity} minutes.`,
      phase_objective: `Complete ${daysPerWeek || 3} sessions per week at ~${intensity} minutes.`,
      objectives: [
        `Complete ${daysPerWeek || 3} sessions each week`,
        'Track effort, sleep, and recovery'
      ],
      what_to_learn: ['Warm-up flow', 'Cooldown routine', 'Form cues', 'Recovery basics'],
      what_to_build: ['Habit streak', 'Weekly reflection note'],
      topics: [
        {
          title: `Session plan (~${intensity} min)`,
          subtopics: ['Warm-up 5-10 min', 'Main work', 'Cooldown 5-10 min'],
          type: 'core'
        }
      ],
      resources: [
        {
          title: 'CDC Physical Activity Basics',
          url: 'https://www.cdc.gov/physicalactivity/basics/index.htm',
          kind: 'guide',
          difficulty: 'beginner'
        }
      ],
      duration_weeks: phaseWeeks,
      completion_criteria: { type: 'manual_confirm', criteria: ['Hit all weekly sessions', 'Log a reflection'] }
    };
  });

  return {
    goal,
    duration_weeks: weeks,
    title: `${goal} Routine`,
    phases
  };
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
        ? phase.resources
            .map((resource) => ({
              title: resource?.title || '',
              url: resource?.url || resource?.link || '',
              type: resource?.type || resource?.kind || 'resource',
              why: resource?.why || resource?.reason || ''
            }))
            .filter((resource) => resource.title && resource.url)
        : [];
      const objectives = Array.isArray(phase?.objectives)
        ? phase.objectives
        : Array.isArray(phase?.learning_objectives)
        ? phase.learning_objectives
        : [];
      const learningOutcomes = Array.isArray(phase?.learning_outcomes)
        ? phase.learning_outcomes
        : Array.isArray(phase?.topics_to_learn)
        ? phase.topics_to_learn
        : [];
      const topics = Array.isArray(phase?.topics)
        ? phase.topics
        : Array.isArray(phase?.topics_to_learn)
        ? phase.topics_to_learn.map((topic) =>
            typeof topic === 'string' ? { title: topic, type: 'core' } : topic
          )
        : [];
      const deliverable = typeof phase?.deliverable === 'string'
        ? phase.deliverable.trim()
        : Array.isArray(phase?.what_to_build) && phase.what_to_build.length
        ? String(phase.what_to_build[0])
        : '';
      const endGoal = typeof phase?.end_goal === 'string'
        ? phase.end_goal.trim()
        : '';

      return {
        phase_index: Number.isFinite(Number(phase?.phase_index)) ? Number(phase.phase_index) : index,
        title: typeof phase?.title === 'string'
          ? phase.title.trim()
          : typeof phase?.phase_title === 'string'
          ? phase.phase_title.trim()
          : '',
        description: typeof phase?.description === 'string'
          ? phase.description.trim()
          : typeof phase?.phase_description === 'string'
          ? phase.phase_description.trim()
          : '',
        phase_objective: typeof phase?.objective === 'string'
          ? phase.objective.trim()
          : typeof phase?.phase_objective === 'string'
          ? phase.phase_objective.trim()
          : '',
        phase_end_goal: endGoal,
        what_to_learn: Array.isArray(phase?.what_to_learn)
          ? phase.what_to_learn.filter(Boolean)
          : learningOutcomes.filter(Boolean),
        what_to_build: Array.isArray(phase?.what_to_build)
          ? phase.what_to_build.filter(Boolean)
          : deliverable ? [deliverable] : [],
        objectives: objectives.filter(Boolean),
        topics,
        resources,
        duration_weeks: Number.isFinite(Number(phase?.duration_weeks)) ? Number(phase.duration_weeks) : null,
        completion_criteria: phase?.completion_criteria || {
          type: 'manual_confirm',
          criteria: endGoal ? [endGoal] : deliverable ? [deliverable] : []
        }
      };
    })
    .filter((phase) => phase.title && phase.description);

  if (!phases.length) {
    return buildRoadmap(fallbackGoal, fallbackOutcome, durationWeeks || 6);
  }

  phases.forEach((phase) => {
    if (!phase.phase_objective && phase.objectives.length) {
      phase.phase_objective = phase.objectives[0];
    }
    if (!phase.phase_end_goal) {
      phase.phase_end_goal = phase.what_to_build?.[0] || phase.completion_criteria?.criteria?.[0] || '';
    }
    if (phase.phase_end_goal && phase.completion_criteria) {
      phase.completion_criteria.end_goal = phase.phase_end_goal;
    }
  });

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
    title: raw.roadmap_title || raw.title || `${fallbackGoal} Roadmap`,
    phases
  };
}

function expandPhases(phases, minCount = 5, maxCount = 8) {
  if (!Array.isArray(phases)) return [];
  if (phases.length >= minCount) {
    return phases.slice(0, maxCount);
  }

  const expanded = [];
  for (const phase of phases) {
    const topics = Array.isArray(phase.topics) ? phase.topics : [];
    if (topics.length > 1) {
      for (const topic of topics) {
        expanded.push({
          ...phase,
          title: `${phase.title}: ${topic.title}`,
          description: phase.description || `Focus on ${topic.title}.`,
          objectives: phase.objectives || [],
          topics: [topic]
        });
        if (expanded.length >= maxCount) break;
      }
    } else {
      expanded.push(phase);
    }
    if (expanded.length >= maxCount) break;
  }

  while (expanded.length < minCount) {
    const base = phases[0] || expanded[0];
    const baseTopics = Array.isArray(base?.topics) ? base.topics : [];
    if (!base || !baseTopics.length) break;
    const topic = baseTopics[expanded.length % baseTopics.length];
    expanded.push({
      ...base,
      title: `${base.title}: ${topic.title}`,
      description: base.description || `Focus on ${topic.title}.`,
      objectives: base.objectives || [],
      topics: [topic]
    });
  }

  return expanded.slice(0, maxCount);
}

function curatePhaseResources(phases, { globalLimit = 8, perPhaseLimit = 2 } = {}) {
  const seen = new Set();
  let total = 0;
  phases.forEach((phase) => {
    const resources = Array.isArray(phase.resources) ? phase.resources : [];
    const curated = [];
    for (const resource of resources) {
      if (!resource?.url || !resource?.title) continue;
      if (seen.has(resource.url)) continue;
      curated.push({
        ...resource,
        why: resource.why || resource.reason || `Useful for ${phase.title}`
      });
      seen.add(resource.url);
      total += 1;
      if (curated.length >= perPhaseLimit || total >= globalLimit) break;
    }
    phase.resources = curated;
  });
  return phases;
}

async function buildRoadmapWithResearch(
  goal,
  outcome,
  durationWeeks,
  user,
  resolutionType,
  skillLevel,
  daysPerWeek,
  sessionMinutes
) {
  const normalizedType = normalizeResolutionType(resolutionType);
  if (normalizedType === 'habit_based') {
    return buildHabitRoadmap(goal, durationWeeks, daysPerWeek, sessionMinutes);
  }

  const isRoadmapValid = (roadmap) => {
    if (!roadmap?.phases?.length) return false;
    const banned = [
      'core concepts and quick wins',
      'structured practice and repetition',
      'focus on foundations and apply it with practice',
      'foundations',
      'applied practice',
      'core concepts'
    ];
    return roadmap.phases.every((phase) => {
      const title = (phase.title || '').toLowerCase();
      const description = (phase.description || '').toLowerCase();
      if (!phase.title || !phase.description) return false;
      if (banned.some((phrase) => title.includes(phrase) || description.includes(phrase))) return false;
      if (!phase.phase_objective) return false;
      if (!Array.isArray(phase.what_to_build) || !phase.what_to_build.length) return false;
      const outcomes = Array.isArray(phase.what_to_learn)
        ? phase.what_to_learn
        : Array.isArray(phase.learning_outcomes)
        ? phase.learning_outcomes
        : [];
      if (!outcomes.length || outcomes.length < 3) return false;
      if (!Array.isArray(phase.resources) || phase.resources.length < 2) return false;
      return true;
    });
  };
  const researchPack = await resourceRetriever.retrieveResearchPack(goal, normalizedType);
  const researchLines = researchPack.length
    ? researchPack.map((item, index) => `${index + 1}. ${item.title} - ${item.url}`).join('\n')
    : 'No external sources found.';

  const prompt = `You are Tenax Resolution Builder. Produce a research-backed roadmap with domain-specific phases.
Goal: ${goal}
Outcome definition: ${outcome || 'Not specified'}
Resolution type: ${normalizedType}
Skill level: ${skillLevel || 'unknown'}
Duration: ${durationWeeks} weeks

Research sources (use these to ground topics and resources):
${researchLines}

Return JSON only with this exact shape:
{
  "roadmap_title": "...",
  "resolution_type": "${normalizedType}",
  "phases": [
    {
      "phase_index": 0,
      "phase_title": "...",
      "phase_description": "...",
      "objective": "...",
      "deliverable": "...",
      "end_goal": "...",
      "learning_outcomes": ["..."],
      "topics_to_learn": ["..."],
      "resources": [
        {"title":"...","type":"docs|course|video|article|project","link":"https://...","why":"..."}
      ],
      "completion_criteria": {"type":"manual_confirm","criteria":["..."]}
    }
  ]
}

Rules:
- 5 to 8 phases. No generic buckets like "Foundations" unless paired with specific domain topic.
- Phase titles must be domain-specific (e.g., "Move Basics", "Ownership Model", "Sui Framework").
- Each phase must include objective + deliverable + end_goal.
- Learning outcomes must be concrete and specific (3-6 items).
- Resources must be real URLs, curated, deduplicated, and explain why each is useful.
- Max 3 resources per phase.
- Avoid vague filler. If you cannot specify what to learn, shrink scope.
`;

  const timeoutMs = 25000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('LLM timeout')), timeoutMs);
  });

  try {
    const response = await Promise.race([
      llmService.generate(prompt, {
        maxTokens: 1200,
        temperature: 0.35,
        preferredModel: 'openai',
        opikMeta: {
          action: 'resolution_roadmap',
          user_id: user?.id,
          resolution_goal: goal
        }
      }),
      timeoutPromise
    ]);
    const parsed = extractJsonBlock(response.text);
    let sanitized = sanitizeRoadmap(parsed, goal, outcome, durationWeeks);
    if (!isRoadmapValid(sanitized)) {
      const retryPrompt = `${prompt}\n\nThe previous output was too generic. Regenerate with specific topics and objectives.`;
      const retryResponse = await llmService.generate(retryPrompt, {
        maxTokens: 900,
        temperature: 0.2,
        preferredModel: 'openai',
        opikMeta: {
          action: 'resolution_roadmap_retry',
          user_id: user?.id,
          resolution_goal: goal
        }
      });
      const retryParsed = extractJsonBlock(retryResponse.text);
      sanitized = sanitizeRoadmap(retryParsed, goal, outcome, durationWeeks);
    }
    const expanded = expandPhases(sanitized.phases, 5, 8);
    sanitized = { ...sanitized, phases: expanded };

    const totalWeeks = sanitized.duration_weeks || durationWeeks || expanded.length;
    const baseWeeks = Math.max(1, Math.floor(totalWeeks / expanded.length));
    let remainder = Math.max(0, totalWeeks - baseWeeks * expanded.length);
    sanitized.phases = sanitized.phases.map((phase, index) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return {
        ...phase,
        phase_index: index,
        duration_weeks: phase.duration_weeks || baseWeeks + extra
      };
    });

    // Ensure each phase has curated resources with URLs (fetch if missing).
    for (const phase of sanitized.phases) {
      const resources = Array.isArray(phase.resources) ? phase.resources : [];
      const withLinks = resources.filter((res) => res?.title && res?.url);
      if (withLinks.length >= 2) {
        phase.resources = withLinks.slice(0, 3);
        continue;
      }
      const fetched = await resourceRetriever.retrieveResources(goal, phase.title, {
        forceRefresh: true,
        recencyHint: '2024 2025'
      });
      phase.resources = [...withLinks, ...fetched].slice(0, 3);
    }
    sanitized.phases = curatePhaseResources(sanitized.phases, { globalLimit: 8, perPhaseLimit: 2 });
    let totalResources = sanitized.phases.reduce((sum, phase) => sum + (phase.resources?.length || 0), 0);
    if (totalResources < 5 && researchPack.length) {
      const extras = researchPack
        .filter((item) => item?.title && item?.url)
        .map((item) => ({
          title: item.title,
          url: item.url,
          type: item.type || 'docs',
          why: item.why || `Reference for ${goal}`
        }));
      for (const phase of sanitized.phases) {
        if (totalResources >= 5) break;
        if (!Array.isArray(phase.resources)) phase.resources = [];
        for (const extra of extras) {
          if (totalResources >= 5) break;
          if (phase.resources.some((resource) => resource.url === extra.url)) continue;
          if (phase.resources.length >= 2) break;
          phase.resources.push(extra);
          totalResources += 1;
        }
      }
    }
    return sanitized;
  } catch (error) {
    console.warn('[ResolutionBuilder] LLM roadmap generation failed:', error.message);
    return buildFallbackRoadmapFromResearch(goal, outcome, durationWeeks, researchPack);
  }
}

function buildSchedulePreview(state) {
  const roadmap = state.roadmap?.phases || [];
  const days = state.days_free || [];
  const blocks = state.preferred_blocks && state.preferred_blocks.length ? state.preferred_blocks : DEFAULT_BLOCKS;
  if (!roadmap.length || !days.length) return [];

  const sessionsPerWeek = resolveSessionsPerWeek(
    state.time_commitment_hours,
    days.length,
    state.pace,
    state.days_per_week
  );
  const selectedDays = days.slice(0, sessionsPerWeek);
  const preview = [];
  const maxEntries = Math.max(6, Math.min(12, selectedDays.length * 3));
  let sessionIndex = 0;

  const buildPhaseSessions = (phase) => {
    const topics = Array.isArray(phase.topics) ? phase.topics : [];
    const topicTitles = topics.map((topic) => topic?.title).filter(Boolean);
    const learningOutcomes = Array.isArray(phase.what_to_learn) ? phase.what_to_learn : [];
    const deliverables = Array.isArray(phase.what_to_build) ? phase.what_to_build : [];
    const baseObjective = phase.phase_objective || phase.description || '';

    const items = (topicTitles.length ? topicTitles : learningOutcomes).slice(0, 4);
    if (!items.length) {
      items.push(phase.title);
    }

    return items.map((item, idx) => ({
      title: `${phase.title}: ${item}`,
      objective: baseObjective || `Make progress on ${item}.`,
      deliverable: deliverables[idx] || deliverables[0] || '',
      topic: item
    }));
  };

  roadmap.forEach((phase, phaseIndex) => {
    const phaseWeeks = phase.duration_weeks || 1;
    const sessions = buildPhaseSessions(phase);
    for (let week = 0; week < phaseWeeks; week += 1) {
      selectedDays.forEach((day, dayIndex) => {
        if (preview.length >= maxEntries) return;
        const block = blocks[(dayIndex + week) % blocks.length];
        const session = sessions[sessionIndex % sessions.length];
        preview.push({
          day_of_week: day.dayOfWeek,
          day_label: day.label,
          time: block.time,
          time_label: block.label,
          phase_index: phaseIndex,
          phase_name: phase.title,
          focus: session?.title || phase.title,
          objective: session?.objective || phase.phase_objective || phase.description || '',
          deliverable: session?.deliverable || '',
          resources: Array.isArray(phase.resources) ? phase.resources : []
        });
        sessionIndex += 1;
      });
      if (preview.length >= maxEntries) return;
    }
  });

  return preview;
}

function buildScheduleMessage(schedule) {
  if (!schedule?.length) return 'Schedule preview not ready yet.';
  return schedule.map((slot) => {
    const objectiveLine = slot.objective ? `Objective: ${slot.objective}` : '';
    const deliverableLine = slot.deliverable ? `Deliverable: ${slot.deliverable}` : '';
    const resourcesLine = Array.isArray(slot.resources) && slot.resources.length
      ? `Resources: ${slot.resources.map((resource) => resource?.title).filter(Boolean).slice(0, 2).join(', ')}`
      : '';
    const details = [objectiveLine, deliverableLine, resourcesLine].filter(Boolean).join(' | ');
    return `${slot.day_label}: ${slot.focus} (${slot.time_label})${details ? ` - ${details}` : ''}`;
  }).join('\n');
}

function buildResourcesMessage(resources) {
  if (!resources?.length) return 'No resources added.';
  const grouped = resources.reduce((acc, resource) => {
    const type = resource.type || resource.kind || 'resource';
    if (!acc[type]) acc[type] = [];
    acc[type].push(resource);
    return acc;
  }, {});
  const lines = [];
  Object.entries(grouped).forEach(([type, items]) => {
    lines.push(`${type.toUpperCase()}:`);
    items.forEach((resource) => {
      const why = resource.why ? ` - ${resource.why}` : '';
      lines.push(`- ${resource.title} (${resource.url})${why}`);
    });
  });
  return lines.join('\n');
}

function buildRoadmapMessage(roadmap) {
  if (!roadmap?.phases?.length) return 'No roadmap generated yet.';
  return roadmap.phases.map((phase, index) => (
    `Phase ${index + 1}: ${phase.title}\nObjective: ${phase.phase_objective || phase.description}\nDeliverable: ${phase.what_to_build?.[0] || 'TBD'}`
  )).join('\n');
}

function getDateForWeekDay(baseDate, dayOfWeek, weekOffset = 0) {
  const start = baseDate.plus({ weeks: weekOffset }).startOf('week');
  const targetWeekday = dayOfWeek === 0 ? 7 : dayOfWeek;
  return start.set({ weekday: targetWeekday });
}

function buildPhaseSessions(phase) {
  const topics = Array.isArray(phase.topics) ? phase.topics : [];
  const topicTitles = topics.map((topic) => topic?.title).filter(Boolean);
  const learningOutcomes = Array.isArray(phase.what_to_learn) ? phase.what_to_learn : [];
  const deliverables = Array.isArray(phase.what_to_build) ? phase.what_to_build : [];
  const baseObjective = phase.phase_objective || phase.description || '';

  const items = (topicTitles.length ? topicTitles : learningOutcomes).slice(0, 6);
  if (!items.length) {
    items.push(phase.title);
  }

  return items.map((item, idx) => ({
    title: `${phase.title}: ${item}`,
    objective: baseObjective || `Make progress on ${item}.`,
    deliverable: deliverables[idx] || deliverables[0] || '',
    topic: item
  }));
}

function generateResolutionTasks({
  user,
  planId,
  phases,
  durationWeeks,
  daysFree,
  preferredBlocks,
  hoursPerWeek,
  pace,
  daysPerWeek,
  sessionMinutes
}) {
  const tasks = [];
  if (!phases.length || !daysFree.length || !durationWeeks) return tasks;

  const blocks = preferredBlocks.length ? preferredBlocks : DEFAULT_BLOCKS;
  const sessionsPerWeek = resolveSessionsPerWeek(hoursPerWeek, daysFree.length, pace, daysPerWeek);
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
    const phaseSessionsList = buildPhaseSessions(phase);
    for (let i = 0; i < sessions; i += 1) {
      const slot = slotList[slotIndex];
      if (!slot) break;
      const session = phaseSessionsList[i % phaseSessionsList.length];
      const objective = session?.objective || phase.phase_objective || `Advance ${phase.title}`;
      const deliverable = session?.deliverable || '';
      const topicLine = session?.topic ? `Focus: ${session.topic}.` : '';
      const deliverableLine = deliverable ? `Deliverable: ${deliverable}.` : '';
      const description = [topicLine, deliverableLine].filter(Boolean).join(' ');
      const resources = Array.isArray(phase.resources) ? phase.resources : [];
      const estimatedMinutes = sessionMinutes || Math.max(30, Math.round((hoursPerWeek || 2) * 30));

      tasks.push({
        user_id: user.id,
        plan_id: planId,
        phase_id: phase.id,
        date: slot.date.toISODate(),
        start_time: slot.block.time ? `${String(slot.block.time.hour).padStart(2, '0')}:${String(slot.block.time.minute).padStart(2, '0')}:00` : null,
        title: session?.title || phase.title,
        objective,
        description,
        resources_json: resources,
        estimated_duration_minutes: estimatedMinutes,
        topic_key: slugify(session?.topic || phase.title || 'session'),
        topic_id: slugify(session?.topic || phase.title || 'session'),
        status: 'todo',
        order_index: i,
        locked: phaseIndex > 0
      });
      slotIndex += 1;
    }
  });

  return tasks;
}

async function mirrorTasksToExecution(tasks, user) {
  const unlocked = tasks.filter((task) => !task.locked);
  if (!unlocked.length) return;
  const existing = await Task.findByResolutionTaskIds(
    user.id,
    unlocked.map((task) => task.id)
  );
  const existingIds = new Set(
    existing
      .map((row) => row?.metadata?.resolution_task_id)
      .filter(Boolean)
  );

  const payload = unlocked
    .filter((task) => !existingIds.has(task.id))
    .map((task) => ({
      user_id: user.id,
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
  const created = await Task.createMany(payload);
  await ruleStateService.refreshUserState(user.id);
  for (const task of created) {
    if (!task.start_time) continue;
    const reminderTime = new Date(task.start_time);
    reminderTime.setMinutes(reminderTime.getMinutes() - 30);
    await QueueService.scheduleTaskReminders(user, task);
  }
}

async function insertResolutionIntoScheduleIntel(user, items, planId, goalText) {
  if (!items?.length) return;
  const existingRows = await scheduleService.listExtractionRows(user.id);
  const existingResolutionTaskIds = new Set(
    existingRows
      .map((row) => row?.metadata?.resolution_task_id)
      .filter(Boolean)
      .map((value) => String(value))
  );
  const seen = new Set();

  const payloads = items
    .filter((item) => !item.locked)
    .filter((item) => item.start_time && item.estimated_duration_minutes)
    .filter((item) => !existingResolutionTaskIds.has(String(item.id)))
    .map((item) => {
      const date = new Date(`${item.date}T00:00:00`);
      const dayOfWeek = date.getDay();
      const start = item.start_time;
      const [hh, mm, ss] = start.split(':').map((value) => Number(value));
      const startDate = new Date(date);
      startDate.setHours(hh || 0, mm || 0, ss || 0, 0);
      const endDate = new Date(startDate.getTime() + item.estimated_duration_minutes * 60000);
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;

      const payload = {
        title: item.title,
        day_of_week: dayOfWeek,
        start_time: start,
        end_time: endTime,
        category: 'Resolution',
        metadata: {
          source: 'resolution_builder',
          resolution_plan_id: planId,
          resolution_goal: goalText,
          resolution_task_id: item.id
        }
      };

      const key = [
        payload.day_of_week,
        payload.start_time,
        payload.end_time,
        payload.title.toLowerCase(),
        payload.category.toLowerCase(),
        payload.metadata.resolution_task_id
      ].join('|');
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      return payload;
    });

  for (const entry of payloads.filter(Boolean)) {
    await scheduleService.createManualExtractionRow(user.id, entry);
  }
}

class ResolutionBuilderFlow {
  constructor(user, sessionRecord) {
    this.user = user;
    this.sessionRecord = sessionRecord;
    const baseState = {
      step: 1,
      resolution_goal: '',
      resolution_type: 'skill_based',
      clarify_step: null,
      skill_level: null,
      days_per_week: null,
      session_minutes: null,
      constraints: '',
      project_deliverable: '',
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
    const stored = sessionRecord?.state_json && Object.keys(sessionRecord.state_json).length
      ? sessionRecord.state_json
      : {};
    this.state = { ...baseState, ...stored };
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
    this.state.resolution_type = classifyResolution(input);
    this.state.clarify_step = null;
    this.state.step = 2;
    await this.saveState();
    return {
      reply: 'How long do you want to complete this goal? (e.g., 4 weeks, 8 weeks, or 2026-03-01)',
      state: this.publicState()
    };
  }

  async captureOutcome(input) {
    if (!input) {
      return { reply: 'Give me a short success definition so the roadmap stays aligned.', state: this.publicState() };
    }
    const type = normalizeResolutionType(this.state.resolution_type);

    if (type === 'skill_based') {
      if (this.state.clarify_step === 'outcome') {
        this.state.target_outcome = input;
        this.state.clarify_step = 'skill_level';
        await this.saveState();
        return { reply: 'What is your current level? (beginner, intermediate, advanced)', state: this.publicState() };
      }
      this.state.skill_level = normalize(input);
      this.state.step = 4;
      this.state.time_step = 'hours';
      this.state.clarify_step = null;
      await this.saveState();
      return {
        reply: 'Time reality check: how many hours per week can you realistically commit?',
        state: this.publicState()
      };
    }

    if (type === 'habit_based') {
      const days = parseDaysPerWeek(input);
      const minutes = parseSessionMinutes(input);
      if (!days || !minutes) {
        return {
          reply: 'Share days per week and minutes per session. Example: 4 days/week, 20 minutes.',
          state: this.publicState()
        };
      }
      this.state.days_per_week = days;
      this.state.session_minutes = minutes;
      this.state.step = 4;
      this.state.time_step = 'days';
      await this.saveState();
      return {
        reply: 'Which days are best for this routine? (e.g., Mon Wed Sat)',
        state: this.publicState()
      };
    }

    if (type === 'outcome_based') {
      this.state.project_deliverable = input;
      this.state.target_outcome = input;
      this.state.step = 4;
      this.state.time_step = 'hours';
      await this.saveState();
      return {
        reply: 'Time reality check: how many hours per week can you commit?',
        state: this.publicState()
      };
    }

    if (type === 'hybrid') {
      this.state.target_outcome = input;
      this.state.step = 4;
      this.state.time_step = 'hours';
      await this.saveState();
      return {
        reply: 'How many hours per week and which days? Example: 5 hours, Mon Wed Sat.',
        state: this.publicState()
      };
    }

    this.state.target_outcome = input;
    this.state.step = 4;
    this.state.time_step = 'hours';
    await this.saveState();
    return {
      reply: 'Time reality check: how many hours per week can you commit?',
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
    this.state.step = 3;
    this.state.time_step = 'hours';
    this.state.clarify_step = 'outcome';
    await this.saveState();
    return {
      reply: buildOutcomePrompt(normalizeResolutionType(this.state.resolution_type)),
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
      if (!this.state.days_per_week) {
        this.state.days_per_week = days.length;
      }
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
      this.user,
      this.state.resolution_type,
      this.state.skill_level,
      this.state.days_per_week,
      this.state.session_minutes
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
      const flat = (this.state.roadmap?.phases || []).flatMap((phase) => phase.resources || []);
      const seen = new Set();
      this.state.resources = flat.filter((res) => {
        if (!res?.url) return false;
        if (seen.has(res.url)) return false;
        seen.add(res.url);
        return true;
      }).slice(0, 8);
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
      reply: `${resourcesText}Schedule preview (not yet added):\n${scheduleText}\n\nWant me to add this plan to your schedule? You can say "add it", "change times", or "not now".`,
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

    return { reply: 'Want me to add it, change times, or skip for now?', state: this.publicState() };
  }

  async handoffToExecution() {
    if (!this.state.duration_weeks) {
      return { reply: 'Duration is missing. Share it to continue.', state: this.publicState() };
    }
    const roadmap = this.state.roadmap;
    if (!roadmap?.phases?.length) {
      return { reply: 'Roadmap missing. Restart the builder to try again.', state: this.publicState() };
    }

    const roadmapRecord = await ResolutionRoadmap.create({
      user_id: this.user.id,
      goal_text: this.state.resolution_goal,
      resolution_type: this.state.resolution_type,
      duration_weeks: this.state.duration_weeks
    });

    const plan = await ResolutionPlan.create({
      user_id: this.user.id,
      title: roadmap.title,
      goal_text: this.state.resolution_goal,
      resolution_type: this.state.resolution_type,
      target_outcome: this.state.target_outcome,
      duration_weeks: this.state.duration_weeks,
      end_date: this.state.end_date,
      active_phase_index: 1,
      phase_unlock_mode: 'gated',
      availability_json: {
        hours_per_week: this.state.time_commitment_hours,
        days_free: this.state.days_free,
        preferred_blocks: this.state.preferred_blocks,
        pace: this.state.pace,
        days_per_week: this.state.days_per_week,
        session_minutes: this.state.session_minutes
      },
      preferences_json: {
        skill_level: this.state.skill_level,
        project_deliverable: this.state.project_deliverable,
        constraints: this.state.constraints
      },
      status: 'active',
      roadmap_json: roadmap
    });

    const phasesPayload = roadmap.phases.map((phase) => ({
      roadmap_id: roadmapRecord.id,
      plan_id: plan.id,
      phase_index: phase.phase_index,
      title: phase.title,
      description: phase.description,
      phase_objective: phase.phase_objective || null,
      completion_criteria_json: phase.completion_criteria || { type: 'threshold', threshold: 0.8 },
      what_to_learn_json: phase.what_to_learn || [],
      what_to_build_json: phase.what_to_build || [],
      objectives_json: phase.objectives || [],
      topics_json: phase.topics || [],
      resources_json: phase.resources || [],
      completion_status: 'pending'
    }));

    const phases = await ResolutionPhase.createMany(phasesPayload);
    await ResolutionProgress.createMany(
      phases.map((phase) => ({
        phase_id: phase.id,
        status: 'pending'
      }))
    );

    const resourcePayload = phases.flatMap((phase, index) => {
      const resources = roadmap.phases[index]?.resources || [];
      return resources.map((resource) => ({
        phase_id: phase.id,
        title: resource.title,
        url: resource.url,
        type: resource.type || resource.kind || null
      }));
    });
    await ResolutionResource.createMany(resourcePayload);
    const tasks = generateResolutionTasks({
      user: this.user,
      planId: plan.id,
      phases,
      durationWeeks: this.state.duration_weeks,
      daysFree: this.state.days_free,
      preferredBlocks: this.state.preferred_blocks,
      hoursPerWeek: this.state.time_commitment_hours,
      pace: this.state.pace,
      daysPerWeek: this.state.days_per_week,
      sessionMinutes: this.state.session_minutes
    });

    const createdTasks = await ResolutionTask.createMany(tasks);
    await ResolutionDailyItem.createMany(createdTasks);
    await mirrorTasksToExecution(createdTasks, this.user);
    await insertResolutionIntoScheduleIntel(this.user, createdTasks, plan.id, this.state.resolution_goal);

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
      return this.captureDuration(trimmed);
    }
    if (this.state.step === 3) {
      return this.captureOutcome(trimmed);
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
  return ResolutionBuilderSession.create(user.id, {});
}

async function startSession(user) {
  const sessionRecord = await getOrCreateSession(user);
  const flow = new ResolutionBuilderFlow(user, sessionRecord);
  const response = await flow.start();
  await flow.saveState();
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
