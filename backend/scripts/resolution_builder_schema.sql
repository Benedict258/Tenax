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
  resolution_type text,
  target_outcome text,
  duration_weeks integer,
  end_date date,
  availability_json jsonb,
  preferences_json jsonb,
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
  phase_objective text,
  what_to_learn_json jsonb,
  what_to_build_json jsonb,
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
  estimated_duration_minutes integer,
  topic_key text,
  topic_id text,
  status text not null default 'todo',
  order_index integer not null default 0,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resolution_daily_items (
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
  estimated_duration_minutes integer,
  topic_key text,
  topic_id text,
  status text not null default 'todo',
  order_index integer not null default 0,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists resolution_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_text text not null,
  resolution_type text,
  duration_weeks integer,
  created_at timestamptz not null default now()
);

create table if not exists resolution_resources (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references resolution_phases(id) on delete cascade,
  title text not null,
  url text not null,
  type text,
  created_at timestamptz not null default now()
);

create table if not exists resolution_progress (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references resolution_phases(id) on delete cascade,
  status text not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_resolution_builder_sessions_user on resolution_builder_sessions(user_id);
create index if not exists idx_resolution_builder_messages_session on resolution_builder_messages(session_id);
create index if not exists idx_resolution_plans_user on resolution_plans(user_id);
create index if not exists idx_resolution_phases_plan on resolution_phases(plan_id);
create index if not exists idx_resolution_tasks_plan on resolution_tasks(plan_id);
create index if not exists idx_resolution_tasks_user_date on resolution_tasks(user_id, date);
create index if not exists idx_resolution_daily_items_plan on resolution_daily_items(plan_id);
create index if not exists idx_resolution_daily_items_user_date on resolution_daily_items(user_id, date);
create index if not exists idx_resolution_roadmaps_user on resolution_roadmaps(user_id);
create index if not exists idx_resolution_resources_phase on resolution_resources(phase_id);
create index if not exists idx_resolution_progress_phase on resolution_progress(phase_id);

-- Safe ALTERs for existing installs
alter table resolution_plans add column if not exists resolution_type text;
alter table resolution_plans add column if not exists preferences_json jsonb;

alter table resolution_phases add column if not exists phase_objective text;
alter table resolution_phases add column if not exists what_to_learn_json jsonb;
alter table resolution_phases add column if not exists what_to_build_json jsonb;

alter table resolution_tasks add column if not exists estimated_duration_minutes integer;
alter table resolution_tasks add column if not exists topic_key text;
alter table resolution_tasks add column if not exists topic_id text;
alter table resolution_phases add column if not exists roadmap_id uuid;
