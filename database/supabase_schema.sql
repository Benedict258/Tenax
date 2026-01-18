-- Tenax Supabase Schema
-- Run this in Supabase SQL Editor

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
  direction TEXT NOT NULL,
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
CREATE INDEX idx_agent_states_user_date ON agent_states(user_id, date);
CREATE INDEX idx_message_logs_user_time ON message_logs(user_id, created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (true);

CREATE POLICY "Users can view own tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE USING (true);

CREATE POLICY "Users can view own agent states" ON agent_states FOR SELECT USING (true);
CREATE POLICY "Users can insert own agent states" ON agent_states FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own agent states" ON agent_states FOR UPDATE USING (true);

CREATE POLICY "Users can view own messages" ON message_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert own messages" ON message_logs FOR INSERT WITH CHECK (true);

-- Insert sample test user
INSERT INTO users (name, email, phone_number, role, phone_verified) 
VALUES ('Test User', 'test@tenax.ai', '+1234567890', 'student', true);