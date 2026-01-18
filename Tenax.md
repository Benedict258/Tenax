# Personal Productivity AI, Product Requirements Document (PRD)

**Product name:** Tenax PRD

**Author:** Benedict Isaac

**Date:** 2026-01-10

**Audience:** Product, Engineering, ML, DevOps, Design, Growth

---

# HACKATHON FOCUS: Building a Measurable AI Execution Agent with Opik

## Overview

Tenax is an AI-powered execution agent designed to turn New Year's resolutions into real, measurable outcomes. Rather than acting as a passive planner or chatbot, Tenax operates as a persistent behavioral agent that converts high-level goals into daily executable actions, enforces follow-through via WhatsApp-based accountability, and evaluates its own effectiveness using structured observability and evaluation powered by **Opik**.

**Our core belief is simple:**

> Productivity systems should be evaluated by behavior change, not by response quality alone.

**Opik is central to how we build, evaluate, and improve Tenax.**

## Why Opik Is Critical to Tenax

Most LLM-based productivity tools fail because they:
- Generate plans without tracking execution
- Optimize prompts without measuring outcomes
- Lack observability into agent decisions over time

Tenax is explicitly built to avoid this by using **Opik as a first-class system component**, not a logging add-on.

We use Opik to:
1. **Trace agent decisions**
2. **Evaluate real-world outcomes**
3. **Compare agent variants**
4. **Iteratively improve habit enforcement**

This makes Tenax both functional and scientifically measurable.

## Agent Architecture (High-Level)

Each user is assigned a long-running AI agent with persistent state.

The agent:
- Maintains user goals, schedules, and habits
- Generates daily execution plans
- Sends reminders and accountability messages via WhatsApp
- Accepts task completions via natural language
- Evaluates whether its interventions actually lead to action

All of these steps are observable and measurable through Opik.

## How We Use Opik (Detailed)

### 1. Agent Tracing & Observability

Every meaningful agent action is logged as an Opik trace, including:
- Daily plan generation
- Reminder scheduling decisions
- WhatsApp message dispatches
- Intent parsing from user replies
- Task completion state changes

Each trace includes:
- Agent version
- Model version
- User context (anonymized)
- Input → decision → outcome chain
- Timestamp and tool usage

This allows us to reconstruct exactly why the agent acted and what happened next.

**Example trace:**
```
Event: ReminderSent
Context: Task = "JS Deep Work"
Decision: Send 30-min reminder
Outcome: Task completed within 65 minutes
```

This level of tracing is essential for debugging and improvement.

### 2. Outcome-Based Evaluation (Key Differentiator)

Instead of evaluating only text quality, Tenax evaluates **behavioral outcomes**.

We define clear success metrics and log them as Opik evaluations:
- Task completion rate
- Completion latency after reminder
- Daily execution percentage
- Weekly consistency score
- Streak length

**Core evaluation question:**
> Did the agent's action increase the likelihood of task completion?

Each reminder, plan, or nudge is evaluated against this question.

This aligns perfectly with the hackathon's focus on real-world impact.

### 3. LLM-as-Judge Evaluations (Used Carefully)

We use lightweight LLM-based evaluators for qualitative checks, such as:
- Is the daily plan realistic?
- Are tasks specific and actionable?
- Is the WhatsApp tone supportive, not annoying?
- Is the response compliant and safe?

These judges produce structured scores (e.g. 1–5) that are logged in Opik and correlated with execution outcomes.

**Crucially, LLM judgment is never the sole metric** — it is combined with behavioral data.

### 4. Agent Variant Experiments (Opik Experiments)

To improve Tenax systematically, we run controlled experiments using Opik.

**Examples:**
- Conservative vs assertive reminder tone
- Morning summary only vs morning + mid-day check-in
- Short task breakdowns vs detailed breakdowns

Each variant is:
- Tagged with an experiment ID
- Run against comparable user/task data
- Evaluated using the same outcome metrics

Opik dashboards allow us to compare:
- Completion rates
- Reminder effectiveness
- Drop-off points

This makes Tenax data-driven, not intuition-driven.

### 5. Human-in-the-Loop Validation

Tenax supports human confirmation for sensitive changes (e.g. schedule shifts).

We log:
- Agent suggestions
- User accept/reject decisions
- Downstream outcomes

This data is used to evaluate:
- Trustworthiness
- Over-automation risk
- Agent conservativeness

All logged and visualized through Opik.

## How Opik Shapes the Development Workflow

Opik is integrated into our daily development loop, not just the final demo.

**Workflow:**
1. Add or modify agent behavior
2. Tag new agent version
3. Run evaluation scenarios (real or simulated)
4. Compare against previous versions in Opik
5. Promote only versions that improve outcomes

This ensures:
- Regression safety
- Transparent improvement
- Explainable agent behavior

## Why This Matters for Productivity & Work Habits

Tenax directly addresses why productivity tools fail:
- People don't open apps
- Plans don't enforce action
- Habits aren't measured

By:
- Using WhatsApp as the execution surface
- Treating productivity as a behavioral system
- Evaluating outcomes with Opik

Tenax becomes a **habit enforcement engine**, not just a task manager.

## Alignment with Hackathon Judging Criteria

### Functionality
- End-to-end execution loop works reliably
- WhatsApp reminders, task completion, and dashboard updates are live

### Real-World Relevance
- Low-friction WhatsApp-based interaction
- Designed for real student and developer routines

### Use of LLMs / Agents
- Persistent agent with memory, tools, and autonomy
- LLMs used where appropriate, not everywhere

### Evaluation & Observability
- **Opik traces, evaluations, experiments, and dashboards**
- Behavioral metrics, not vanity metrics

### Goal Alignment (Best Use of Opik)
- Opik is embedded in the development and optimization process
- Agent quality improves through measured experiments
- Insights are visible and explainable

## Why Tenax Is a Strong Candidate for Best Use of Opik

Tenax demonstrates that:
- AI systems can be evaluated on human outcomes
- Observability enables safer, more effective agents
- Productivity tools can be both intelligent and accountable

By combining agent autonomy, real-world execution, and Opik-powered evaluation, Tenax embodies the exact spirit of the "Commit To Change" hackathon.

## Closing Statement

> Tenax is not just an AI that talks about productivity — it is an AI system that proves, with data, that it helps people follow through.

> **Opik makes that proof possible.**

---

# 1. Summary / Purpose

Tenax is a personal execution system that combines an intelligent agent, schedule import/recognition, and WhatsApp-based nudges to help users follow a strict study/work rhythm. Users onboard with why they're using the app and who they are (student, developer, etc.), provide their timetable (or upload it), and optionally connect Google Calendar. An AI Agent monitors activity, converts high-level plans into executable tasks, pushes reminders and end-of-day summaries via WhatsApp (Twilio), records completions reported via WhatsApp or the web dashboard, and generates weekly progress metrics and leaderboard awards. Long-term: issue monthly Sui-based NFT awards for top performers.

---

# 2. Objectives & Success Metrics

**Primary goals**

- Help users reliably follow their Daily Rules (pre-read, post-review, daily P1 focus, workout).
- Make task execution frictionless via natural WhatsApp interactions.
- Produce measurable improvement in weekly consistency and task completion.
- **Demonstrate measurable behavior change through Opik-powered evaluation.**

**Success metrics (first 12 weeks)**

- Daily Active Users (DAU) / Weekly Active Users (WAU)
- % of planned tasks completed per user per day (target MVP: +50% completion baseline)
- Weekly retention (target: 30%+)
- % of tasks completed via WhatsApp (target: 40% of completions)
- Accuracy of timetable parsing (target: 90% correct extractions)
- Engagement: Avg messages per user per day from agent (target: 2–4)
- **Opik-tracked: Completion rate improvement after reminder (target: +25%)**
- **Opik-tracked: Agent decision accuracy (target: 85%+)**

---



---

# OPIK IMPLEMENTATION GUIDE

## Workshop Insights Integration

Based on Comet's "Intro to AI Observability & Evaluation" workshop, here's how we implement Opik in Tenax:

### Phase 1: Foundation - Tracing Everything

**Installation & Setup:**
```bash
pip install opik
opik configure  # Enter API key from Comet
```

**Automatic Tracing with Decorators:**
```python
from opik import track

@track(name="generate_morning_summary", tags=["agent", "v1.0"])
def generate_morning_summary(user_id, tasks):
    # Function automatically traced
    # Captures: inputs, outputs, duration, errors
    summary = create_summary(tasks)
    return summary

@track(name="parse_whatsapp_intent")
def parse_whatsapp_intent(message, user_context):
    intent, confidence = nlp_parse(message)
    # Log metadata
    opik.log_metadata({
        "confidence": confidence,
        "user_id": user_context["id"],
        "agent_version": "v1.0"
    })
    return intent
```

**One-Line Framework Integration:**
```python
# For OpenAI
from opik.integrations.openai import track_openai
track_openai()  # All OpenAI calls now traced automatically

# For LangChain
from opik.integrations.langchain import OpikTracer
tracer = OpikTracer()
```

### Phase 2: Evaluation - LLM-as-Judge

**Online Evaluation (Real-Time Scoring):**

In Opik UI, create evaluation rules:

**Rule 1: Tone Appropriateness**
```
Prompt: "Rate the tone of this WhatsApp message on a scale of 1-5:
1 = Annoying/pushy
3 = Neutral
5 = Supportive and motivating

Message: {output}
Context: User completed {completed}/{total} tasks today.

Score (1-5):"

Model: GPT-4
Threshold: Alert if score < 3
```

**Rule 2: Task Specificity**
```
Prompt: "Rate how specific and actionable this task is (1-5):
1 = Vague (e.g., 'study')
5 = Specific (e.g., 'Read Chapter 3 of Algorithms textbook, pages 45-67')

Task: {output}

Score (1-5):"
```

**Rule 3: Plan Realism**
```
Prompt: "Given this user's schedule and past completion rate ({completion_rate}%), 
is this daily plan realistic? (1-5)

Plan: {output}

1 = Impossible to complete
5 = Perfectly balanced

Score (1-5):"
```

**Human Feedback Loop:**
```python
from opik import Opik
client = Opik()

# Log human feedback
client.log_feedback(
    trace_id=trace_id,
    score=4,  # Human score
    feedback_type="tone_quality",
    comment="Good balance of encouragement"
)

# Compare with LLM-as-Judge
# Use disagreements to improve judge prompts
```

**Creating Regression Test Datasets:**

In Opik UI:
1. Filter traces: `score < 3 OR status = "error"`
2. Click "Create Dataset"
3. Name: "Failed_Reminders_Jan2026"
4. Use for testing new agent versions

```python
# Run regression tests
from opik import Dataset

dataset = Dataset.load("Failed_Reminders_Jan2026")
for item in dataset:
    result = new_agent_version.process(item.input)
    assert result.score > 3, "Regression detected"
```

### Phase 5: Optimization - Self-Improving Agent

**HRPO (Hierarchical Reflective) Optimizer:**

```python
from opik_optimizer import HRPOptimizer

# Define optimization target
optimizer = HRPOptimizer(
    model="gpt-4",
    prompt=baseline_reminder_prompt,
    dataset=failed_reminders_dataset,
    metric="completion_rate",  # Behavioral outcome
    num_trials=10
)

# Run optimization
results = optimizer.optimize()

# Process:
# 1. Evaluate current prompt on dataset
# 2. Analyze failures (root cause)
# 3. Reflect on patterns
# 4. Generate improved prompt candidates
# 5. Test candidates
# 6. Promote best performer

best_prompt = results.best_candidate
print(f"Improvement: {results.improvement_pct}%")
```

**Evolutionary Optimizer (GEPA):**

```python
from opik_optimizer import GEPAOptimizer

optimizer = GEPAOptimizer(
    model="gpt-4",
    initial_prompts=[prompt_v1, prompt_v2, prompt_v3],
    dataset=reminder_dataset,
    metric="completion_rate",
    generations=5,
    population_size=10
)

# Evolves prompts like genetic algorithm
# Mutation: slight variations
# Crossover: merge successful elements
# Selection: keep top performers

evolved_prompt = optimizer.run()
```

**Few-Shot Bayesian Optimizer:**

```python
from opik_optimizer import FewShotOptimizer

# Optimize which examples to include in prompt
optimizer = FewShotOptimizer(
    model="gpt-4",
    task="intent_parsing",
    example_pool=all_intent_examples,  # 100+ examples
    num_shots=5,  # Select best 5
    metric="levenshtein_distance"
)

best_examples = optimizer.select()
# Use these 5 examples in your prompt for best accuracy
```

### Metrics That Matter

**Behavioral Outcomes (Primary):**
- Task completion rate: `completed_tasks / total_tasks`
- Completion latency: `time_completed - time_reminded`
- Streak maintenance: `consecutive_days_with_completion`
- Engagement: `messages_per_day`

**Quality Scores (Secondary):**
- Intent parsing accuracy: `1 - levenshtein_distance(predicted, actual)`
- Tone appropriateness: LLM-as-Judge score (1-5)
- Plan realism: LLM-as-Judge score (1-5)

**Correlation Analysis:**
```python
# In Opik dashboard, correlate:
# - Tone score vs completion rate
# - Reminder timing vs latency
# - Message frequency vs engagement

# Find: What actually drives behavior change?
```

### Development Workflow with Opik

**Daily Loop:**
```
1. Write agent code with @track decorators
2. Run against test users
3. Check Opik dashboard for traces
4. Identify failures (low scores, errors)
5. Add failures to regression dataset
6. Modify agent logic
7. Tag new version (v1.1)
8. Run regression tests
9. Compare v1.0 vs v1.1 in Opik
10. Promote if metrics improve
```

**Before Deployment:**
```
1. Run full regression suite
2. Check all LLM-as-Judge scores > thresholds
3. Verify no silent failures (correct output, wrong reasoning)
4. Compare with previous version metrics
5. Get human validation on sample traces
6. Deploy with version tag
7. Monitor Opik dashboard for anomalies
```

### Key Principles from Workshop

1. **Observability First**: Can't evaluate what you can't see
2. **Behavioral Metrics > Text Quality**: Measure actual outcomes
3. **LLM-as-Judge + Human Feedback**: Combine automated and manual evaluation
4. **Regression Testing**: Prevent quality drops
5. **Automated Optimization**: Let AI improve AI
6. **Version Everything**: Tag agents, prompts, models
7. **Correlate Metrics**: Find what drives real behavior change

---

# TECHNICAL IMPLEMENTATION NOTES

## Opik Integration Points

### 1. Agent Functions to Track

```python
# Morning routine
@track(name="initialize_day")
def initialize_day(user_id, date)

@track(name="generate_daily_plan")
def generate_daily_plan(user, tasks, schedule)

@track(name="send_morning_summary")
def send_morning_summary(user, plan)

# Reminder system
@track(name="schedule_reminder")
def schedule_reminder(task, reminder_time)

@track(name="send_reminder")
def send_reminder(user, task, reminder_type)

# WhatsApp interaction
@track(name="parse_whatsapp_message")
def parse_whatsapp_message(message, user_context)

@track(name="handle_task_completion")
def handle_task_completion(user, task_name)

# End of day
@track(name="calculate_completion_rate")
def calculate_completion_rate(user, date)

@track(name="send_eod_summary")
def send_eod_summary(user, stats, tone)
```

### 2. Metadata to Log

```python
opik.log_metadata({
    "user_id": user.id,
    "agent_version": "v1.2",
    "model": "gpt-4",
    "task_category": task.category,
    "time_of_day": datetime.now().hour,
    "user_streak": user.current_streak,
    "completion_rate_7d": user.completion_rate_last_7_days
})
```

### 3. Custom Metrics

```python
from opik import log_metric

# After reminder sent
log_metric("reminder_sent", {
    "task_id": task.id,
    "reminder_type": "30_min_before",
    "timestamp": datetime.now()
})

# After task completed
log_metric("task_completed", {
    "task_id": task.id,
    "latency_minutes": (completed_at - reminded_at).minutes,
    "completed_via": "whatsapp"
})

# Calculate effectiveness
effectiveness = completed_after_reminder / total_reminders_sent
log_metric("reminder_effectiveness", effectiveness)
```

### 4. Error Tracking

```python
@track(name="parse_intent", capture_errors=True)
def parse_intent(message):
    try:
        intent = nlp_model.parse(message)
        if intent.confidence < 0.65:
            opik.log_warning("Low confidence parse", {
                "message": message,
                "confidence": intent.confidence
            })
        return intent
    except Exception as e:
        opik.log_error("Parse failed", {
            "message": message,
            "error": str(e)
        })
        raise
```

### 5. A/B Testing Setup

```python
import random
from opik import experiment

@track(name="send_reminder")
def send_reminder(user, task):
    # Assign user to variant
    variant = experiment.assign_variant(
        user_id=user.id,
        experiment_id="reminder_tone_test",
        variants=["conservative", "assertive"],
        weights=[0.5, 0.5]
    )
    
    if variant == "conservative":
        message = f"Gentle reminder: {task.title} starts soon."
    else:
        message = f"Time to crush it! {task.title} starts now. Let's go!"
    
    send_whatsapp(user.phone, message)
    
    # Log variant
    opik.log_metadata({"experiment_variant": variant})
```

---

