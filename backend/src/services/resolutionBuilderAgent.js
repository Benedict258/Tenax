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

const YES_TRIGGERS = ['yes', 'yep', 'sure', 'ok', 'okay', 'approve', 'approved', 'go ahead', 'do it'];
const NO_TRIGGERS = ['no', 'nope', 'cancel', 'stop', 'not now'];
const EDIT_TRIGGERS = ['edit', 'change', 'adjust', 'partial'];
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
  const phases = [
    {
      phase_index: 0,
      title: 'Orientation + Fundamentals',
      description: 'Clarify scope, set tooling, and cover the essentials.',
      objectives: ['Understand key terminology', 'Set up the environment', 'Complete quick exercises'],
      topics: [{ title: 'Core basics', subtopics: ['Key terms', 'Setup', 'First reps'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    },
    {
      phase_index: 1,
      title: 'Core Concepts',
      description: 'Build the backbone knowledge required for progress.',
      objectives: ['Cover the main concepts', 'Practice with small tasks'],
      topics: [{ title: 'Foundational concepts', subtopics: ['Concept A', 'Concept B'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    },
    {
      phase_index: 2,
      title: 'Guided Practice',
      description: 'Apply the concepts with structured practice sessions.',
      objectives: ['Practice consistently', 'Capture lessons learned'],
      topics: [{ title: 'Guided drills', subtopics: ['Exercises', 'Feedback'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    },
    {
      phase_index: 3,
      title: 'Applied Build',
      description: 'Turn learning into a concrete output or project.',
      objectives: ['Build something tangible', 'Document learnings'],
      topics: [{ title: 'Build milestone', subtopics: ['Prototype', 'Iteration'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    },
    {
      phase_index: 4,
      title: 'Review + Polish',
      description: 'Review, refine, and prepare for the next level.',
      objectives: ['Fix gaps', 'Ship final updates', 'Plan next steps'],
      topics: [{ title: 'Review checklist', subtopics: ['Polish', 'Reflection'], type: 'core' }],
      resources: [],
      completion_criteria: { type: 'threshold', threshold: 0.8 }
    }
  ];
  return { goal, duration_weeks: durationWeeks, title, phases };
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
              type: resource?.type || resource?.kind || 'resource'
            }))
            .filter((resource) => resource.title && resource.url)
        : [];
      const objectives = Array.isArray(phase?.objectives)
        ? phase.objectives
        : Array.isArray(phase?.learning_objectives)
        ? phase.learning_objectives
        : [];
      const topics = Array.isArray(phase?.topics)
        ? phase.topics
        : Array.isArray(phase?.topics_to_learn)
        ? phase.topics_to_learn.map((topic) =>
            typeof topic === 'string' ? { title: topic, type: 'core' } : topic
          )
        : [];

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
        phase_objective: typeof phase?.phase_objective === 'string' ? phase.phase_objective.trim() : '',
        what_to_learn: Array.isArray(phase?.what_to_learn)
          ? phase.what_to_learn.filter(Boolean)
          : Array.isArray(phase?.topics_to_learn)
          ? phase.topics_to_learn.filter(Boolean)
          : [],
        what_to_build: Array.isArray(phase?.what_to_build) ? phase.what_to_build.filter(Boolean) : [],
        objectives: objectives.filter(Boolean),
        topics,
        resources,
        duration_weeks: Number.isFinite(Number(phase?.duration_weeks)) ? Number(phase.duration_weeks) : null,
        completion_criteria: phase?.completion_criteria || { type: 'threshold', threshold: 0.8 }
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
    if (!base) break;
    expanded.push({
      ...base,
      title: `${base.title}: Deepen + apply`,
      description: base.description || 'Deepen and apply the core concepts.',
      objectives: base.objectives || [],
      topics: base.topics || []
    });
  }

  return expanded.slice(0, maxCount);
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
      if (!Array.isArray(phase.topics) || phase.topics.length < 3) return false;
      if (!Array.isArray(phase.resources) || phase.resources.length < 3) return false;
      if (!Array.isArray(phase.objectives) || phase.objectives.length < 2) return false;
      return true;
    });
  };
    const researchPack = await resourceRetriever.retrieveResearchPack(goal, normalizedType);
    const researchLines = researchPack.length
      ? researchPack.map((item, index) => `${index + 1}. ${item.title} - ${item.url}`).join('\n')
      : 'No external sources found.';

    const prompt = `You are Tenax Resolution Builder. Produce a high-quality, research-backed curriculum roadmap with strong structure and realistic sequencing.
  Goal: ${goal}
  Outcome definition: ${outcome || 'Not specified'}
  Resolution type: ${normalizedType}
  Skill level: ${skillLevel || 'unknown'}
  Duration: ${durationWeeks} weeks

  Research sources (use these to ground topics and resources):
  ${researchLines}
  
  Return JSON only with this shape:
{
  "roadmap_title": "...",
  "resolution_type": "${normalizedType}",
  "phases": [
    {
      "phase_index": 0,
      "phase_title": "...",
      "phase_description": "...",
      "learning_objectives": ["..."],
      "topics_to_learn": ["..."],
      "resources": [{"title":"...","type":"docs|video|course|article","link":"https://..."}],
      "completion_criteria": {"type":"manual_confirm","criteria":["..."]}
    }
  ]
  }
  
  Rules:
  - 5 to 8 phases (avoid generic 2-phase plans).
  - Each phase must be narrower and specific (no giant buckets like "Foundations + Practice").
  - Every phase must list 3-6 concrete topics and clear learning objectives.
  - Resources must be real URLs and should come from or align with the research sources above.
  - Avoid vague filler phrases. If you cannot specify what to learn, shrink scope instead.
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

    // Ensure each phase has resources with URLs (fetch if missing).
    for (const phase of sanitized.phases) {
      const resources = Array.isArray(phase.resources) ? phase.resources : [];
      const withLinks = resources.filter((res) => res?.title && res?.url);
      if (withLinks.length >= 3) {
        phase.resources = withLinks;
        continue;
      }
      const fetched = await resourceRetriever.retrieveResources(goal, phase.title, {
        forceRefresh: true,
        recencyHint: '2024 2025'
      });
      phase.resources = [...withLinks, ...fetched].slice(0, 6);
    }
    return sanitized;
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

  const sessionsPerWeek = resolveSessionsPerWeek(
    state.time_commitment_hours,
    days.length,
    state.pace,
    state.days_per_week
  );
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
    const topics = Array.isArray(phase.topics) ? phase.topics : [];
    const objectives = Array.isArray(phase.objectives) ? phase.objectives : [];
    const learnItems = Array.isArray(phase.what_to_learn) ? phase.what_to_learn : [];
    const buildItems = Array.isArray(phase.what_to_build) ? phase.what_to_build : [];
    for (let i = 0; i < sessions; i += 1) {
      const slot = slotList[slotIndex];
      if (!slot) break;
      const topic = topics[i % (topics.length || 1)] || { title: phase.title };
      const objective =
        objectives[i % (objectives.length || 1)] ||
        phase.phase_objective ||
        `Advance ${phase.title}`;
      const subtopics = topic.subtopics && topic.subtopics.length ? topic.subtopics : [];
      const learnLine = learnItems.length ? `Learn: ${learnItems.slice(0, 3).join(', ')}.` : '';
      const buildLine = buildItems.length ? `Build: ${buildItems.slice(0, 2).join(', ')}.` : '';
      const topicLine = subtopics.length
        ? `Focus on ${topic.title}. Cover: ${subtopics.join(', ')}.`
        : `Focus on ${topic.title || phase.title} and apply it with practice.`;
      const expectedLine = phase.phase_objective ? `Expected outcome: ${phase.phase_objective}.` : '';
      const description = [topicLine, learnLine, buildLine, expectedLine].filter(Boolean).join(' ');
      const resources = Array.isArray(phase.resources) ? phase.resources : [];
      const estimatedMinutes = sessionMinutes || Math.max(30, Math.round((hoursPerWeek || 2) * 30));

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
        estimated_duration_minutes: estimatedMinutes,
        topic_key: slugify(topic.title || phase.title || 'session'),
        topic_id: slugify(topic.title || phase.title || 'session'),
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
    await QueueService.scheduleTaskReminder(user, task, reminderTime.toISOString());
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
      what_to_learn_json: phase.what_to_learn || [],
      what_to_build_json: phase.what_to_build || [],
      objectives_json: phase.objectives || [],
      topics_json: phase.topics || [],
      resources_json: phase.resources || [],
      completion_status: 'pending',
      completion_criteria_json: phase.completion_criteria || { type: 'threshold', threshold: 0.8 }
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
