CREATE TABLE IF NOT EXISTS task_schedule_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  conflict_window JSONB NOT NULL,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_schedule_conflicts_user ON task_schedule_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_task_schedule_conflicts_task ON task_schedule_conflicts(task_id);
