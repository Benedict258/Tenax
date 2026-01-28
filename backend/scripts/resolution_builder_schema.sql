-- Resolution Builder schema (Supabase / Postgres)
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists resolution_builder_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'active',
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resolution_builder_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references resolution_builder_sessions(id) on delete cascade,
  step_key text,
  role text not null,
  content_text text,
  content_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists resolution_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  goal_text text not null,
  target_outcome text,
  duration_weeks integer,
  end_date date,
  availability_json jsonb,
  status text not null default 'draft',
  roadmap_json jsonb,
  svg_url text,
  png_url text,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resolution_phases (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references resolution_plans(id) on delete cascade,
  phase_index integer not null,
  title text not null,
  description text,
  objectives_json jsonb,
  topics_json jsonb,
  resources_json jsonb,
  completion_status text not null default 'pending',
  completion_criteria_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resolution_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null references resolution_plans(id) on delete cascade,
  phase_id uuid references resolution_phases(id) on delete set null,
  date date not null,
  start_time time,
  title text not null,
  objective text,
  description text,
  resources_json jsonb,
  status text not null default 'todo',
  order_index integer not null default 0,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_resolution_builder_sessions_user on resolution_builder_sessions(user_id);
create index if not exists idx_resolution_builder_messages_session on resolution_builder_messages(session_id);
create index if not exists idx_resolution_plans_user on resolution_plans(user_id);
create index if not exists idx_resolution_phases_plan on resolution_phases(plan_id);
create index if not exists idx_resolution_tasks_plan on resolution_tasks(plan_id);
create index if not exists idx_resolution_tasks_user_date on resolution_tasks(user_id, date);
