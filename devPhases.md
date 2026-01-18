# Tenax Development Phases - Phase 0 to Hackathon Ready

---

## **PHASE 0 — SYSTEM FOUNDATION** ✅

### Goal

Establish stable, event-driven backbone that everything else plugs into.

### What to Build

- Backend API (Node.js/Express) with auth, users, tasks endpoints
- PostgreSQL database with core schema (users, tasks, agent_states, message_logs)
- Redis + Bull job queue for scheduled messages
- Twilio WhatsApp webhook (send/receive)
- Basic React dashboard shell
- Health check endpoint

### Expected Outcome

✅ Backend server running with database connected  
✅ WhatsApp webhook receiving messages  
✅ Job queue processing scheduled tasks  
✅ Dashboard displays basic UI  
✅ Foundation ready for agent logic

---

## **PHASE 1 — CORE EXECUTION LOOP + OPIK FOUNDATION** ⭐

### Goal

Prove the product's core value: plan → remind → execute → reflect.
**Build with Opik tracing from day 1.**

### What to Build

**Core Features:**

- User onboarding flow with phone verification
- Manual task creation (dashboard + WhatsApp)
- Recurring task engine (daily/weekly/monthly)
- Basic AI agent with:
  - Morning summary generation
  - Timed reminders (30-min + on-time)
  - End-of-day summary
- WhatsApp intent parsing ("done", "status", "add task")
- Task completion tracking
- Dashboard today view with completion percentage

**Opik Integration (Built-In):**

- Install Opik SDK: `pip install opik`
- Configure: `opik configure` with API key
- Add `@track` decorator to all agent functions:
  - `generate_morning_summary()`
  - `send_reminder()`
  - `parse_whatsapp_intent()`
  - `mark_task_complete()`
- One-line OpenAI integration: `opik.integrations.openai.track_openai()`
- Log metadata: user_id, task_id, agent_version
- Capture inputs, outputs, timestamps for every action

**Evaluation Metrics (Start Tracking):**

- Task completion rate (before/after reminder)
- Intent parsing accuracy (Levenshtein distance)
- Response latency
- User engagement (messages per day)

### Expected Outcome

✅ Users can create and complete tasks via WhatsApp  
✅ Agent sends scheduled reminders automatically  
✅ Dashboard shows real-time task status  
✅ Core execution loop functional end-to-end  
✅ **Every agent action traced in Opik**  
✅ **Baseline metrics established**

---

## **PHASE 2 — ADVANCED OPIK EVALUATION & LLM-AS-JUDGE**

### Goal

Move beyond basic tracing to systematic evaluation and quality scoring.

### What to Build

**Online Evaluation (Real-Time):**

- LLM-as-Judge evaluators in Opik UI:
  - **Tone Appropriateness** (1-5): Is the message supportive, not annoying?
  - **Task Specificity** (1-5): Are tasks actionable and clear?
  - **Plan Realism** (1-5): Is the daily plan achievable?
  - **Relevance** (1-5): Does the response match user intent?
- Configure GPT-4 as judge model
- Auto-score every agent output
- Set thresholds for alerts (e.g., tone < 3)

**Human Feedback Loop:**

- Manual scoring interface for calibration
- Compare human scores vs LLM-as-Judge
- Adjust judge prompts based on disagreements
- Build ground truth dataset

**Regression Testing:**

- Create datasets from failed traces:
  - Low-scoring messages
  - Parsing errors
  - Missed reminders
- Run new agent versions against datasets
- Prevent regressions before deployment

**Advanced Metrics:**

- Completion latency distribution
- Streak maintenance rate
- Time-of-day effectiveness patterns
- User drop-off analysis

### Expected Outcome

✅ Every agent output scored automatically  
✅ Human feedback calibrates LLM judges  
✅ Regression test suite prevents quality drops  
✅ Clear quality trends visible in Opik dashboard

---

## **PHASE 3 — AGENT INTELLIGENCE & RULE ENGINE**

### Goal

Transform agent from notifier to intelligent decision-maker.

### What to Build

- Daily rule engine implementation:
  - Pre-read before class
  - Post-review after class
  - Daily P1 focus enforcement
  - Workout non-negotiable tracking
- Task classification system (FIXED, FLEXIBLE, HEALTH, P1)
- Priority-based scheduling algorithm
- Behavior tracking (missed tasks, streaks, patterns)
- Adaptive tone system (congratulatory/encouraging/corrective)
- Weekly summary generation with insights

### Expected Outcome

✅ Agent generates intelligent daily plans  
✅ Rules enforced automatically  
✅ Users feel guided, not spammed  
✅ Agent adapts tone based on performance

---

## **PHASE 4 — SCHEDULE INTELLIGENCE**

### Goal

Move from tasks → structured days with context awareness.

### What to Build

- Timetable upload (PDF/image/CSV)
- OCR + extraction pipeline
- Manual timetable editor for corrections
- Google Calendar OAuth integration (read-only)
- Calendar event import and sync
- Conflict detection (class vs task)
- Available time window calculation
- Smart reminder timing based on schedule

### Expected Outcome

✅ Agent understands when user is busy  
✅ Reminders sent at optimal times  
✅ No conflicts between fixed events and tasks  
✅ Better task scheduling recommendations

---

## **PHASE 5 — OPIK OPTIMIZER & SELF-IMPROVING AGENT** ⭐

### Goal

Automate agent improvement using Opik Optimizer SDK.

### What to Build

**Opik Optimizer Integration:**

- Install: `pip install opik-optimizer`
- Define optimization targets:
  - Reminder effectiveness (completion rate)
  - Intent parsing accuracy (Levenshtein distance)
  - Message tone quality (LLM-as-Judge score)

**HRPO (Hierarchical Reflective) Optimization:**

- Analyze failed interactions:
  - Tasks not completed after reminder
  - Misunderstood user intents
  - Low tone scores
- Root cause analysis by LLM
- Generate improved prompt candidates
- Test candidates against dataset
- Promote best-performing prompts

**Evolutionary Optimization (GEPA):**

- Treat prompts as population
- Mutate and merge variants
- Evolve over generations
- Find optimal reminder phrasing

**Few-Shot Bayesian Optimization:**

- Optimize example selection for intent parsing
- Find best few-shot examples from dataset
- Improve parsing accuracy systematically

**A/B Testing Framework:**

- Agent variant system with experiment IDs
- Test configurations:
  - Reminder tone (conservative vs assertive)
  - Message frequency (morning-only vs mid-day)
  - Task breakdown detail level
- Opik experiment comparison dashboard
- Automated variant promotion based on metrics

### Expected Outcome

✅ Agent prompts improve automatically  
✅ Root cause analysis identifies failure patterns  
✅ Multiple variants tested simultaneously  
✅ Data-driven promotion of best performers  
✅ Continuous improvement without manual tuning

---

## **PHASE 6 — ENHANCED NLU & CONVERSATION**

### Goal

Make WhatsApp interaction more natural and context-aware.

### What to Build

- Advanced intent parser with confidence scoring
- Slot extraction for complex commands
- Multi-turn conversation context (5-turn memory)
- Disambiguation flows for ambiguous requests
- Quick reply buttons for confirmations
- Fuzzy task name matching
- Time parsing with timezone support
- Recurrence pattern recognition

### Expected Outcome

✅ Agent understands natural language variations  
✅ Handles ambiguous commands gracefully  
✅ Remembers conversation context  
✅ Fewer user frustrations with parsing

---

## **PHASE 7 — ANALYTICS & INSIGHTS DASHBOARD**

### Goal

Provide users and admins with actionable insights.

### What to Build

- User analytics dashboard:
  - Daily/weekly completion trends
  - Streak visualization
  - Category breakdown (Academic, P1, Workout)
  - Time-of-day productivity patterns
- Admin dashboard:
  - DAU/WAU metrics
  - Average completion rates
  - WhatsApp engagement metrics
  - Agent performance by variant
- Opik metrics integration in dashboard
- Export functionality for data analysis

### Expected Outcome

✅ Users see their progress and patterns  
✅ Admins monitor system health  
✅ Opik metrics accessible in-app  
✅ Data-driven user engagement

---

## **PHASE 8 — POLISH & HACKATHON PREP**

### Goal

Prepare compelling demo and ensure reliability.

### What to Build

- Demo user flow with sample data
- Error handling and edge case coverage
- Loading states and user feedback
- Mobile-responsive dashboard
- Demo video/presentation materials
- Opik dashboard screenshots and metrics
- Documentation:
  - How Opik is used
  - Evaluation methodology
  - Experiment results
- Performance optimization
- Bug fixes and stability improvements

### Expected Outcome

✅ Smooth, reliable demo experience  
✅ Clear narrative showing Opik value  
✅ Compelling metrics and visualizations  
✅ Professional presentation materials

---

## **PHASE 9 — HACKATHON READY** 🚀

### Goal

Final validation and deployment for hackathon submission.

### What to Build

- Production deployment (backend + frontend)
- Environment configuration for demo
- Test user accounts with realistic data
- Opik workspace configured and populated
- Submission materials:
  - Project description
  - Architecture diagram
  - Opik integration explanation
  - Demo video
  - Live demo link
- Backup plans for demo failures
- Team presentation rehearsal

### Expected Outcome

✅ System deployed and accessible  
✅ Opik dashboards showing real data  
✅ Demo flows tested and working  
✅ Submission complete and compelling  
✅ **READY TO WIN** 🏆

---

## **Success Criteria for Hackathon**

### Functionality

- [ ] End-to-end task execution loop works
- [ ] WhatsApp integration functional
- [ ] Agent makes intelligent decisions
- [ ] Dashboard shows real-time updates

### Opik Integration (Critical)

- [ ] All agent actions traced in Opik
- [ ] Behavioral metrics tracked and visualized
- [ ] Experiments running with comparison data
- [ ] Clear demonstration of outcome-based evaluation
- [ ] LLM-as-judge evaluations logged

### Real-World Impact

- [ ] Solves actual productivity problem
- [ ] Low-friction user experience
- [ ] Measurable behavior change demonstrated

### Presentation

- [ ] Clear narrative on why Opik matters
- [ ] Compelling metrics and visualizations
- [ ] Live demo or high-quality video
- [ ] Technical depth without overwhelming

---

- **Testing**

## **Timeline Estimate**

- **Phase 0**: ✅ Complete (2-3 days)
- **Phase 1**: 4-5 days (includes Opik tracing)
- **Phase 2**: 2-3 days (LLM-as-Judge + human feedback)
- **Phase 3**: 3-4 days (Agent intelligence)
- **Phase 4**: 2-3 days (Schedule intelligence)
- **Phase 5**: 3-4 days (Optimizer + experiments) ⭐
- **Phase 6**: 2 days (Enhanced NLU)
- **Phase 7**: 2 days (Analytics)
- **Phase 8**: 2-3 days (Polish)
- **Phase 9**: 1-2 days (Final prep)

**Total: ~3-4 weeks to hackathon ready**

**Fast Track (2 weeks):** Phase 0 → 1 → 2 → 3 → 5 → 8 → 9

---

## **Priority for Hackathon**

### Must Have (Core Demo)

1. Phase 0 ✅
2. Phase 1 (Execution loop + Opik tracing) ⭐ **START HERE**
3. Phase 2 (LLM-as-Judge evaluation) ⭐ **CRITICAL**
4. Phase 3 (Agent intelligence)

### Should Have (Strong Demo)

5. Phase 5 (Optimizer + experiments) ⭐ **DIFFERENTIATOR**
6. Phase 8 (Polish)
7. Phase 9 (Deployment)

### Nice to Have (Enhanced Demo)

8. Phase 4 (Schedule intelligence)
9. Phase 6 (Enhanced NLU)
10. Phase 7 (Analytics dashboard)

---

**LET'S GO BUILD AND WIN! 🚀🏆**
