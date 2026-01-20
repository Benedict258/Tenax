-- Tenax Phase 0 Database Schema
-- Run this in your PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT UNIQUE,
  phone_number TEXT UNIQUE,
  phone_verified BOOLEAN DEFAULT FALSE,
  start_time TIME DEFAULT '07:00:00',
  timezone TEXT DEFAULT 'Africa/Lagos',
  role TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Other',
  is_fixed BOOLEAN DEFAULT FALSE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT,
  recurrence JSONB,
  status TEXT DEFAULT 'todo',
  priority INT DEFAULT 5,
  severity TEXT DEFAULT 'p2' CHECK (severity IN ('p1','p2','p3')),
  p1_declared BOOLEAN GENERATED ALWAYS AS (severity = 'p1') STORED,
  p1_enforcement_state TEXT DEFAULT 'unacknowledged' CHECK (p1_enforcement_state IN ('unacknowledged','ack_requested','ack_received','snoozed','cleared')),
  p1_last_surface_at TIMESTAMPTZ,
  p1_protected_until TIMESTAMPTZ,
  p1_ack_via TEXT,
  p1_metadata JSONB DEFAULT '{}',
  created_via TEXT DEFAULT 'web',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent states table
CREATE TABLE agent_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE,
  daily_plan JSONB DEFAULT '[]',
  last_message_sent_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,
  streaks JSONB DEFAULT '{}',
  habits_detected JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Message logs table
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'inbound' | 'outbound'
  channel TEXT DEFAULT 'whatsapp',
  content TEXT,
  parsed_intent TEXT,
  parsed_slots JSONB DEFAULT '{}',
  confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX idx_tasks_start_time ON tasks(start_time);
CREATE INDEX idx_tasks_user_p1 ON tasks(user_id) WHERE severity = 'p1';
CREATE INDEX idx_agent_states_user_date ON agent_states(user_id, date);
CREATE INDEX idx_message_logs_user_time ON message_logs(user_id, created_at);

-- Rule enforcement audit log
CREATE TABLE rule_enforcement_events (
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

CREATE INDEX idx_rule_events_user_time ON rule_enforcement_events(user_id, created_at);

-- Cached rule states per user for quick checks
CREATE TABLE user_rule_states (
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

-- Schedule intelligence tables (Phase 4)
CREATE TABLE timetable_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  failure_reason TEXT,
  ocr_payload JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE timetable_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_id UUID REFERENCES timetable_uploads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  category TEXT DEFAULT 'class',
  confidence NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_timetable_uploads_user ON timetable_uploads(user_id);
CREATE INDEX idx_timetable_extractions_user_day ON timetable_extractions(user_id, day_of_week);

CREATE TABLE external_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle',
  last_synced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE external_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id UUID REFERENCES external_calendars(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_event_id TEXT,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  location TEXT,
  status TEXT DEFAULT 'confirmed',
  source TEXT DEFAULT 'calendar',
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (calendar_id, provider_event_id)
);

CREATE INDEX idx_external_calendars_user ON external_calendars(user_id);
CREATE INDEX idx_external_events_user_time ON external_events(user_id, start_time);

CREATE OR REPLACE VIEW schedule_blocks_v AS
SELECT user_id,
       start_time,
       end_time,
       title,
       source,
       category,
       metadata
FROM (
    SELECT user_id,
      timezone('UTC', date_trunc('day', now()) + start_time) AS start_time,
      timezone('UTC', date_trunc('day', now()) + end_time) AS end_time,
         title,
         'timetable' AS source,
         category,
         metadata
  FROM timetable_extractions
  UNION ALL
  SELECT user_id,
         start_time,
         end_time,
         title,
      'calendar' AS source,
      (metadata ->> 'category') AS category,
      metadata
    FROM external_events
  UNION ALL
  SELECT user_id,
         start_time,
         end_time,
         title,
         'task' AS source,
         category::TEXT AS category,
         metadata
  FROM tasks
  WHERE is_fixed = TRUE
) merged;

-- Insert sample data for testing
INSERT INTO users (name, email, phone_number, role, phone_verified) 
VALUES ('Test User', 'test@example.com', '+1234567890', 'student', true);