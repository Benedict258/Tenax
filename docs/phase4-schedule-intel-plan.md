# Phase 4 — Schedule Intelligence Implementation Plan

_Last updated: 2026-01-20_

## 1. Why Phase 4 Matters

- Phase 4 (per `devPhases.md`) elevates Tenax from task lists to full schedule awareness: ingesting timetables, syncing calendars, preventing conflicts, and timing reminders intelligently.
- `Tenax.md` stresses that the agent must understand context (classes, work blocks) to maximize behavior change. We need structured schedule data to inform agent decisions, Opik evaluations, and future experiments.
- With Phase 3 complete (rule engine + P1 enforcement), schedule intelligence becomes the next differentiator before we invest in optimizer work (Phase 5).

## 1.5 Prerequisites & External Config

- **Supabase Storage bucket** named `uploads` (Storage → Buckets). All raw timetable files live under `timetables/<user_id>/...`. Grant the backend `storage.objects` read/write access via policy.
- **Google OAuth 2.0 (web application)** with scope `https://www.googleapis.com/auth/calendar.readonly` and redirect `http://localhost:3000/api/auth/google/callback` (prod URL TBD). Credentials are injected via `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALENDAR_REDIRECT_URL` env vars.
- **Meta DINO OCR model** preference: `DINO_MODEL_ID` defaults to `facebook/dino-vits16`. Primary host will be Replicate (set `REPLICATE_API_KEY` and `REPLICATE_DINO_VERSION`). If Replicate performance lags we’ll swap to a Hugging Face Inference Endpoint or another provider.

## 2. Target Outcomes

1. **Reliable schedule ingestion** from timetables (upload) and calendar integrations.
2. **Normalized schedule store** that merges fixed events, flexible tasks, and inferred free windows.
3. **Agent + queue awareness** so reminders avoid conflicts and daily plans respect availability.
4. **Observability hooks** (Opik traces + metrics) that prove reminders fire at smarter times.
5. **Manual override tooling** (API + eventually dashboard) so ops/users can correct imports.

## 3. Architecture Overview

```
User Uploads (PDF/IMG/CSV) ─┐
                             │  (1) Storage + OCR worker -> timetable_extractions
Google Calendar OAuth ───────┼──> calendar_sync queue -> external_events
                             │
Manual Editor (frontend) ────┘
                                  │
                                  ▼
                         schedule_blocks view
                                  │
                        AgentService + Queue
```

### Key components

- **Ingestion API** (`/api/schedule/import`): accepts uploads, seeds processing jobs.
- **Worker pipeline**: new Bull queue and service to run OCR/extraction templates.
- **Calendar sync service**: handles OAuth tokens, refresh, delta sync, failure logging.
- **Schedule store**: consolidated tables + view powering availability calculations.
- **Availability engine**: utility to compute free windows and conflicts for each day.

## 4. Data Model Changes (Supabase / Postgres)

### 4.1 `timetable_uploads`

Stores raw files + processing status.

```sql
CREATE TABLE timetable_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'pdf' | 'image' | 'csv'
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  failure_reason TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

### 4.2 `timetable_extractions`

One row per structured entry parsed from uploads.

```sql
CREATE TABLE timetable_extractions (
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
CREATE INDEX idx_extractions_user_day ON timetable_extractions(user_id, day_of_week);
```

### 4.3 `external_calendars` + `external_events`

```sql
CREATE TABLE external_calendars (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google'
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

CREATE TABLE external_events (
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

CREATE INDEX idx_events_user_time ON external_events(user_id, start_time);
```

### 4.4 Derived view: `schedule_blocks_v`

Combines `external_events`, `timetable_extractions`, and fixed tasks.

```sql
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
         date_trunc('day', now())::date + start_time AS start_time,
         date_trunc('day', now())::date + end_time AS end_time,
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
         metadata ->> 'category'
  FROM external_events
  UNION ALL
  SELECT user_id,
         start_time,
         end_time,
         title,
         'task' AS source,
         category
  FROM tasks
  WHERE is_fixed = TRUE
) merged;
```

(Actual SQL will convert day-of-week rows into next-occurrence timestamps via helper function.)

## 5. Backend Services

### 5.1 Upload & OCR Service

- Endpoint: `POST /api/schedule/upload`
- Stores file in S3/Supabase storage, inserts `timetable_uploads`, enqueues `schedule-ocr` job.
- Worker pipeline:
  1. Download file.
  2. Run OCR (Meta DINO via Replicate API, fall back to alternate provider if needed).
  3. Apply template heuristics (table detection, column mapping).
  4. Normalize to JSON rows, insert into `timetable_extractions`.
  5. Emit `rule_enforcement_events`-style log for observability and Opik trace (`messageType: 'schedule_ingest'`).

### 5.2 Calendar Sync Service

- OAuth controller for Google (using `passport-google-oauth20` or `googleapis`).
- Tokens stored encrypted in `external_calendars`.
- `calendar-sync` Bull queue job runs hourly per user, fetches events window (prev day → +14 days), upserts into `external_events`.
- Handles incremental sync using `syncToken` stored in `metadata`.

### 5.3 Schedule Engine Utilities

- `scheduleService.getBusyBlocks(userId, dateRange)` → merges `schedule_blocks_v`.
- `scheduleService.getFreeWindows(userId, date)` → subtract busy blocks from day, factoring buffer times.
- `agentService` morning summary uses `getFreeWindows` to place tasks.
- Queue reminder scheduling chooses next free slot before sending reminders.

## 6. Agent & Queue Integration

1. **Daily Plan**: include top conflicts + free windows text, e.g., "You’re booked 9–1 with classes; best window for P1 is 2–4 PM." Trace to Opik with new metadata fields `busy_minutes`, `free_window_count`.
2. **Reminder Scheduling**: before enqueuing reminder, verify the target window is not inside a busy block; if it is, shift reminder to nearest free window and log `schedule_adjusted=true` in metrics.
3. **Conflict Detection**: when user adds a fixed task via WhatsApp or dashboard, run collision check and respond if conflicts exist.
4. **EOD Summary**: mention whether schedule adherence matched plan (e.g., tasks completed during predicted window) using `scheduleService` comparisons.

## 7. Observability & Opik

- New trace types: `schedule_ingest`, `calendar_sync`, `availability_compute`.
- Metrics:
  - `schedule_import_latency`
  - `calendar_sync_failures`
  - `reminder_shift_count`
- Dataset idea: "Conflict Misses" capturing cases where reminders were sent during busy blocks prior to Phase 4; use as regression harness to confirm 0 occurrences once features ship.

## 8. Frontend (Dashboard) Notes

- Upload UI with drag/drop + status indicator.
- Timetable editor grid to adjust rows (CRUD on `timetable_extractions`).
- Calendar connect button (Google OAuth) + status pill.
- Schedule visualization (week view) showing merged blocks + P1 tasks.
- Admin view to monitor ingestion failures.
  (Implementation deferred but requirements captured for later.)

## 9. Rollout Plan

1. **Schema migration** (Supabase) + storage bucket for uploads.
2. **Backend ingestion endpoints + queues** (ship behind feature flag `SCHEDULE_INTEL_V1`).
3. **Internal dogfood**: import 2–3 real timetables, validate extraction accuracy, hand-edit via SQL.
4. **Google Calendar beta**: limited testers connect accounts; monitor `calendar_sync_failures` metrics.
5. **Agent integration**: enable conflict avoidance for a subset of users; log Opik traces to verify improvement.
6. **Regression gates**: failing conditions include reminders landing in busy blocks and missing schedule banners.

## 10. Immediate Task Breakdown

1. **Migrations** – add tables/views/indexes.
2. **Storage config** – Supabase bucket + signed URL helper.
3. **Upload API + worker** – minimal PDF/CSV parser first; plug OCR later.
4. **Calendar OAuth scaffold** – service account + refresh handling.
5. **scheduleService utilities** – busy/free window calculations.
6. **Agent/queue updates** – integrate availability data.
7. **Opik instrumentation** – new trace metadata + regression dataset.
8. **Docs** – update README + dashboard specs once UI work begins.

---

This plan keeps backend-first velocity while documenting the frontend contracts we’ll need when dashboard work begins.
