-- Google Calendar tokens (read-only integration)
create table if not exists google_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  access_token text not null,
  refresh_token text,
  scope text,
  token_type text,
  expiry timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_calendar_tokens_user on google_calendar_tokens(user_id);
