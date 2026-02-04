-- User integrations (tokens + status)
create table if not exists user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  status text not null default 'disconnected',
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scopes text,
  provider_account_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_user_integrations_user_provider
  on user_integrations(user_id, provider);
