-- Opik trace mirror for admin dashboard
create table if not exists opik_trace_mirror (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  message_type text,
  input_context jsonb,
  output jsonb,
  output_snippet text,
  tone_score numeric,
  specificity_score numeric,
  realism_score numeric,
  goal_alignment_score numeric,
  resolution_alignment_score numeric,
  agent_version text,
  prompt_version text,
  experiment_id text,
  trace_id text,
  trace_url text,
  metadata jsonb,
  logged_at timestamptz not null default now()
);

create index if not exists idx_opik_trace_mirror_logged_at on opik_trace_mirror(logged_at);
create index if not exists idx_opik_trace_mirror_message_type on opik_trace_mirror(message_type);
create index if not exists idx_opik_trace_mirror_experiment on opik_trace_mirror(experiment_id);
