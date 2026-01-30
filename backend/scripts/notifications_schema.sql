-- In-app notifications schema (Supabase / Postgres)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  message text,
  metadata jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id);
create index if not exists idx_notifications_user_read on notifications(user_id, read);
