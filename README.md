# Tenax - AI Agent Phase 0 Setup

🤖 **Tenax** is an AI-powered productivity agent that combines intelligent scheduling, WhatsApp-based accountability, and task execution tracking.

## Phase 0 - System Foundation ✅

This phase establishes the core infrastructure:

- Backend API (Node.js/Express)
- Database schema (PostgreSQL)
- WhatsApp integration (Twilio)
- Job queue system (Redis/Bull)
- Basic dashboard (React)

---

## 🚀 Quick Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Twilio account (for WhatsApp)

### 1. Install Dependencies

**Backend:**

```bash
cd backend
npm install
```

**Frontend:**

```bash
cd frontend
npm install
```

### 2. Database Setup

1. Create PostgreSQL database:

```sql
CREATE DATABASE tenax;
```

2. Run schema:

```bash
psql -d tenax -f database/schema.sql
```

3. Apply Phase 3 P1 enforcement migration (severity columns, audit tables, helper view):

```bash
psql -d tenax -f database/migrations/20260120_p1_rule.sql
```

4. Apply Phase 4 schedule intelligence migration (timetable uploads, external calendars, unified view):

```bash
psql -d tenax -f database/migrations/20260120_schedule_intel.sql
```

5. Create a Supabase Storage bucket named `uploads` (Dashboard → Storage) and grant the backend `storage.objects` read/write access. This bucket stores raw timetable files for the OCR worker.

### 3. Environment Configuration

Copy and configure `.env` in backend folder:

```bash
cd backend
cp .env.example .env
```

Update these values:

- `DATABASE_URL` - Your PostgreSQL connection string
- `REDIS_URL` - Your Redis connection string
- `TWILIO_ACCOUNT_SID` - From Twilio console
- `TWILIO_AUTH_TOKEN` - From Twilio console
- `TWILIO_WHATSAPP_NUMBER` - Your Twilio WhatsApp number
- `JWT_SECRET` - Generate a secure secret
- `AGENT_VERSION` - Semantic tag for the current prompt/model bundle (e.g., `v2.0-motivation`)
- `EXPERIMENT_ID` - Variant label used in Opik dashboards (e.g., `reminder-tone-b`, defaults to `control`)
- `SCHEDULE_INTEL_V1` - Set to `true` to enable timetable uploads and availability endpoints
- `SUPABASE_STORAGE_BUCKET` - Supabase Storage bucket for timetable files (default `uploads`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth 2.0 creds for Calendar sync
- `GOOGLE_CALENDAR_REDIRECT_URL` - Callback URL (e.g., `http://localhost:3000/api/auth/google/callback`)
- `GOOGLE_CALENDAR_SCOPE` - Scope for read-only calendar access (`https://www.googleapis.com/auth/calendar.readonly`)
- `DINO_MODEL_ID` - Optional override for the Meta DINO model used during OCR (`facebook/dino-vits16` by default)
- `REPLICATE_API_KEY` - Server token for Replicate’s hosted OCR model
- `REPLICATE_DINO_VERSION` - Specific Replicate model version string (e.g., `owner/model:version-hash`)

### 4. Start Services

**Terminal 1 - Redis:**

```bash
redis-server
```

**Terminal 2 - Backend:**

```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**

```bash
cd frontend
npm start
```

### 5. Test Setup

1. **Health Check:** http://localhost:3000/health
2. **Dashboard:** http://localhost:3001
3. **WhatsApp Webhook:** http://localhost:3000/api/whatsapp/webhook

---

## 📱 WhatsApp Setup

### Twilio Configuration

1. Get Twilio WhatsApp Sandbox number
2. Set webhook URL: `https://your-domain.com/api/whatsapp/webhook`
3. Test with sandbox number

### Supported Commands

- `"done [task name]"` - Mark task complete / you can still be explicit if you prefer
- Natural intent: statements like "I finished deep work" or "I'm done with everything" also trigger completion (we'll ask which task if it's ambiguous)
- `"status"` - Check remaining tasks
- `"add [task name]"` - Add new task
- `"help"` - Show commands

---

## 🗄️ Database Schema

### Core Tables

- **users** - User profiles and preferences
- **tasks** - Task management and tracking
- **agent_states** - Daily plans and AI state
- **message_logs** - WhatsApp conversation history

### Sample Data

```sql
-- Create test user
INSERT INTO users (name, email, phone_number, role, phone_verified)
VALUES ('Test User', 'test@example.com', '+1234567890', 'student', true);

-- Create test task
INSERT INTO tasks (user_id, title, category, status)
VALUES ((SELECT id FROM users LIMIT 1), 'Morning Workout', 'Health', 'todo');
```

---

## 🔧 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-phone` - Phone verification

### Tasks

- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/today` - Get today's tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id/status` - Update task status

### WhatsApp

- `POST /api/whatsapp/webhook` - Message webhook
- `GET /api/whatsapp/webhook` - Webhook verification

---

## 🧪 Testing

### Manual Testing

1. Register user via API
2. Create tasks via dashboard/API
3. Send WhatsApp messages to test bot
4. Verify task status updates

### Deterministic WhatsApp Flow Test

Run an end-to-end simulation (requires the backend server running locally):

```bash
cd backend
export TWILIO_DISABLE_SEND=true # Windows: set TWILIO_DISABLE_SEND=true
npm run test:whatsapp
```

The script seeds a test user, creates sample tasks, sends `status`, `add`, and `done` messages to the local webhook, and logs traces to Opik so you can verify instrumentation quickly.
Setting `TWILIO_DISABLE_SEND=true` forces the WhatsApp service into test mode so the run never depends on external Twilio connectivity.

### Targeted Agent Action Test (Morning/Reminder/EOD)

Use the helper script to fire individual agent actions and verify Opik LLM-as-judge scores:

```bash
cd backend
node scripts/run_agent_actions.js all      # morning + reminder + EOD
node scripts/run_agent_actions.js morning  # morning summary only
node scripts/run_agent_actions.js reminder
node scripts/run_agent_actions.js eod
```

Each run loads `.env`, ensures the test user/tasks exist, and triggers the desired action so the Opik dashboard shows `daily_plan`, `reminder`, and `eod_summary` traces with evaluator scores in real time.

### Failure Dataset & Regression Harness (Phase 2)

Low-scoring traces get captured in `backend/opik_datasets/failure_cases.json`. Re-run them locally before shipping prompt/model tweaks:

```bash
cd backend
npm run test:regression          # Run every failure case
npm run test:regression reminder # Filter by type or case id
```

The script regenerates each agent output, scores it with the same LLM-as-judge prompt locally, and fails the run if any metric stays below its documented threshold. Use this alongside Opik datasets to prove that new agent versions match or beat historical failures.

Need to demo the guardrail in action? Set `FORCE_REGRESSION_FAILURE=true` in your shell (or `.env`) before running the command. Reminder outputs will intentionally degrade to "Remember to work on your tasks today." so specificity drops below the thresholds, causing the suite to fail. Clear the variable or set it back to `false` to restore normal behavior.

### Opik Variant Tagging & Experiment Dashboards

- Configure variant metadata via [backend/src/config/experiment.js](backend/src/config/experiment.js). `AGENT_VERSION` reflects the deployed prompt/model bundle, while `EXPERIMENT_ID` defaults to `control` and can be overridden per user (`experiment_id` column) for A/B tests.
- Every `daily_plan`, `reminder`, and `eod_summary` trace now ships `agent_version`, `prompt_version`, and `experiment_id` so Opik dashboards can filter/slice runs by variant.
- In Opik, create saved views that filter by `metadata.experiment_id` (e.g., `control` vs `reminder-tone-b`) to compare score distributions, completion impact, and failure-case frequency.
- Recommended experiments: reminder tone (warm vs assertive), planner strictness (strict vs flexible), and intervention frequency (2 vs 4 reminders). Update `EXPERIMENT_ID` before running regression tests to lock in the new variant.

## 🤖 Phase 5 Optimizer Scaffolding

- Install the Python SDK once in the environment referenced by `PYTHON_PATH`: `pip install opik-optimizer`. The bridge will raise a clear error if the dependency is missing.
- Enable the workflows by toggling `OPIK_OPTIMIZER_ENABLED=true` inside `backend/.env`. Dataset + metric defaults live in [backend/src/config/optimizer.js](backend/src/config/optimizer.js) and point to the files under [backend/opik_datasets](backend/opik_datasets).
- Use [backend/src/services/optimizerService.js](backend/src/services/optimizerService.js) whenever the Node backend needs to trigger HRPO, GEPA, or few-shot selection runs. It validates dataset paths, marshals payloads, and surfaces Python errors back to the caller.
- The Python side lives in [backend/src/utils/opik_optimizer_helpers.py](backend/src/utils/opik_optimizer_helpers.py) and is reachable through the existing bridge ([backend/src/utils/opikBridge.js](backend/src/utils/opikBridge.js)). Each helper loads JSON/JSONL datasets, calls the respective Opik optimizer, and serializes results for Node.
- Kick off local dry-runs with `npm run optimizer:hrpo`, `npm run optimizer:gepa`, or `npm run optimizer:fewshot`. The script [backend/scripts/run_optimizer_job.js](backend/scripts/run_optimizer_job.js) wires sample prompts/examples so you can validate connectivity before plugging in real datasets.
- Store curated datasets next to `failure_cases.json` (e.g., `intent_examples.json`) so Phase 5 export tooling can hydrate optimizer jobs without wiring external storage.
- Nightly runs are orchestrated by [backend/src/services/optimizerJobs.js](backend/src/services/optimizerJobs.js). When `OPIK_OPTIMIZER_ENABLED=true` and `REDIS_URL` is configured, the service schedules a Bull queue that fires HRPO batches according to `OPIK_OPTIMIZER_CRON` (default: `0 2 * * *`). Override the prompt/dataset per job if you want variant-specific experiments.
- Every trace emitted via [backend/src/instrumentation/opikTracer.js](backend/src/instrumentation/opikTracer.js) now streams into JSONL files under `backend/opik_datasets/streams/`. Reminder send/completion events join the same sink through [backend/src/services/datasetExporter.js](backend/src/services/datasetExporter.js), so optimizers can pull fresh behavioral data without manual exports.
- Local environments ship with `OPIK_OPTIMIZER_MOCK_MODE=true` so you get deterministic JSONL-backed results without Opik API credentials. Flip it to `false` (and provide Opik keys/datasets) when you want to run the real HRPO/GEPA pipelines.

### Deterministic Flow Narrative (Goal → Plan → Reminder → Completion → Evaluation)

1. **Goal Input** – User states a primary goal in Supabase (see `devPhases.md` storytelling blocks). Capture a screenshot of the Opik trace showing `user_goal` metadata for the initial `daily_plan`.
2. **Daily Plan** – `node scripts/run_agent_actions.js morning` generates the morning summary, logs a `daily_plan` trace, and records scores. Screenshot: Opik trace with evaluator breakdown + failure dataset reference.
3. **Reminder Delivery** – Trigger `node scripts/run_agent_actions.js reminder` to show how reminders inherit the same goal context plus `experiment_id`. Screenshot: Opik reminder trace filtered by variant.
4. **Completion Tracking** – Use WhatsApp test flow (`npm run test:whatsapp`) to mark tasks done. Screenshot: Opik `log_task_completion` entry highlighting latency metrics.
5. **Evaluation & Regression** – Run `npm run test:regression` and capture the CLI success + Opik quality chart (scores over threshold). Link these visuals back to `devPhases.md` lines 196–332 to narrate how Tenax improves itself over time.

Pair the screenshots with short captions so the demo explains _why_ Tenax keeps getting better, not just that it works.

### Human Feedback Loop & Judge Calibration

- Store structured human reviews in [backend/opik_datasets/human_feedback_v1.json](backend/opik_datasets/human_feedback_v1.json). Each entry should capture context (message type, prompt version), quick 1–5 scores, positives, issues, and behavioral expectations. Feel free to duplicate the existing `entries` array structure for new reviewers or dates.
- Always include the Opik `trace_ids` you reviewed so we can tag the trace metadata (see the existing entries for examples). When you send new feedback, just drop the trace IDs in chat and we’ll append them to the JSON.
- During prompt work, pull insights from that file to adjust instructions (tone variety, conversational closings, emoji usage). When we collect 5+ new reviews, bump `feedback_version` to keep history.
- Map human notes to Opik evaluators: e.g., low specificity or robotic tone from reviewers should become stricter score thresholds in `failure_cases.json` so the regression harness enforces the improvement.
- For demos, cite both: “LLM judge score improved from 2 → 4” and “Human feedback flagged tone as ‘alive’.” This shows evaluators and actual users agree the change is better.
- Permanent tone guardrails live in [backend/opik_datasets/agent_style_rules.json](backend/opik_datasets/agent_style_rules.json). The agent pulls these constraints into its prompts (conversation-first voice, no command-style phrasing, adaptive emotional tone). Update the JSON when redefining Tenax’s persona so prompts and evaluators stay in sync.

### API Testing with curl

```bash
# Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","phone_number":"+1234567890","role":"student"}'

# Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"title":"Test Task","category":"Other"}'
```

---

## 📁 Project Structure

```
Tenax/
├── backend/
│   ├── src/
│   │   ├── config/database.js
│   │   ├── models/User.js, Task.js
│   │   ├── routes/auth.js, tasks.js, whatsapp.js, schedule.js
│   │   ├── services/whatsapp.js, queue.js, scheduleService.js, scheduleQueues.js, ocrService.js
│   │   ├── middleware/auth.js
│   │   └── app.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/App.js, App.css, index.js
│   ├── public/index.html
│   └── package.json
├── database/schema.sql
└── README.md
```

---

## 🔄 Job Queue System

Uses Redis + Bull for:

- Scheduled WhatsApp reminders
- Morning summaries
- End-of-day reports

Queue monitoring available at: http://localhost:3000/admin/queues (TODO: implement)

---

## 🚨 Troubleshooting

### Common Issues

**Database Connection:**

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -d tenax -c "SELECT version();"
```

**Redis Connection:**

```bash
# Check Redis is running
redis-cli ping
```

**WhatsApp Webhook:**

- Use ngrok for local testing: `ngrok http 3000`
- Update Twilio webhook URL with ngrok URL
- Check Twilio logs for webhook errors

**Environment Variables:**

- Ensure all required vars are set in `.env`
- Restart server after changing `.env`

---

## ✅ Phase 0 Completion Checklist

- [x] PostgreSQL database with schema
- [x] Node.js API server with routes
- [x] User registration & authentication
- [x] Task CRUD operations
- [x] WhatsApp webhook integration
- [x] Basic message parsing (done, status, add, help)
- [x] Redis job queue system
- [x] React dashboard with task display
- [x] Health check endpoint
- [x] Error handling & logging

**🎉 Phase 0 Complete - Ready for Phase 1!**

---

## 🔜 Next Steps (Phase 1)

1. Enhanced AI agent with rule engine
2. Timetable upload & parsing
3. Google Calendar integration
4. Scheduled reminders system
5. Morning/evening summaries
6. Recurring task engine

---

## 🛡️ Phase 3 P1 Enforcement

- Schema now includes `severity` and `p1_*` columns on tasks plus the `rule_enforcement_events`, `user_rule_states`, and `active_p1_tasks_v` helpers. Full rationale lives in [docs/phase3-p1-rule-plan.md](docs/phase3-p1-rule-plan.md).
- After every schema refresh, run `psql -d tenax -f database/migrations/20260120_p1_rule.sql` so these guardrail tables exist before you boot the backend.
- To validate locally, mark a task's `severity` to `p1` in Supabase, then:
  1. Send `status` via WhatsApp → the response should prepend the ⚠️ banner listing the protected tasks.
  2. Try `add quick task` (or any non-completion intent) → it is blocked and logged to `rule_enforcement_events`.
  3. Finish with `done [task]` → acknowledgement clears the guardrail and other intents resume.
- Automation jobs (morning summary, reminders, EOD) now call the same rule service, so every surface re-sends the banner and logs proof of exposure whenever a P1 task exists.

---

## 📅 Phase 4 Schedule Intelligence

- New schema tables (`timetable_uploads`, `timetable_extractions`, `external_calendars`, `external_events`) plus the `schedule_blocks_v` view unlock timetable ingestion and calendar syncing. See [docs/phase4-schedule-intel-plan.md](docs/phase4-schedule-intel-plan.md) for the full architecture.
- Set `SCHEDULE_INTEL_V1=true` and `REDIS_URL` to enable the schedule upload API and Bull workers (`schedule-ocr`, `calendar-sync`). Queues initialize automatically when the backend starts.
- Supabase Storage bucket `uploads` holds raw timetable files; uploads are saved under `timetables/<userId>/...` before OCR begins. Make sure the service key has `storage.objects` permissions.
- OAuth 2.0 config (Google Calendar scope `https://www.googleapis.com/auth/calendar.readonly`, redirect `http://localhost:3000/api/auth/google/callback`) is now driven by the new env vars so we can wire the sync worker next.
- OCR jobs call Meta’s DINO model via Replicate once `REPLICATE_API_KEY` + `REPLICATE_DINO_VERSION` are set. Until a parser is implemented, the worker logs prediction status so we can verify connectivity without mutating data.
- `POST /api/schedule/upload` (multipart) now accepts timetable files (`timetable` field) + `user_id` and queues them for OCR/structuring. Current processor is a stub, so use this to verify plumbing before wiring real OCR/storage.
- `GET /api/schedule/availability/:userId?date=YYYY-MM-DD` merges timetable rows, external events, and fixed tasks to return busy blocks plus computed free windows. This powers agent planning/tests today, and the dashboard later.
- Every availability call logs Opik traces (see `schedule_availability_computed`) so we can measure busy/free coverage and eventually correlate reminder timing with completion latency.
- OCR is being implemented with Meta's DINO models. The worker currently logs the stub execution path; once the DINO pipeline is ready it will parse rows into `timetable_extractions` automatically.

---

## 📞 Support

For issues or questions:

1. Check troubleshooting section
2. Review API logs: `npm run dev` in backend
3. Check database connections
4. Verify Twilio webhook configuration
   #   T e n a x 
    
    
   #   T e n a x 
    
    
