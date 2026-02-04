const { DateTime } = require('luxon');
const ResolutionPlan = require('../models/ResolutionPlan');
const ResolutionPhase = require('../models/ResolutionPhase');
const ResolutionTask = require('../models/ResolutionTask');
const ResolutionDailyItem = require('../models/ResolutionDailyItem');
const Task = require('../models/Task');
const ruleStateService = require('./ruleState');
const supabase = require('../config/supabase');
const ResolutionRoadmap = require('../models/ResolutionRoadmap');
const ResolutionResource = require('../models/ResolutionResource');
const ResolutionProgress = require('../models/ResolutionProgress');
const QueueService = require('./queue');
const scheduleService = require('./scheduleService');

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

function groupTasksByDate(tasks) {
  return tasks.reduce((acc, task) => {
    const key = task.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});
}

async function getActivePlanWithDetails(userId) {
  const plan = await ResolutionPlan.getActiveByUser(userId);
  if (!plan) return null;
  const [phases, tasks] = await Promise.all([
    ResolutionPhase.listByPlan(plan.id),
    ResolutionTask.listByPlan(plan.id)
  ]);
  return { plan, phases, tasks };
}

async function getPlanDetails(planId, userId) {
  const plan = await ResolutionPlan.getById(planId);
  if (!plan || plan.user_id !== userId) {
    const error = new Error('Resolution plan not found');
    error.status = 404;
    throw error;
  }
  const [phases, tasks] = await Promise.all([
    ResolutionPhase.listByPlan(plan.id),
    ResolutionTask.listByPlan(plan.id)
  ]);
  return { plan, phases, tasks };
}

async function listTasksForPlan(planId, userId, startDate, endDate) {
  const plan = await ResolutionPlan.getById(planId);
  if (!plan || plan.user_id !== userId) {
    const error = new Error('Resolution plan not found');
    error.status = 404;
    throw error;
  }
  const tasks = await ResolutionTask.listByPlanInRange(planId, startDate, endDate);
  return { plan, tasks, grouped: groupTasksByDate(tasks) };
}

async function listTasksForUser(userId, startDate, endDate) {
  const tasks = await ResolutionTask.listByUserDateRange(userId, startDate, endDate);
  return { tasks, grouped: groupTasksByDate(tasks) };
}

async function mirrorUnlockedTasks(tasks, userId) {
  if (!tasks.length) return [];
  const planId = tasks[0].plan_id;
  const { data, error } = await supabase
    .from('tasks')
    .select('id, metadata')
    .eq('user_id', userId)
    .contains('metadata', { resolution_plan_id: planId });
  if (error) throw error;
  const existing = new Set(
    (data || [])
      .map((row) => row?.metadata?.resolution_task_id)
      .filter(Boolean)
  );

  const payload = tasks
    .filter((task) => !existing.has(task.id))
    .map((task) => ({
      user_id: userId,
      title: task.title,
      description: task.description,
      category: 'Resolution',
      start_time: task.start_time
        ? DateTime.fromISO(`${task.date}T${task.start_time}`).toUTC().toISO()
        : null,
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

  if (!payload.length) return [];
  const created = await Task.createMany(payload);
  await ruleStateService.refreshUserState(userId);
  for (const task of created) {
    if (!task.start_time) continue;
    // eslint-disable-next-line no-await-in-loop
    await QueueService.scheduleTaskReminders({ id: userId }, task);
  }
  return created;
}

async function insertResolutionTasksIntoScheduleIntel(userId, tasks) {
  if (!tasks?.length) return [];
  const existingRows = await scheduleService.listExtractionRows(userId);
  const existingResolutionTaskIds = new Set(
    existingRows
      .map((row) => row?.metadata?.resolution_task_id)
      .filter(Boolean)
      .map((value) => String(value))
  );
  const seen = new Set();
  const payloads = tasks
    .filter((task) => task.start_time && task.estimated_duration_minutes)
    .filter((task) => !existingResolutionTaskIds.has(String(task.id)))
    .map((task) => {
      const date = new Date(`${task.date}T00:00:00`);
      const dayOfWeek = date.getDay();
      const start = task.start_time;
      const [hh, mm, ss] = start.split(':').map((value) => Number(value));
      const startDate = new Date(date);
      startDate.setHours(hh || 0, mm || 0, ss || 0, 0);
      const endDate = new Date(startDate.getTime() + task.estimated_duration_minutes * 60000);
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;

      const payload = {
        title: task.title,
        day_of_week: dayOfWeek,
        start_time: start,
        end_time: endTime,
        category: 'Resolution',
        metadata: {
          source: 'resolution_builder',
          resolution_plan_id: task.plan_id,
          resolution_task_id: task.id
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
      if (seen.has(key)) return null;
      seen.add(key);
      return payload;
    })
    .filter(Boolean);

  for (const entry of payloads) {
    // eslint-disable-next-line no-await-in-loop
    await scheduleService.createManualExtractionRow(userId, entry);
  }
  return payloads;
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

function allocatePhaseWeeks(durationWeeks, phaseCount) {
  const totalWeeks = Math.max(1, durationWeeks || phaseCount || 1);
  const count = Math.max(1, phaseCount || 1);
  const base = Math.max(1, Math.floor(totalWeeks / count));
  let remainder = Math.max(0, totalWeeks - base * count);
  return Array.from({ length: count }).map(() => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

function buildPhaseSessionsFromRecord(phase) {
  const topics = Array.isArray(phase?.topics_json) ? phase.topics_json : [];
  const topicTitles = topics.map((topic) => topic?.title).filter(Boolean);
  const learningOutcomes = Array.isArray(phase?.what_to_learn_json) ? phase.what_to_learn_json : [];
  const deliverables = Array.isArray(phase?.what_to_build_json) ? phase.what_to_build_json : [];
  const baseObjective = phase?.phase_objective || phase?.description || '';
  const items = (topicTitles.length ? topicTitles : learningOutcomes).slice(0, 6);
  if (!items.length && phase?.title) {
    items.push(phase.title);
  }
  return items.map((item, idx) => ({
    title: `${phase.title}: ${item}`,
    objective: baseObjective || `Make progress on ${item}.`,
    deliverable: deliverables[idx] || deliverables[0] || '',
    topic: item
  }));
}

function getDateForWeekDay(baseDate, dayOfWeek, weekOffset = 0) {
  const start = baseDate.plus({ weeks: weekOffset }).startOf('week');
  const targetWeekday = dayOfWeek === 0 ? 7 : dayOfWeek;
  return start.set({ weekday: targetWeekday });
}

function buildSlotList({ baseDate, daysFree, blocks, sessionsPerWeek, phaseWeeks }) {
  const slots = [];
  for (let week = 0; week < phaseWeeks; week += 1) {
    const selectedDays = daysFree.slice(0, sessionsPerWeek);
    selectedDays.forEach((day, dayIndex) => {
      const block = blocks[(dayIndex + week) % blocks.length];
      const date = getDateForWeekDay(baseDate, day.dayOfWeek, week);
      slots.push({ date, day, block });
    });
  }
  return slots;
}

async function schedulePhaseTasks({ plan, phase, phases, user }) {
  if (!plan || !phase || !user) return [];
  const availability = plan.availability_json || {};
  const daysFree = Array.isArray(availability.days_free) ? availability.days_free : [];
  const preferredBlocks = Array.isArray(availability.preferred_blocks) ? availability.preferred_blocks : [];
  if (!daysFree.length) return [];

  const phaseCount = phases.length || 1;
  const phaseWeeksAllocation = allocatePhaseWeeks(plan.duration_weeks || phaseCount, phaseCount);
  const phaseWeeks = phaseWeeksAllocation[phase.phase_index] || 1;
  const blocks = preferredBlocks.length ? preferredBlocks : [{ label: 'Evening', time: { hour: 19, minute: 0 } }];
  const sessionsPerWeek = resolveSessionsPerWeek(
    availability.hours_per_week,
    daysFree.length,
    availability.pace || 'standard',
    availability.days_per_week
  );
  const totalSessions = Math.max(1, phaseWeeks * sessionsPerWeek);
  const baseDate = DateTime.now().setZone(user.timezone || 'UTC');
  const slotList = buildSlotList({
    baseDate,
    daysFree,
    blocks,
    sessionsPerWeek,
    phaseWeeks
  });
  const sessions = buildPhaseSessionsFromRecord(phase);
  const resources = Array.isArray(phase.resources_json) ? phase.resources_json : [];
  const estimatedMinutes = availability.session_minutes || Math.max(30, Math.round((availability.hours_per_week || 2) * 30));

  const taskPayload = [];
  for (let i = 0; i < totalSessions; i += 1) {
    const slot = slotList[i];
    if (!slot) break;
    const session = sessions[i % sessions.length] || { title: phase.title, objective: phase.phase_objective, deliverable: '' };
    const objective = session.objective || phase.phase_objective || `Advance ${phase.title}`;
    const deliverable = session.deliverable || '';
    const resourceTitles = resources.slice(0, 2).map((res) => res.title).filter(Boolean);
    const description = [
      session.topic ? `Focus: ${session.topic}.` : '',
      deliverable ? `Deliverable: ${deliverable}.` : '',
      resourceTitles.length ? `Resources: ${resourceTitles.join('; ')}` : ''
    ].filter(Boolean).join(' ');

    taskPayload.push({
      user_id: user.id,
      plan_id: plan.id,
      phase_id: phase.id,
      date: slot.date.toISODate(),
      start_time: slot.block.time ? `${String(slot.block.time.hour).padStart(2, '0')}:${String(slot.block.time.minute).padStart(2, '0')}:00` : null,
      title: session.title || phase.title,
      objective,
      description,
      resources_json: resources,
      estimated_duration_minutes: estimatedMinutes,
      topic_key: session.topic ? session.topic.toLowerCase().replace(/[^a-z0-9]+/g, '_') : phase.title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      topic_id: session.topic ? session.topic.toLowerCase().replace(/[^a-z0-9]+/g, '_') : phase.title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      status: 'todo',
      order_index: i,
      locked: false
    });
  }

  if (!taskPayload.length) return [];
  const createdTasks = await ResolutionTask.createMany(taskPayload);
  await ResolutionDailyItem.createMany(createdTasks);
  await mirrorUnlockedTasks(createdTasks, user.id);
  await insertResolutionTasksIntoScheduleIntel(user.id, createdTasks);
  return createdTasks;
}

async function scheduleActivePhase(plan, phases, user) {
  if (!plan || !phases?.length || !user) return [];
  const activeIndex = Math.max(1, plan.active_phase_index || 1);
  const phase = phases.find((item) => item.phase_index + 1 === activeIndex);
  if (!phase) return [];
  const existing = await ResolutionTask.listByPhase(phase.id);
  if (existing.length) {
    const unlocked = await ResolutionTask.unlockPhaseTasks(phase.id);
    await ResolutionDailyItem.unlockPhaseItems(phase.id);
    await mirrorUnlockedTasks(unlocked, user.id);
    await insertResolutionTasksIntoScheduleIntel(user.id, unlocked);
    return unlocked;
  }
  return schedulePhaseTasks({ plan, phase, phases, user });
}

async function unlockNextPhase(plan, phases, currentPhase, user) {
  const nextPhase = await ResolutionPhase.getNextPhase(currentPhase.plan_id, currentPhase.phase_index);
  if (!nextPhase) {
    await ResolutionPlan.update(plan.id, { status: 'completed' });
    return { nextPhase: null, unlockedTasks: [] };
  }

  const existing = await ResolutionTask.listByPhase(nextPhase.id);
  let unlockedTasks = [];
  if (existing.length) {
    unlockedTasks = await ResolutionTask.unlockPhaseTasks(nextPhase.id);
    await ResolutionDailyItem.unlockPhaseItems(nextPhase.id);
    await mirrorUnlockedTasks(unlockedTasks, user.id);
    await insertResolutionTasksIntoScheduleIntel(user.id, unlockedTasks);
  } else {
    unlockedTasks = await schedulePhaseTasks({ plan, phase: nextPhase, phases, user });
  }
  await ResolutionPlan.update(plan.id, { active_phase_index: nextPhase.phase_index + 1 });
  return { nextPhase, unlockedTasks };
}

async function completeResolutionTask(taskId, userId) {
  const task = await ResolutionTask.getById(taskId);
  if (!task || task.user_id !== userId) {
    const error = new Error('Resolution task not found');
    error.status = 404;
    throw error;
  }

  const updatedTask = await ResolutionTask.updateStatus(task.id, 'done');

  if (!task.phase_id) {
    return { task: updatedTask, phase: null };
  }

  const phase = await ResolutionPhase.getById(task.phase_id);
  if (!phase) {
    return { task: updatedTask, phase: null };
  }

  const totalCount = await ResolutionTask.countByPhase(phase.id);
  const doneCount = await ResolutionTask.countByPhase(phase.id, 'done');
  const criteriaType = phase.completion_criteria_json?.type || 'threshold';
  const threshold = phase.completion_criteria_json?.threshold || 0.8;
  const ratio = totalCount ? doneCount / totalCount : 0;

  if (phase.completion_status === 'completed') {
    return { task: updatedTask, phase, completion_ready: false };
  }

  if (criteriaType === 'threshold' && ratio >= threshold) {
    const updatedPhase = await ResolutionPhase.updateStatus(phase.id, 'ready');
    return {
      task: updatedTask,
      phase: updatedPhase,
      completion_ready: true,
      completion_ratio: ratio,
      requires_confirmation: true
    };
  }

  return { task: updatedTask, phase, completion_ready: false, completion_ratio: ratio };
}

async function confirmPhaseCompletion(phaseId, userId) {
  const phase = await ResolutionPhase.getById(phaseId);
  if (!phase) {
    const error = new Error('Resolution phase not found');
    error.status = 404;
    throw error;
  }
  const plan = await ResolutionPlan.getById(phase.plan_id);
  if (!plan || plan.user_id !== userId) {
    const error = new Error('Resolution plan not found');
    error.status = 404;
    throw error;
  }

  const updatedPhase = await ResolutionPhase.updateStatus(phase.id, 'completed');
  const phases = await ResolutionPhase.listByPlan(plan.id);
  const { nextPhase, unlockedTasks } = await unlockNextPhase(plan, phases, phase, {
    id: userId,
    timezone: plan?.timezone || 'UTC'
  });

  return { phase: updatedPhase, nextPhase, unlockedTasks };
}

async function uploadPlanAsset({ planId, userId, kind, dataUrl, filename }) {
  const plan = await ResolutionPlan.getById(planId);
  if (!plan || plan.user_id !== userId) {
    const error = new Error('Resolution plan not found');
    error.status = 404;
    throw error;
  }

  if (!dataUrl || typeof dataUrl !== 'string') {
    const error = new Error('Invalid asset payload');
    error.status = 400;
    throw error;
  }

  let contentType = 'application/octet-stream';
  let buffer = null;
  const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (base64Match) {
    contentType = base64Match[1];
    buffer = Buffer.from(base64Match[2], 'base64');
  } else {
    const rawMatch = dataUrl.match(/^data:([^,]+),(.*)$/);
    if (!rawMatch) {
      const error = new Error('Invalid asset payload');
      error.status = 400;
      throw error;
    }
    contentType = rawMatch[1];
    buffer = Buffer.from(decodeURIComponent(rawMatch[2]), 'utf8');
  }
  const safeKind = kind || 'asset';
  const ext = filename ? filename.split('.').pop() : contentType.split('/')[1] || 'bin';
  const path = `resolution-plans/${planId}/${safeKind}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true
  });
  if (error) throw error;

  const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = publicData?.publicUrl || null;

  const updatePayload = {};
  if (safeKind === 'svg') updatePayload.svg_url = publicUrl;
  if (safeKind === 'png' || safeKind === 'jpg' || safeKind === 'jpeg') updatePayload.png_url = publicUrl;
  if (safeKind === 'pdf') updatePayload.pdf_url = publicUrl;

  if (Object.keys(updatePayload).length) {
    await ResolutionPlan.update(planId, updatePayload);
  }

  return { url: publicUrl };
}

module.exports = {
  getActivePlanWithDetails,
  getPlanDetails,
  listTasksForPlan,
  listTasksForUser,
  completeResolutionTask,
  confirmPhaseCompletion,
  uploadPlanAsset,
  scheduleActivePhase,
  unlockNextPhase,
  scheduleActivePhase,
  unlockNextPhase,
  async listRoadmaps(userId) {
    return ResolutionRoadmap.listByUser(userId);
  },
  async getRoadmapDetails(roadmapId, userId) {
    const roadmap = await ResolutionRoadmap.getById(roadmapId);
    if (!roadmap || roadmap.user_id !== userId) {
      const error = new Error('Roadmap not found');
      error.status = 404;
      throw error;
    }
    const phases = await ResolutionPhase.listByRoadmap(roadmapId);
    const phasesWithResources = await Promise.all(
      phases.map(async (phase) => ({
        ...phase,
        resources: await ResolutionResource.listByPhase(phase.id)
      }))
    );
    const planId = phasesWithResources[0]?.plan_id || null;
    const plan = planId ? await ResolutionPlan.getById(planId) : null;
    return { roadmap, phases: phasesWithResources, plan_id: planId, plan };
  },
  async markPhaseComplete(phaseId, userId) {
    const phase = await ResolutionPhase.getById(phaseId);
    if (!phase) {
      const error = new Error('Phase not found');
      error.status = 404;
      throw error;
    }
    const roadmap = await ResolutionRoadmap.getById(phase.roadmap_id);
    if (!roadmap || roadmap.user_id !== userId) {
      const error = new Error('Roadmap not found');
      error.status = 404;
      throw error;
    }
    await ResolutionPhase.updateStatus(phase.id, 'completed');
    await ResolutionProgress.updateStatus(phase.id, 'completed');
    const plan = await ResolutionPlan.getById(phase.plan_id);
    const phases = await ResolutionPhase.listByPlan(phase.plan_id);
    const { nextPhase, unlockedTasks } = await unlockNextPhase(plan, phases, phase, {
      id: userId,
      timezone: plan?.timezone || 'UTC'
    });
    return { status: 'ok', nextPhase, unlockedDailyCount: unlockedTasks.length, unlockedTaskCount: unlockedTasks.length };
  }
};
