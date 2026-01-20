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

-- Insert sample data for testing
INSERT INTO users (name, email, phone_number, role, phone_verified) 
VALUES ('Test User', 'test@example.com', '+1234567890', 'student', true);