# Phase 3 – P1 Enforcement Data Model Plan

## 1. Rule Intent

- P1 ("must-protect") tasks are globally enforced: if at least one task is flagged P1, every user-facing surface (morning summary, reminders, WhatsApp chat, automation queue) must keep that task visible, protected from accidental changes, and request acknowledgement on completion.
- Enforcement only pauses when the frontend has **not** marked any tasks as P1 for the user. The backend stays agnostic and simply reacts to the `severity` flag received with each task payload.
- Every enforcement action must be auditable so we can prove: when a P1 task was surfaced, whether the user acknowledged it, and whether the system blocked conflicting actions.

## 2. Schema Updates (Supabase / Postgres)

### 2.1 `tasks` table additions

```sql
ALTER TABLE tasks
  ADD COLUMN severity TEXT DEFAULT 'p2' CHECK (severity IN ('p1','p2','p3')),
  ADD COLUMN p1_declared BOOLEAN GENERATED ALWAYS AS (severity = 'p1') STORED,
  ADD COLUMN p1_enforcement_state TEXT DEFAULT 'unacknowledged' CHECK (p1_enforcement_state IN ('unacknowledged','ack_requested','ack_received','snoozed','cleared')),
  ADD COLUMN p1_last_surface_at TIMESTAMPTZ,
  ADD COLUMN p1_protected_until TIMESTAMPTZ,
  ADD COLUMN p1_ack_via TEXT,
  ADD COLUMN p1_metadata JSONB DEFAULT '{}';
CREATE INDEX idx_tasks_user_p1 ON tasks(user_id) WHERE severity = 'p1';
```

Purpose:

- `severity` is the canonical source the frontend sets when marking P1.
- Stored `p1_declared` lets us query quickly without string comparisons.
- `p1_enforcement_state` tracks rule progress so automation can tell whether a user ever acknowledged the task.
- `p1_last_surface_at` guarantees cadence (e.g., "surface at least once per session" logic).
- `p1_protected_until` blocks destructive actions (delete/archive) and allows time-bound overrides.
- `p1_ack_via` records whether acknowledgement was captured via WhatsApp, UI, or automation.

### 2.2 `rule_enforcement_events`

```sql
CREATE TABLE rule_enforcement_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  severity TEXT NOT NULL,
  surface_type TEXT NOT NULL,          -- morning_summary | reminder | inbound_guard | automation_block | eod_summary
  action TEXT NOT NULL,                -- surfaced | blocked_action | requested_ack | received_ack | auto_escalated
  channel TEXT NOT NULL,               -- whatsapp | web | cron | api
  outcome TEXT,                        -- delivered | failed | user_confirmed | bypassed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_rule_events_user_time ON rule_enforcement_events(user_id, created_at);
```

Purpose:

- Immutable log to satisfy the "always surfaced/protected" requirement.
- Enables regression queries ("Show all P1 exposures for user X today").

### 2.3 `user_rule_states`

```sql
CREATE TABLE user_rule_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_p1_task_ids UUID[] DEFAULT '{}',
  last_global_surface_at TIMESTAMPTZ,
  pending_ack_count INT DEFAULT 0,
  blocked_action_count INT DEFAULT 0,
  last_state_hash TEXT,                -- used to avoid duplicate enforcement in automation loop
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Purpose:

- Cheap cache for automation jobs (e.g., reminder scheduler) to know if global rule is active without scanning `tasks` every time.
- Tracks global stats to display in admin dashboards.

### 2.4 Derived view `active_p1_tasks_v`

```sql
CREATE OR REPLACE VIEW active_p1_tasks_v AS
SELECT
  t.*,
  urs.pending_ack_count,
  urs.last_global_surface_at
FROM tasks t
LEFT JOIN user_rule_states urs ON urs.user_id = t.user_id
WHERE t.severity = 'p1' AND t.status NOT IN ('done','archived');
```

Purpose:

- Single touchpoint for services (`agent.js`, queue workers) to fetch open P1 tasks plus cached state.

## 3. Data Flow & Ownership

1. **Frontend** sets `severity = 'p1'` when user marks task as critical (future work). Backend only consumes this column.
2. **Task ingest/update** (REST or queue) writes severity, and triggers:
   - refresh of `user_rule_states` via `SELECT array_agg(id) ...` to keep cache in sync;
   - insertion into `rule_enforcement_events` with action `surfaced` if severity transitions into P1.
3. **Automation surfaces** (morning summary, reminders, EOD) must:
   - always include `active_p1_tasks_v` results before anything else;
   - record each exposure to `rule_enforcement_events` with `surface_type` + `channel`.
4. **Inbound WhatsApp parser** checks `user_rule_states.pending_ack_count`:
   - if >0 and user message looks like "new request", respond with guardrail reminder referencing the still-open P1.
   - completion intents must log `requested_ack` → `received_ack` transitions, update `tasks.p1_enforcement_state`, and decrement cache counters.
5. **Blocking actions** (delete/archive/snooze) call a helper that compares `p1_protected_until`; if still active, log `blocked_action` in `rule_enforcement_events` and deny the action unless an override token is passed by ops.

## 4. Agent & Service Integration Points

- `Task` model additions: helper `Task.getActiveP1(userId)` returning rows from `active_p1_tasks_v` with enforcement metadata.
- `AgentService.generateMorningSummary` always prepends P1 narrative (e.g., "Before anything else, handle …"), and logs `surface_type='morning_summary'`.
- `AgentService.generateReminder` chooses P1 tasks first; reminders for non-P1 tasks are only allowed if `pending_ack_count === 0`.
- `whatsapp` route uses `user_rule_states` to short-circuit certain flows (e.g., new task creation) until user acknowledges P1 completion.
- `queue.js` scheduling ensures `forceRegressionFailure` never bypasses P1 exposures; guardrail tests will flip this flag to verify fallback messaging still references P1 tasks.

## 5. Instrumentation & Evaluation

- Extend Opik tracing metadata with `severity` and `p1_enforcement_state` so regression harness can assert "P1 coverage".
- Add regression case: "When P1 exists, morning summary begins with it" (expected failure if not).
- Add human-feedback tag `rules:p1_enforced` for reviewers to flag violations.
- Metrics to emit:
  - `p1_surface_latency` (time from creation to first surface).
  - `p1_ack_latency` (time from surface to user acknowledgement).
  - `p1_blocked_actions` (counts when guardrail prevented conflicting requests).

## 6. Implementation Checklist (future PRs)

1. Migrate Supabase schema with columns + new tables/views.
2. Update ORM helpers in `Task.js` to read/write severity + enforcement state.
3. Add `RuleStateService` (backend/src/services/ruleState.js) to encapsulate cache + event writes.
4. Wire service into agent flows, WhatsApp routes, and automation queue.
5. Create Opik regression tests + harness assertions for P1 coverage.

Once this plan is approved, we can start executing the schema migrations and service wiring, followed by frontend updates to mark tasks as P1.
