const express = require('express');
const jwt = require('jsonwebtoken');
const adminAuth = require('../middleware/adminAuth');
const supabase = require('../config/supabase');
const { DateTime } = require('luxon');

const router = express.Router();

const SCORE_KEYS = [
  'tone_score',
  'specificity_score',
  'realism_score',
  'goal_alignment_score',
  'resolution_alignment_score'
];

const FEEDBACK_SCORE_TYPES = new Set([
  'tone_score',
  'specificity_score',
  'realism_score',
  'goal_alignment_score',
  'resolution_alignment_score'
]);

const rangeToStart = (range) => {
  if (range === '7d') {
    return DateTime.now().minus({ days: 7 });
  }
  return DateTime.now().minus({ hours: 24 });
};

const computeAverages = (rows) => {
  const totals = {};
  SCORE_KEYS.forEach((key) => {
    totals[key] = 0;
  });
  const count = rows.length || 1;
  rows.forEach((row) => {
    SCORE_KEYS.forEach((key) => {
      totals[key] += Number(row[key]) || 0;
    });
  });
  const averages = {};
  SCORE_KEYS.forEach((key) => {
    averages[key] = Number((totals[key] / count).toFixed(3));
  });
  return averages;
};

const computeFailRate = (rows, threshold) => {
  if (!rows.length) return 0;
  const fails = rows.filter((row) =>
    SCORE_KEYS.some((key) => Number(row[key] || 0) < threshold)
  ).length;
  return Number(((fails / rows.length) * 100).toFixed(2));
};

router.post('/login', async (req, res) => {
  const passcode = req.body?.passcode;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return res.status(401).json({ error: 'Invalid passcode.' });
  }
  const token = jwt.sign(
    { admin: true, issued_at: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  return res.json({ token });
});

router.get('/opik/summary', adminAuth, async (req, res) => {
  try {
    const range = req.query.range === '7d' ? '7d' : '24h';
    const start = rangeToStart(range).toUTC().toISO();
    const threshold = Number(process.env.OPIK_FAIL_THRESHOLD || 3.5);

    const { data: rows, error } = await supabase
      .from('opik_trace_mirror')
      .select('*')
      .gte('logged_at', start)
      .order('logged_at', { ascending: false });
    if (error) throw error;

    const averages = computeAverages(rows || []);
    const failRate = computeFailRate(rows || [], threshold);
    const totalTraces = rows?.length || 0;

    let feedbackSummary = { count: 0, averages: {} };
    try {
      const { data: feedbackRows } = await supabase
        .from('opik_human_feedback')
        .select('score_type, score_value')
        .gte('created_at', start);
      if (feedbackRows?.length) {
        const totals = {};
        const counts = {};
        feedbackRows.forEach((row) => {
          const type = row.score_type;
          if (!type) return;
          totals[type] = (totals[type] || 0) + Number(row.score_value || 0);
          counts[type] = (counts[type] || 0) + 1;
        });
        const averages = {};
        Object.keys(totals).forEach((key) => {
          averages[key] = Number((totals[key] / (counts[key] || 1)).toFixed(3));
        });
        feedbackSummary = { count: feedbackRows.length, averages };
      }
    } catch (err) {
      console.warn('[Admin] feedback summary load failed:', err?.message || err);
    }

    const best = Object.entries(averages).sort((a, b) => b[1] - a[1])[0];
    const worst = Object.entries(averages).sort((a, b) => a[1] - b[1])[0];

    res.json({
      range,
      totalTraces,
      failRate,
      averages,
      bestDimension: best ? { metric: best[0], score: best[1] } : null,
      worstDimension: worst ? { metric: worst[0], score: worst[1] } : null,
      activeExperiment: rows?.[0]?.experiment_id || null,
      feedbackSummary
    });
  } catch (error) {
    console.error('[Admin] summary error:', error.message);
    res.status(500).json({ message: 'Failed to load summary.' });
  }
});

router.get('/opik/traces', adminAuth, async (req, res) => {
  try {
    const { message_type, agent_version, prompt_version, experiment_id } = req.query;
    let query = supabase
      .from('opik_trace_mirror')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(200);

    if (message_type) query = query.eq('message_type', message_type);
    if (agent_version) query = query.eq('agent_version', agent_version);
    if (prompt_version) query = query.eq('prompt_version', prompt_version);
    if (experiment_id) query = query.eq('experiment_id', experiment_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ traces: data || [] });
  } catch (error) {
    console.error('[Admin] traces error:', error.message);
    res.status(500).json({ message: 'Failed to load traces.' });
  }
});

router.get('/opik/signals', adminAuth, async (req, res) => {
  try {
    const range = req.query.range === '7d' ? '7d' : '24h';
    const start = rangeToStart(range).toUTC().toISO();
    const { data: rows, error } = await supabase
      .from('opik_trace_mirror')
      .select('*')
      .gte('logged_at', start)
      .order('logged_at', { ascending: true });
    if (error) throw error;

    const signals = [];
    if (!rows?.length) {
      return res.json({ signals: ['No recent Opik traces to summarize yet.'] });
    }

    const averages = computeAverages(rows);
    if (averages.specificity_score < 3.2) {
      signals.push('Specificity is trending low. Consider adding more concrete steps in reminders.');
    }
    if (averages.goal_alignment_score > 4 && averages.realism_score < 3.2) {
      signals.push('Goal alignment is high but realism is low — tasks may be too ambitious.');
    }
    if (averages.resolution_alignment_score && averages.resolution_alignment_score < 3.2) {
      signals.push('Resolution alignment is trending low — tighten phase objectives or deliverables.');
    }

    const byHour = rows.reduce((acc, row) => {
      const hour = DateTime.fromISO(row.logged_at).hour;
      acc[hour] = acc[hour] || [];
      acc[hour].push(row);
      return acc;
    }, {});
    const morning = Object.keys(byHour)
      .filter((h) => Number(h) < 12)
      .flatMap((h) => byHour[h]);
    const afternoon = Object.keys(byHour)
      .filter((h) => Number(h) >= 12)
      .flatMap((h) => byHour[h]);
    if (morning.length && afternoon.length) {
      const morningAvg = computeAverages(morning);
      const afternoonAvg = computeAverages(afternoon);
      if (afternoonAvg.tone_score < morningAvg.tone_score - 0.4) {
        signals.push('Tone dips after midday — reminders may be sounding harsher later in the day.');
      }
    }

    const reminderRows = rows.filter((row) => row.message_type === 'reminder');
    if (reminderRows.length) {
      const reminderAvg = computeAverages(reminderRows);
      if (reminderAvg.goal_alignment_score < averages.goal_alignment_score - 0.3) {
        signals.push('Reminder follow-through may drop when goal alignment dips â€” tweak reminder prompts.');
      }
    }

    res.json({ signals: signals.slice(0, 6) });
  } catch (error) {
    console.error('[Admin] signals error:', error.message);
    res.status(500).json({ message: 'Failed to load signals.' });
  }
});


router.post('/opik/feedback', adminAuth, async (req, res) => {
  try {
    const { trace_id, user_id, message_type, score_type, score_value, comment, source } = req.body || {};
    if (!score_type || !FEEDBACK_SCORE_TYPES.has(score_type)) {
      return res.status(400).json({ message: 'Invalid score_type.' });
    }
    const value = Number(score_value);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return res.status(400).json({ message: 'score_value must be between 1 and 5.' });
    }
    const payload = {
      trace_id: trace_id || null,
      user_id: user_id || null,
      message_type: message_type || null,
      score_type,
      score_value: value,
      comment: comment || null,
      source: source || 'admin'
    };
    const { data, error } = await supabase
      .from('opik_human_feedback')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    res.json({ feedback: data });
  } catch (error) {
    console.error('[Admin] feedback error:', error.message);
    res.status(500).json({ message: 'Failed to save feedback.' });
  }
});

router.get('/opik/feedback', adminAuth, async (req, res) => {
  try {
    const range = req.query.range === '7d' ? '7d' : '24h';
    const start = rangeToStart(range).toUTC().toISO();
    const traceId = req.query.trace_id;
    let query = supabase
      .from('opik_human_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (traceId) {
      query = query.eq('trace_id', traceId);
    } else {
      query = query.gte('created_at', start);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ feedback: data || [] });
  } catch (error) {
    console.error('[Admin] feedback fetch error:', error.message);
    res.status(500).json({ message: 'Failed to load feedback.' });
  }
});

router.get('/opik/feedback/summary', adminAuth, async (req, res) => {
  try {
    const range = req.query.range === '7d' ? '7d' : '24h';
    const start = rangeToStart(range).toUTC().toISO();
    const { data: rows, error } = await supabase
      .from('opik_human_feedback')
      .select('score_type, score_value')
      .gte('created_at', start);
    if (error) throw error;
    const totals = {};
    const counts = {};
    rows?.forEach((row) => {
      const key = row.score_type;
      totals[key] = (totals[key] || 0) + Number(row.score_value || 0);
      counts[key] = (counts[key] || 0) + 1;
    });
    const averages = {};
    Object.keys(totals).forEach((key) => {
      averages[key] = Number((totals[key] / (counts[key] || 1)).toFixed(3));
    });
    res.json({ count: rows?.length || 0, averages });
  } catch (error) {
    console.error('[Admin] feedback summary error:', error.message);
    res.status(500).json({ message: 'Failed to load feedback summary.' });
  }
});
module.exports = router;

