-- Human feedback for Opik calibration
create table if not exists opik_human_feedback (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  user_id uuid,
  message_type text,
  score_type text not null,
  score_value numeric not null,
  comment text,
  source text default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists idx_opik_human_feedback_trace on opik_human_feedback(trace_id);
create index if not exists idx_opik_human_feedback_created_at on opik_human_feedback(created_at);
