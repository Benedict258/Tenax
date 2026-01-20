BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'p2' CHECK (severity IN ('p1','p2','p3')),
  ADD COLUMN IF NOT EXISTS p1_declared BOOLEAN GENERATED ALWAYS AS (severity = 'p1') STORED,
  ADD COLUMN IF NOT EXISTS p1_enforcement_state TEXT DEFAULT 'unacknowledged' CHECK (p1_enforcement_state IN ('unacknowledged','ack_requested','ack_received','snoozed','cleared')),
  ADD COLUMN IF NOT EXISTS p1_last_surface_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS p1_protected_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS p1_ack_via TEXT,
  ADD COLUMN IF NOT EXISTS p1_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_user_p1 ON tasks(user_id) WHERE severity = 'p1';

CREATE TABLE IF NOT EXISTS rule_enforcement_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  severity TEXT NOT NULL,
  surface_type TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL,
  outcome TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_events_user_time ON rule_enforcement_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_rule_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_p1_task_ids UUID[] DEFAULT '{}',
  last_global_surface_at TIMESTAMPTZ,
  pending_ack_count INT DEFAULT 0,
  blocked_action_count INT DEFAULT 0,
  last_state_hash TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW active_p1_tasks_v AS
SELECT
  t.*, 
  urs.pending_ack_count,
  urs.last_global_surface_at
FROM tasks t
LEFT JOIN user_rule_states urs ON urs.user_id = t.user_id
WHERE t.severity = 'p1' AND t.status NOT IN ('done','archived');

COMMIT;
