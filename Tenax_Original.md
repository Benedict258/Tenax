# Personal Productivity AI, Product Requirements Document (PRD)

**Product name:** Tenax PRD

**Author:** Benedict Isaac

**Date:** 2026-01-10

**Audience:** Product, Engineering, ML, DevOps, Design, Growth

---

# 1. Summary / Purpose

Dayforge AI is a personal execution system that combines an intelligent agent, schedule import/recognition, and WhatsApp-based nudges to help users follow a strict study/work rhythm. Users onboard with why they’re using the app and who they are (student, developer, etc.), provide their timetable (or upload it), and optionally connect Google Calendar. An AI Agent monitors activity, converts high-level plans into executable tasks, pushes reminders and end-of-day summaries via WhatsApp (Twilio), records completions reported via WhatsApp or the web dashboard, and generates weekly progress metrics and leaderboard awards. Long-term: issue monthly Sui-based NFT awards for top performers.

---

# 2. Objectives & Success Metrics

**Primary goals**

- Help users reliably follow their Daily Rules (pre-read, post-review, daily P1 focus, workout).
- Make task execution frictionless via natural WhatsApp interactions.
- Produce measurable improvement in weekly consistency and task completion.

**Success metrics (first 12 weeks)**

- Daily Active Users (DAU) / Weekly Active Users (WAU)
- % of planned tasks completed per user per day (target MVP: +50% completion baseline)
- Weekly retention (target: 30%+)
- % of tasks completed via WhatsApp (target: 40% of completions)
- Accuracy of timetable parsing (target: 90% correct extractions)
- Engagement: Avg messages per user per day from agent (target: 2–4)

---

# 3. Scope (MVP vs Later)

**MVP (Phase 1)**

- User signup & onboarding (reason for using app, role)
- Manual task entry, recurring task support (daily / bi-weekly / monthly)
- Upload timetable PDF / image — basic timetable extraction + placement
- Google Calendar sync (read-only events)
- Dashboard: today’s tasks, timetable view, start time, progress bar
- AI Agent: daily morning WhatsApp summary, on-time & 30-min reminders, end-of-day summary
- Mark task complete via WhatsApp message (natural language: “done X”)
- Basic analytics: daily completion %, weekly summary
- Phone-number verification to link WhatsApp to user account
- Twilio WhatsApp integration

**Phase 2**

- Two-way calendar sync (write-back)
- Leaderboard, weekly awards, and Sui-based monthly NFT awards
- Wallet signup (Sui / Slush wallet address) and wallet–phone mapping verification
- Walrus integration for storage (persist user data & agent logs)
- Rich AI insights (habit detection, adaptive scheduling)
- Multi-model AI: Gemini + Meta Llama 4 + fallback logic
- Admin dashboard for awards, leaderboards, and model telemetry

**Phase 3**

- Social features: groups / challenges
- Deep personalization: energy-aware scheduling
- Intelligent rescheduling and multi-day planning
- Mobile push notifications + in-app messages (besides WhatsApp)

---

# 4. Personas

1. **University Student (Primary)** — Has classes, uploads timetable, needs pre-read and post-review reminders, cares about weekly consistency and quick wins.
2. **Developer / Builder** — Prefers project-based deep-work evenings, wants strict focus windows and long builder-days.
3. **Lifelong Learner** — Uses courses and prefers a balance of course consumption and hands-on output.
4. **Competitive Achiever** — Motivated by leaderboards and awards (target for social & NFT features).

---

# 5. User Flows (high level)

1. **Signup / Onboarding**
   - Choose role and reason for using app (multi-select)
   - Verify phone number (OTP) -> links WhatsApp
   - Optionally connect Google Calendar
   - Upload timetable (PDF/photo/CSV) or manually create schedule
   - Set daily start time and workout preferences
2. **Daily Routine**
   - Morning: AI agent sends WhatsApp “today’s tasks” at user-defined start time
   - User executes tasks. To mark complete: reply via WhatsApp (“done”, “finished X”, tick button)
   - AI Agent updates dashboard in real-time
   - For tasks with assigned times: AI sends 30-min and on-time WhatsApp reminder
   - Evening: agent sends end-of-day summary with completed / incomplete list and congratulates or nudges
3. **Task Management**
   - Create tasks (dashboard or WhatsApp message)
   - Define recurrence, priority, estimated duration
   - Upload or edit timetable on dashboard
   - AI suggests concrete execution tasks for abstract goals (e.g., “Build 2 components”)
4. **Weekly & Rewards**
   - Weekly leaderboard based on completion%, consistency
   - Monthly award (Phase 2): Sui NFT minted to winner’s wallet (requires wallet verification + phone link)

---

# 6. Functional Requirements

## 6.1 Onboarding

- FR-ON-01: User provides role and reason; stored as profile metadata.
- FR-ON-02: Phone verification via OTP; phone number used to link Twilio WhatsApp identity.
- FR-ON-03: Optional Sui wallet connect (Slush wallet address) with clear verification flow.

## 6.2 Schedule Input & Parsing

- FR-SCH-01: Upload timetable (PDF, image, CSV). System extracts classes, times, and course names.
- FR-SCH-02: Map extracted timetable to daily slots and detect conflicts.
- FR-SCH-03: Manual timetable editor for corrections.

## 6.3 Calendar Integration

- FR-CAL-01: Connect Google Calendar (OAuth) for read access to events.
- FR-CAL-02: Import events into agent workspace as “input” items (courses, meetings).
- FR-CAL-03: Distinguish event type: fixed-time vs flexible tasks.

## 6.4 Tasks & Recurrence

- FR-TASK-01: Create tasks with name, description, start time (optional), recurrence (daily / bi-weekly / monthly), estimated duration, and category (Academic / P1 / Workout / Admin).
- FR-TASK-02: Allow quick-create via WhatsApp: natural language -> task creation.
- FR-TASK-03: Allow marking tasks complete via WhatsApp or dashboard.

## 6.5 AI Agent Behavior

- FR-AI-01: Maintain internal representation of user rules (before class pre-read; after class review; daily P1 focus; workout).
- FR-AI-02: Generate daily actionable tasks from higher-level themes.
- FR-AI-03: Monitor task states and user messages; update dashboard.
- FR-AI-04: Send scheduled WhatsApp messages:
  - Morning summary at user start time.
  - 30-min before and at task start time for timed tasks.
  - End-of-day summary (list completed, incomplete; weekly %).
- FR-AI-05: Send congratulatory or corrective tone based on completion (configurable tone).
- FR-AI-06: Provide weekly analytics and insights on dashboard.

## 6.6 Notifications & WhatsApp

- FR-WH-01: Twilio/WhatsApp integration to send/receive messages.
- FR-WH-02: Map incoming WhatsApp messages to user and intent (e.g., mark-complete, add-task, ask status).
- FR-WH-03: Ensure message templates comply with WhatsApp Business policies (session messages, notifications).
- FR-WH-04: Allow user to temporarily “snooze” reminders for a day.

## 6.7 Leaderboard & Awards

- FR-LB-01: Public leaderboard displaying weekly top users (by completion %, streak, or other metrics).
- FR-LB-02: Weekly award categories (most consistent, hardest grinder, most improved).
- FR-LB-03: Monthly Sui NFT award minting to wallet (Phase 2) — only for users who have verified wallet & phone.

---

# 7. Non-Functional Requirements

- **Scalability:** Handle thousands of users and WhatsApp messages concurrently (Twilio queueing, autoscaled worker pool).
- **Availability:** 99.5% uptime for notification delivery and dashboard reads.
- **Latency:** Notifications delivered within WhatsApp session constraints (near real-time for scheduled messages).
- **Security:** All phone numbers and wallet addresses stored encrypted; OTP and 2FA support.
- **Privacy:** Comply with local data laws; clear consent for data sharing; retain message logs only per policy.

---

# 8. Data Model (core entities)

- **User**: id, name, role, phone_number (verified), email, start_time, preferences, slush_wallet_address (optional), onboarding_metadata
- **Task**: id, user_id, title, description, category, recurrence, start_time, duration_est, status (todo/started/done), created_via (web/whatsapp)
- **TimetableEvent**: id, user_id, course_name, day_of_week, start_time, end_time, location, source_file
- **CalendarEvent**: id, user_id, provider_id, provider (google), title, start, end, read_only_flag
- **MessageLog**: id, user_id, direction, content, timestamp, intent_label
- **Award**: id, user_id, type, period, minted (bool), token_id
- **AgentState**: user_id, daily_plan, last_sync, habits_detected

---

# 9. Integration Design & Tech Stack

**Frontend**

- React + Next.js (optional)
- Dashboard UI: today view, timetable view, task list, analytics

**Backend**

- Node.js / TypeScript (or Rust for parts) — API server, worker queues
- Database: PostgreSQL (primary), Redis (cache & real-time state)
- Object storage: Walrus (as requested) or S3-compatible for uploaded timetables and agent logs

**AI & ML**

- Models: Gemini (Google) + Meta Llama 4 (local/hosted) for NLU, timetable extraction, and planning. Use ensemble + fallback logic.
- Lightweight fine-tuned models for:
  - Timetable extraction (OCR + pattern detection)
  - NLU for WhatsApp commands (intent classification / slot extraction)
  - Planner for generating concrete tasks from abstract themes

**Messaging & Notifications**

- Twilio WhatsApp API for send/receive
- Template messages registered with WhatsApp Business API for scheduled notifications

**Blockchain / Wallet**

- Sui Stack for NFT awards
- Wallet verification using Slush wallet address + proof flow
- Minting flow (Phase 2): on award, mint NFT, store token_id in Award record

**Storage**

- Walrus for storing uploaded timetables and agent-readable logs (if compatible)
- Ensure AI agent can read relevant files (indexing + metadata)

---

# 10. Security & Privacy

- Phone number verification required to map WhatsApp identity to user.
- End-to-end security for sensitive fields in DB (wallet addresses, tokens).
- Consent flow for WhatsApp messages and calendar access.
- Retention policy for message logs; allow user to delete conversation history.
- Rate-limiting and anti-abuse (prevent spam, ensure Twilio quotas respected).
- GDPR-like controls: export user data, delete account.

---

# 11. Analytics & Reporting

- Daily summary metrics on dashboard per user: planned vs done, P1 consistency, workout streaks.
- Admin analytics: DAU, WAU, average completion rate, weekly leaderboard dynamics.
- Model telemetry: NLU accuracy for WhatsApp intents, timetable extraction accuracy.
- For award logic: compute weekly consistency score and validate before minting.

---

# 12. Admin / Moderation Tools

- Admin console to:
  - View user profiles, verify wallets
  - Approve/trigger NFT minting
  - Inspect agent logs & message history (for debugging)
  - Manage WhatsApp templates and Twilio usage
  - Export metrics

---

# 13. Roadmap & Milestones

**Sprint 0 (setup)**: infra, Twilio sandbox, Google OAuth, DB, basic API, storage (Walrus or S3)

**Sprint 1 (MVP core)**: signup, phone verification, manual tasks, timetable upload + basic extraction, Google Calendar import (read), WhatsApp morning + EOD summaries, mark-complete via WhatsApp, dashboard (today/timetable/progress)

**Sprint 2**: Scheduled reminders (30-min/on-time), recurrence engine, simple AI task generation, analytics

**Sprint 3**: Leaderboard, weekly awards logic, admin tools

**Sprint 4 (Phase 2)**: Wallet verification, Sui minting flow, Walrus deep integration, advanced model stack (Gemini + Llama 4)

**Ongoing**: performance optimization, A/B tests for reminder tone & cadence, social features

---

# 14. Risks & Mitigations

- **WhatsApp/Twilio rate limits or policy changes.** Mitigate: graceful fallback to SMS or email; use session messages and templates correctly.
- **Timetable extraction errors.** Mitigate: provide robust manual correction UI and user verification step after import.
- **Wallet–phone mapping fraud.** Mitigate: require phone verification + on-chain signature where feasible.
- **AI hallucination (bad task suggestions).** Mitigate: conservative planner, human-in-the-loop confirmations for major changes.
- **Data privacy concerns.** Mitigate: transparent consent, delete/export tools, encrypted storage.

---

# 15. Acceptance Criteria (MVP)

- Users can sign up, verify phone, and link WhatsApp number.
- Users can upload a timetable (PDF/image) and the system extracts at least 80% of events correctly (editable).
- Users can connect Google Calendar and see their events in the dashboard.
- AI Agent sends a morning WhatsApp summary at the user’s start_time and end-of-day summary at configured time.
- Users can mark tasks complete by replying to WhatsApp and the dashboard updates accordingly within 30 seconds.
- System supports timed reminders (30-min & on-time) for scheduled tasks via WhatsApp.
- Dashboard shows daily completion percentage and a simple weekly summary.
- Basic admin can view message logs and user progress.

---

# 16. Example Notification Templates

- **Morning summary:**
  “Good morning! Here’s your plan for _[Mon, Jan 12]_ — Pre-read FUTM-MCE 312 (30–45m); Classes at 10:00 & 13:00; Evening: JS/React deep-work 19:30–22:30. Reply ‘done [task name]’ when finished.”
- **30-min reminder:**
  “Reminder: _[Task name]_ starts in 30 minutes at _[time]_. Reply ‘snooze 30’ to snooze.”
- **On-time reminder:**
  “It’s time: _[Task name]_ — go! Reply ‘done’ when finished.”
- **End-of-day summary:**
  “Day complete. You finished 5/8 tasks (62%). Completed: [A, B]. Left: [C, D]. Great work — keep the streak!”
- **Add task (via WhatsApp):**
  User: “Add workout 6am daily” → Agent: “Added: Workout @ 06:00 (daily).”

---

# 17. Implementation Notes & Developer Guidance

- Use event-driven architecture: user actions + calendar events + WhatsApp messages produce events fed to a worker queue for AI processing.
- Maintain an agent state machine per user to avoid duplicate notifications and ensure idempotency.
- Keep message templates localized and allowed by WhatsApp Business policy. Use templated notifications for scheduled messages and session messages for replies.
- Implement a sandbox Twilio/WhatsApp testing environment to validate flows before production.

---

# 18. Future Enhancements (examples)

- Natural voice check-ins (voice messages via WhatsApp)
- Energy/time-aware scheduling (optimize P1 sessions for user’s circadian rhythm)
- Cross-platform clients (mobile app with push notifications)
- Mentor-mode: coaches can follow student progress (permissioned)
- Marketplace for predefined study plans (shareable templates)

---

# 19. Open decisions / items to finalize

- Exact award minting economics and fees (who pays gas/fees).
- Tone personalization (how strict / encouraging agent language is by default).
- Walrus compatibility details (confirm API & read pattern needed by AI).
- Whether the app writes back to Google Calendar (Phase 2) or stays read-only long-term.

# A. DEVELOPMENT PHASES (END-TO-END)

These phases are **functional layers**, not just sprints. Each phase adds _capability_ without breaking earlier ones.

---

## **PHASE 0 — SYSTEM FOUNDATION (Non-Negotiable Base)**

### Goal

Establish a stable, event-driven backbone that everything else plugs into.

### What is built

- Backend API (auth, users, tasks, events)
- Database schema (User, Task, AgentState, MessageLog)
- Event bus / job queue (for reminders, agent actions)
- Twilio WhatsApp webhook (receive + send)
- Dashboard shell (read-only initially)

### Why this phase matters

The AI agent **does not exist** without a reliable event + state system. This phase prevents chaos later.

---

## **PHASE 1 — CORE TASK EXECUTION LOOP (MVP HEART)**

### Goal

Prove the product’s core value: _plan → remind → execute → reflect_.

### What is built

- User onboarding + phone verification
- Manual task creation (dashboard + WhatsApp)
- Recurring tasks (daily / weekly / monthly)
- AI Agent v1:
  - Morning summary
  - Timed reminders (30 min + on time)
  - End-of-day summary
- WhatsApp:
  - “done”, “add task”, “status”
- Dashboard:
  - Today view
  - Completion %
  - Task list

### Output

✅ Users execute real tasks

✅ WhatsApp becomes the primary interface

✅ Agent proves accountability value

---

## **PHASE 2 — SCHEDULE INTELLIGENCE (TIME + CONTEXT)**

### Goal

Move from tasks → **structured days**.

### What is built

- Timetable upload (PDF/image/CSV)
- OCR + extraction + user confirmation
- Google Calendar read-only sync
- Conflict detection (class vs task)
- Agent learns:
  - Fixed events vs flexible tasks
  - Academic vs Deep Work vs Workout

### Output

✅ Agent understands _when_ user is busy

✅ Better reminder timing

✅ Fewer false nudges

---

## **PHASE 3 — AI AGENT INTELLIGENCE (RULE-DRIVEN)**

### Goal

Turn the agent from a notifier into a **decision-maker (within rules)**.

### What is built

- Daily rule engine:
  - Pre-read before class
  - Post-review after class
  - Daily P1 focus
  - Workout non-negotiable
- Task generation from themes
- Behavior tracking (missed tasks, streaks)
- Weekly summaries + insights

### Output

✅ Agent reasons, not just reminds

✅ Users feel “guided”, not spammed

---

## **PHASE 4 — GAMIFICATION + STATUS (SOCIAL PROOF)**

### Goal

Increase motivation without hurting average users.

### What is built

- Weekly leaderboard
- Award categories (not just rank #1)
- Admin scoring logic
- Dashboard leaderboard view

### Output

✅ Motivation layer

✅ Retention boost

---

## **PHASE 5 — WEB3 + STORAGE (TRUST + OWNERSHIP)**

### Goal

Reward consistency with **verifiable ownership**.

### What is built

- Wallet connect (Slush)
- Phone ↔ wallet verification
- Monthly NFT minting on Sui
- Walrus storage for:
  - Timetables
  - Agent logs
  - Historical summaries

### Output

✅ Long-term identity

✅ Proof of consistency

✅ Differentiation moat

---

# B. AI AGENT DECISION RULES (CRITICAL)

The agent is **rule-first, AI-second**.

---

## **Agent Core Principles**

1. **Never invent tasks**
2. **Never break fixed events**
3. **Never change schedule without user input**
4. **Prefer reminders over rescheduling**
5. **Ask before acting when unsure**

---

## **Agent Daily Decision Flow**

### 1. Day Initialization

```
IF new day:
load timetable
load calendar events
load recurring tasks
  apply daily rules
  generate daily_plan

```

---

### 2. Task Classification

Each task is tagged as:

- FIXED (class, meeting)
- FLEXIBLE (study, coding)
- HEALTH (workout)
- ADMIN

Rules:

- Fixed > Health > P1 > Others
- Health can’t be skipped twice in a row
- P1 must exist daily

---

### 3. Reminder Logic

```
IF task hastime:
send T-30 reminder
send on-time reminder
ELSE:
  include in morning summary

```

---

### 4. Completion Logic

```
IFuser says "done X":
  mark task completed
update streaks
  recalc completion%

```

---

### 5. End-of-Day Evaluation

```
completion_rate = completed / planned

IF completion_rate ==100%:
  congratulatory tone
ELSE IF completion_rate >=60%:
  encouraging tone
ELSE:
  corrective tone

```

Tone is configurable.

---

# C. WHATSAPP CONVERSATION PROTOCOL

This is **not free chat**. It’s a **command-aware interface**.

---

## **Supported Intents**

### 1. Task Completion

**User**

```
done
done workout
finished react session

```

**Agent**

```
Marked “React DeepWork”as completed ✅

```

---

### 2. Add Task

**User**

```
add workout6am daily
add study math tomorrow8pm

```

Parsed as:

- Title
- Time (optional)
- Recurrence (optional)

---

### 3. Status Check

**User**

```
status
what’sleft

```

**Agent**

```
You have2 tasksleft today:
• Workout
• React deep work

```

---

### 4. Snooze

**User**

```
snooze30
snooze today

```

---

### 5. Help / Clarification

**User**

```
help

```

---

## Message Types

- **Template messages**: reminders, summaries
- **Session messages**: replies, confirmations

(WhatsApp policy compliant)

---

# D. CORE DATA MODEL + STATE MACHINE

---

## **Key Entities (Expanded)**

### User

```
id
role
phone_verified
wallet_address
start_time
preferences

```

---

### Task

```
id
user_id
title
category
is_fixed
start_time
recurrence
status

```

---

### AgentState

```
user_id
current_day_state
daily_plan
last_message_sent
streaks

```

---

## **Task State Machine**

```
PLANNED
  ↓
NOTIFIED
  ↓
IN_PROGRESS
  ↓
COMPLETED
  ↓
ARCHIVED

```

Failures:

```
PLANNED → MISSED

```

---

## **Agent State Machine**

```
IDLE
 ↓
DAY_INITIALIZED
 ↓
REMINDING
 ↓
WAITING_FOR_USER
 ↓
EVALUATING
 ↓
DAY_CLOSED

```

This prevents:

- Duplicate messages
- Double reminders
- Wrong summaries

# Agent Rule Engine — Pseudocode

Design choices: rule-first, conservative (ask before changing), idempotent, event-driven.

```
# Data structures
User {
  id, start_time, preferences, phone_verified, timezone, tone_config
}

Task {
  id, user_id, title, category, is_fixed, start_time, end_time, duration_est,
  recurrence (json), status, created_via, priority, metadata (json)
}

AgentState {
  user_id, date, daily_plan (list of planned task ids + schedule),
  last_message_sent_at, snooze_until, streaks, habits_detected
}

# Rule constants
MIN_P1_DAILY = 1  # at least one P1 slot a day
MAX_DEEP_BLOCK = 4h
MIN_BUFFER = 10m
WORKOUT_REQUIRED_STREAK_LIMIT = 2 # cannot skip more than 2 days in row
CONFIDENCE_THRESHOLD = 0.65

# Main loop (runs once at user's start_time or at midnight for next-day plan)
function initialize_day(user, date):
  state = AgentState.load_or_create(user.id, date)
  timetable = load_timetable(user, date)
  calendar_events = load_calendar(user, date)
  recurring_tasks = load_recurring_tasks(user, date)
  outstanding_tasks = fetch_unfinished_tasks(user)
  plan = generate_daily_plan(user, timetable, calendar_events, recurring_tasks, outstanding_tasks)
  state.daily_plan = plan
  persist(state)
  send_morning_summary(user, plan)

# Task classification + prioritization
function classify_and_priority(tasks, timetable, user):
  for task in tasks:
    if task.is_fixed or conflicts_with_timetable(task, timetable):
      task.type = FIXED
      task.priority = VERY_HIGH
    else if task.category == "Workout":
      task.type = HEALTH
      task.priority = HIGH
    else if task.category == "P1":
      task.type = P1
      task.priority = HIGH
    else:
      task.type = FLEX
      task.priority = MEDIUM
  # Sort: FIXED -> HEALTH -> P1 -> FLEX, then by explicit priority and due date
  return sort_tasks_by_priority(tasks)

# Planner generator (calls detailed planner algorithm below)
function generate_daily_plan(user, timetable, calendar, recurring, outstanding):
  avail_windows = compute_available_windows(timetable, calendar, user.start_time, user.preferences)
  required_slots = enforce_non_negotiables(recurring, user) # pre-read, post-review, workout, P1
  plan = allocate_required_slots(avail_windows, required_slots)
  plan = fill_with_outstanding_tasks(plan, outstanding, avail_windows)
  plan = add_reminder_metadata(plan) # add 30-min & on-time flags, message templates
  return plan

# Incoming WhatsApp handler
function handle_incoming_message(user, message):
  intent, slots, conf = NLU.parse(message)
  if conf < CONFIDENCE_THRESHOLD:
    send_clarify_message(user, message)
    return
  switch intent:
    case "mark_complete":
      task = match_task(slots.task_name, user.daily_plan)
      if task:
        mark_task_done(user, task)
        send_confirmation(user, task)
      else:
        ask_which_task(user)
    case "add_task":
      task = create_task_from_slots(user, slots)
      insert_into_plan(user, task)
      send_creation_confirmation(user, task)
    case "status":
      status = build_status(user)
      send_status(user, status)
    case "snooze":
      state.snooze_until = compute_snooze_time(slots)
      persist(state)
      send_ack(user)
    case "help":
      send_help(user)
    default:
      send_fallback(user)

# End-of-day evaluation
function close_day(user, date):
  state = AgentState.load(user.id, date)
  completed = count_completed(state.daily_plan)
  planned = count_planned(state.daily_plan)
  rate = completed / max(planned,1)
  tone = choose_tone(rate, user.tone_config)
  send_eod_summary(user, state.daily_plan, rate, tone)
  update_streaks_and_metrics(user, state.daily_plan)
  archive_day_state(state)

```

Key safety rules embedded: never reschedule a FIXED event; always ask before altering confirmed slotted times; accept “done” only if the mapped task is uniquely identified; confirm ambiguous instructions.

---

# WhatsApp Intent Parsing — NLU Schema

Design: intent-based NLU with slot extraction + lightweight rule fallback. Use an ensemble of a small LLM + regex/time-parsing util (Duckling or similar).

## Intents & Slots (primary)

```json
[
  {
    "intent": "mark_complete",
    "examples": [
      "done",
      "done [task_name]",
      "finished [task_name]",
      "i've completed [task_name]"
    ],
    "slots": [{ "name": "task_name", "type": "TEXT", "required": false }],
    "action": "mark_task_done"
  },
  {
    "intent": "add_task",
    "examples": [
      "add [task_name] [time] [recurrence]",
      "remind me to [task_name] at [time] tomorrow",
      "add workout 6am daily"
    ],
    "slots": [
      { "name": "task_name", "type": "TEXT", "required": true },
      { "name": "datetime", "type": "DATETIME", "required": false },
      { "name": "recurrence", "type": "RECURRENCE", "required": false },
      { "name": "category", "type": "CATEGORY", "required": false }
    ],
    "action": "create_task"
  },
  {
    "intent": "status",
    "examples": [
      "status",
      "what's left",
      "what am i doing today",
      "show me my tasks"
    ],
    "slots": [],
    "action": "send_status"
  },
  {
    "intent": "snooze",
    "examples": ["snooze 30", "snooze for today", "snooze 2h"],
    "slots": [{ "name": "duration", "type": "DURATION", "required": true }],
    "action": "set_snooze"
  },
  {
    "intent": "reschedule",
    "examples": [
      "move [task_name] to [datetime]",
      "reschedule [task_name] tomorrow 8pm"
    ],
    "slots": [
      { "name": "task_name", "type": "TEXT", "required": true },
      { "name": "datetime", "type": "DATETIME", "required": true }
    ],
    "action": "reschedule_task"
  },
  {
    "intent": "help",
    "examples": ["help", "commands", "what can you do"],
    "slots": [],
    "action": "send_help"
  }
]
```

## Slot types & extraction

- `DATETIME`: use timeparser + timezone normalization. Accept natural forms: "6am", "tomorrow 7pm", "next Monday".
- `DURATION`: parse "30", "30m", "2 hours".
- `RECURRENCE`: normalized to RFC 5545 rule e.g. `FREQ=DAILY` or `FREQ=WEEKLY;INTERVAL=2`.
- `CATEGORY`: enum: [Academic, P1, Workout, Admin, Other].
- `TEXT`: free text for task names; use fuzzy matching against current tasks.

## Confidence & Fallbacks

- If NLU confidence < 0.65 -> ask clarifying question.
- If `task_name` ambiguous (multiple matches) -> reply with numbered options and expect user selection: "Do you mean (1) React Deep Work, (2) React Reading?"
- If time ambiguous ("6"), ask "6 AM or 6 PM?"
- Use quick replies (WhatsApp buttons) for disambiguation where supported.

## Session & Context

- Keep 5-turn conversational context for each user to resolve pronouns: "done that" -> map to last mentioned task.
- Short-term context keys: `last_mentioned_task_id`, `last_sent_summary_id`.

## Example templates & flows

- User: "done"
  Agent: "Which task did you finish? 1) Workout 2) React Deep Work" (buttons)
- User: "add workout 6am daily"
  Agent: "Added Workout @ 06:00 (daily). Want me to set a 30-min reminder? (Yes / No)"

## Monitoring & Retraining

- Log all messages + NLU outputs to `MessageLog`.
- Compute intent accuracy weekly; if accuracy < 90% for common intents, retrain or add rule-based exceptions.

---

# Database Schema (Postgres SQL — core tables)

I included indexes and JSONB where flexible. Sensitive fields should be encrypted at rest (application-layer or DB-level with pgcrypto).

```sql
-- Users
CREATE TABLE users (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone_number TEXT,-- store encrypted
  phone_verifiedBOOLEANDEFAULTFALSE,
  start_timeTIME,
  timezone TEXTDEFAULT'Africa/Lagos',
  role TEXT,
  preferences JSONB,
  tone_config JSONB,
  created_at TIMESTAMPTZDEFAULT now(),
  updated_at TIMESTAMPTZDEFAULT now()
);
CREATE INDEX idx_users_phoneON users((phone_number));

-- Wallets
CREATE TABLE wallets (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  slush_address TEXT,
  verifiedBOOLEANDEFAULTFALSE,
  verification_proof JSONB,
  created_at TIMESTAMPTZDEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  title TEXTNOT NULL,
  description TEXT,
  category TEXT,-- Academic, P1, Workout, Admin, Other
  is_fixedBOOLEANDEFAULTFALSE,
  start_time TIMESTAMPTZ,-- optional scheduled time
  end_time TIMESTAMPTZ,
  duration_minutesINT,
  recurrence JSONB,-- e.g. { "freq":"DAILY", "interval":1 }
  status TEXTDEFAULT'todo',-- todo/started/done/archived/missed
  priorityINTDEFAULT5,
  created_via TEXT,-- 'web'|'whatsapp'|'calendar'
  metadata JSONB,
  created_at TIMESTAMPTZDEFAULT now(),
  updated_at TIMESTAMPTZDEFAULT now()
);
CREATE INDEX idx_tasks_user_statusON tasks(user_id, status);
CREATE INDEX idx_tasks_start_timeON tasks(start_time);

-- Timetable events (extracted)
CREATE TABLE timetable_events (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  course_name TEXT,
  day_of_weekINT,-- 0=Mon ... 6=Sun (or use text)
  start_timeTIME,
  end_timeTIME,
  location TEXT,
  source_file TEXT,-- path to Walrus/S3
  raw_extraction JSONB,
  created_at TIMESTAMPTZDEFAULT now()
);

-- Calendar events (Google)
CREATE TABLE calendar_events (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  provider_id TEXT,
  provider TEXT,-- 'google'
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  read_onlyBOOLEANDEFAULTTRUE,
  raw_event JSONB,
  created_at TIMESTAMPTZDEFAULT now()
);
CREATE INDEX idx_cal_events_user_startON calendar_events(user_id, start_time);

-- Message logs
CREATE TABLE message_logs (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  direction TEXT,-- 'inbound'|'outbound'
  channel TEXT,-- 'whatsapp'|'web'
  content TEXT,
  parsed_intent TEXT,
  parsed_slots JSONB,
  confidenceFLOAT,
  created_at TIMESTAMPTZDEFAULT now()
);
CREATE INDEX idx_msg_user_timeON message_logs(user_id, created_at);

-- Agent state
CREATE TABLE agent_states (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
dateDATE,
  daily_plan JSONB,-- ordered plan with scheduled times, reminder flags
  last_message_sent_at TIMESTAMPTZ,
  snooze_until TIMESTAMPTZ,
  streaks JSONB,
  habits_detected JSONB,
  created_at TIMESTAMPTZDEFAULT now(),
  updated_at TIMESTAMPTZDEFAULT now()
);
CREATEUNIQUE INDEX uq_agent_state_user_dateON agent_states(user_id,date);

-- Awards
CREATE TABLE awards (
  id UUIDPRIMARY KEYDEFAULT gen_random_uuid(),
  user_id UUIDREFERENCES users(id)ONDELETE CASCADE,
  type TEXT,-- weekly_consistency, hard_grinder, monthly_nft
  period_startDATE,
  period_endDATE,
  mintedBOOLEANDEFAULTFALSE,
  token_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZDEFAULT now()
);

```

Notes:

- Encrypt `phone_number`, `slush_address` at rest.
- Use JSONB for `daily_plan` so agent logic can store complex scheduling results.
- Add audit table `task_history` recording changes to tasks (status, timestamps).

---

# Daily Planner Algorithm — Pseudocode + Heuristics

Goal: given a user's day (timetable + calendar + preferences + tasks), output an ordered daily_plan with scheduled slots and reminder metadata.

### Inputs

- `user` (prefs, start_time, timezone)
- `date`
- `timetable_events` (fixed class blocks)
- `calendar_events` (from Google)
- `tasks` (todo + recurring)
- `preferences` (max_deep_block, quiet_hours, workout_time windows, focus windows)

### Outputs

- `daily_plan`: list of items `{task_id, title, type, scheduled_start, scheduled_end, reminder_offsets, reminder_templates}`

```
function plan_day(user, date):
  fixed_blocks = union(timetable_events(date), calendar_events(date))
  work_windows = compute_available_windows(user.start_time, fixed_blocks, user.preferences)
  # ensure morning pre-read window (if classes exist)
  if classes_today(fixed_blocks):
    pre_read_window = allocate_window_before_first_class(work_windows, duration=30-60m)
    reserve(pre_read_window, label="Pre-read")
  # ensure post-review
  post_review_window = allocate_window_after_last_class_or_next_morning(work_windows, duration=20-30m)
  reserve(post_review_window, label="Post-review")
  # ensure workout slot
  workout_window = find_preferred_workout_window(user.preferences, work_windows)
  reserve(workout_window, label="Workout")
  # ensure P1 daily
  if not exists_task_of_category(tasks,"P1") and user.preferences.auto_generate_P1:
    create_suggestion_task(user, date, "P1 Focus (auto)", duration=90m)
  # allocate P1 into evening deep-work window
  deep_windows = select_windows_for_deep_work(work_windows, min_length=60m)
  allocate_task_of_category(tasks, "P1", into=best_deep_window(deep_windows))
  # schedule remaining flexible tasks by priority and duration
  flexible_tasks = sort_by_priority_and_due(tasks)
  for t in flexible_tasks:
    slot = find_first_fit_slot(t.duration, work_windows)
    if slot:
      schedule(t, slot.start, slot.start + t.duration)
      block(slot.start, slot.start + t.duration)
  # add 10m buffers between scheduled items
  apply_buffers_to_plan(daily_plan, MIN_BUFFER)
  # set reminders for timed tasks: [T-30, T-0]
  for item in daily_plan:
    if item.scheduled_start:
      item.reminders = [30m, 0m]
  # fallback: if some tasks un-scheduled, add to 'Available todo' in morning summary
  return daily_plan

```

### Heuristics & constraints

- `Fixed events` cannot be moved or overridden.
- Do not schedule > `MAX_DEEP_BLOCK` in a single block; split if needed.
- Avoid scheduling intense P1 immediately after a class; add 30–60m buffer.
- Reserve at least one deep-work block each evening 19:30–22:30 unless user preferences differ.
- Prefer to schedule the highest-priority tasks earlier in the day when possible.
- If user has > 6 hours of planned focused work, create a warning and propose splitting across days.
- If workout skipped `WORKOUT_REQUIRED_STREAK_LIMIT` days, escalate a reminder tone.

### Complexity

- Most operations are sorting and interval allocation -> O(n log n) for n tasks + m windows.
