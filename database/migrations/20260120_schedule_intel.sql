BEGIN;

CREATE TABLE IF NOT EXISTS timetable_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  failure_reason TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS timetable_extractions (
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

CREATE INDEX IF NOT EXISTS idx_timetable_uploads_user ON timetable_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_timetable_extractions_user_day ON timetable_extractions(user_id, day_of_week);

CREATE TABLE IF NOT EXISTS external_calendars (
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

CREATE TABLE IF NOT EXISTS external_events (
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

CREATE INDEX IF NOT EXISTS idx_external_calendars_user ON external_calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_external_events_user_time ON external_events(user_id, start_time);

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

COMMIT;
