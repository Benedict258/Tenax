const { DateTime } = require('luxon');
const ResolutionPlan = require('../models/ResolutionPlan');
const ResolutionPhase = require('../models/ResolutionPhase');
const ResolutionTask = require('../models/ResolutionTask');
const Task = require('../models/Task');
const ruleStateService = require('./ruleState');
const supabase = require('../config/supabase');

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
  return created;
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
  const nextPhase = await ResolutionPhase.getNextPhase(phase.plan_id, phase.phase_index);

  let unlockedTasks = [];
  if (nextPhase) {
    unlockedTasks = await ResolutionTask.unlockPhaseTasks(nextPhase.id);
    await mirrorUnlockedTasks(unlockedTasks, userId);
  } else {
    await ResolutionPlan.update(plan.id, { status: 'completed' });
  }

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
  uploadPlanAsset
};
