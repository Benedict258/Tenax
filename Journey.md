1. OCR parser (Replicate → schedule rows)

Capture sample DINO outputs by running the current upload flow with a few real timetables; log/store the raw JSON.
Define a parsing spec: required row fields, time normalization, class names, locations.
Implement parser inside ocrService.js so extractRowsWithDino() returns normalized rows. Include validation + metrics logging for extraction quality.
Backfill timetable_extractions with parsed data and add tests/fixtures. 2. Google Calendar OAuth + sync

Create Supabase table for OAuth tokens (user_id, provider, refresh_token, scopes, expiry).
Build OAuth endpoints (frontend + backend) to initiate Google consent, handle callback, exchange code for tokens, and persist securely.
Flesh out calendarSyncQueue: fetch events via Google API, normalize to the same schema as timetable rows, insert into schedule_blocks table (flagged as source=google).
Schedule periodic sync jobs (e.g., Bull repeatable jobs or cron) per connected user. 3. Manual timetable editor

Add CRUD endpoints to list, insert, update, delete timetable_extractions rows (with audit fields).
On the frontend, build a React table/grid for editing slots: date, start/end, course, location. Support bulk edits and re-running OCR for a single upload.
Wire edits to Supabase via API, with optimistic UI updates and validation (no overlapping times unless allowed).
Optionally add a “review OCR output” UI showing image preview alongside extracted rows. 4. Conflict-aware reminder logic

Extend the reminder scheduler to query schedule_blocks_v before scheduling; if a task’s preferred window overlaps a busy block, shift reminders to the nearest free window.
Implement conflict detection alerts (e.g., mark tasks as clashing with classes) and store resolution decisions.
Feed availability windows into the task prioritization engine so it can recommend realistic slots.
Log all adjustments to Opik traces (reminder_conflict_avoided) for later analytics.
