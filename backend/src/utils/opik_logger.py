"""
Comprehensive Opik Logger for Tenax Agent
Ensures EVERY agent action is traced with behavioral metrics
"""

from opik import track, Opik
from datetime import datetime

client = Opik(project_name="Tenax", workspace="Tenax")

AGENT_VERSION = "v1.0"

@track(name="morning_summary_generated", project_name="Tenax")
def log_morning_summary(user_id, task_count, summary, tokens_used):
    """Log morning summary generation with full context"""
    return {
        "user_id": user_id,
        "agent_version": AGENT_VERSION,
        "task_count": task_count,
        "summary": summary,
        "tokens": tokens_used,
        "timestamp": datetime.now().isoformat()
    }

@track(name="morning_summary_dispatched", project_name="Tenax")
def log_morning_summary_dispatch(user_id, task_count, message_preview):
    """Log the sending of morning summaries via WhatsApp."""
    return {
        "user_id": user_id,
        "agent_version": AGENT_VERSION,
        "task_count": task_count,
        "message_preview": message_preview,
        "dispatched_at": datetime.now().isoformat()
    }

@track(name="reminder_sent", project_name="Tenax")
def log_reminder_sent(user_id, task_id, task_title, reminder_type, message):
    """Log reminder with tracking for effectiveness measurement"""
    return {
        "user_id": user_id,
        "task_id": task_id,
        "task_title": task_title,
        "reminder_type": reminder_type,
        "message": message,
        "agent_version": AGENT_VERSION,
        "sent_at": datetime.now().isoformat(),
        "awaiting_completion": True  # Will update when task completed
    }


@track(name="reminder_generated", project_name="Tenax")
def log_reminder_generated(user_id, task_id, task_title, reminder_type, message_preview):
    """Trace reminder content creation before delivery."""
    return {
        "user_id": user_id,
        "task_id": task_id,
        "task_title": task_title,
        "reminder_type": reminder_type,
        "message_preview": message_preview,
        "agent_version": AGENT_VERSION,
        "generated_at": datetime.now().isoformat()
    }

@track(name="task_completed", project_name="Tenax")
def log_task_completion(user_id, task_id, task_title, completed_via, reminder_was_sent, latency_minutes=None):
    """
    Log task completion with behavioral metrics
    CRITICAL: This measures if reminders actually work
    """
    return {
        "user_id": user_id,
        "task_id": task_id,
        "task_title": task_title,
        "completed_via": completed_via,  # 'whatsapp' or 'dashboard'
        "reminder_was_sent": reminder_was_sent,
        "latency_minutes": latency_minutes,  # Time from reminder to completion
        "agent_version": AGENT_VERSION,
        "completed_at": datetime.now().isoformat()
    }

@track(name="intent_parsed", project_name="Tenax")
def log_intent_parsing(user_id, message, intent, confidence, slots):
    """Log WhatsApp intent parsing for accuracy tracking"""
    return {
        "user_id": user_id,
        "message": message,
        "intent": intent,
        "confidence": confidence,
        "slots": slots,
        "agent_version": AGENT_VERSION,
        "parsed_at": datetime.now().isoformat()
    }


@track(name="completion_stats_calculated", project_name="Tenax")
def log_completion_stats(user_id, total, completed, pending, completion_rate):
    """Capture daily completion stats for dashboards."""
    return {
        "user_id": user_id,
        "total": total,
        "completed": completed,
        "pending": pending,
        "completion_rate": completion_rate,
        "agent_version": AGENT_VERSION,
        "calculated_at": datetime.now().isoformat()
    }

@track(name="eod_summary_draft", project_name="Tenax")
def log_eod_summary_draft(user_id, tone, completion_rate, message_preview):
    """Trace EOD draft content before messaging."""
    return {
        "user_id": user_id,
        "tone": tone,
        "completion_rate": completion_rate,
        "message_preview": message_preview,
        "agent_version": AGENT_VERSION,
        "drafted_at": datetime.now().isoformat()
    }

@track(name="eod_summary_sent", project_name="Tenax")
def log_eod_summary(user_id, completed, total, completion_rate, tone, message):
    """Log end-of-day summary with performance metrics"""
    return {
        "user_id": user_id,
        "completed": completed,
        "total": total,
        "completion_rate": completion_rate,
        "tone": tone,
        "message": message,
        "agent_version": AGENT_VERSION,
        "sent_at": datetime.now().isoformat()
    }

@track(name="agent_effectiveness_calculated", project_name="Tenax")
def log_agent_effectiveness(user_id, period, metrics):
    """
    Log overall agent effectiveness
    CRITICAL: This is what we show judges
    """
    return {
        "user_id": user_id,
        "period": period,  # 'daily', 'weekly'
        "metrics": {
            "completion_rate": metrics.get("completion_rate"),
            "reminder_effectiveness": metrics.get("reminder_effectiveness"),
            "avg_latency_minutes": metrics.get("avg_latency_minutes"),
            "engagement_score": metrics.get("engagement_score"),
            "streak_days": metrics.get("streak_days")
        },
        "agent_version": AGENT_VERSION,
        "calculated_at": datetime.now().isoformat()
    }

def calculate_reminder_effectiveness(reminders_sent, tasks_completed_after_reminder):
    """
    Calculate if reminders actually work
    This is the KEY metric for hackathon
    """
    if reminders_sent == 0:
        return {"value": 0}
    
    effectiveness = (tasks_completed_after_reminder / reminders_sent) * 100
    
    # Log to Opik
    client.log_metric("reminder_effectiveness", {
        "value": effectiveness,
        "reminders_sent": reminders_sent,
        "completed_after_reminder": tasks_completed_after_reminder,
        "agent_version": AGENT_VERSION
    })
    
    return {"value": effectiveness}


@track(name="llm_call", project_name="Tenax")
def log_llm_call(action, model, success, tokens_used, latency_ms, attempt, prompt_preview,
                 user_id=None, error_message=None, metadata=None):
    """Trace every LLM invocation to tie model quality back to behavior."""
    return {
        "action": action,
        "model": model,
        "success": success,
        "tokens_used": tokens_used,
        "latency_ms": latency_ms,
        "attempt": attempt,
        "prompt_preview": prompt_preview,
        "error_message": error_message,
        "user_id": user_id,
        "metadata": metadata or {},
        "agent_version": AGENT_VERSION,
        "timestamp": datetime.now().isoformat()
    }

def log_experiment_variant(user_id, experiment_id, variant, outcome):
    """Log A/B test variant and outcome"""
    client.log_metric("experiment_result", {
        "user_id": user_id,
        "experiment_id": experiment_id,
        "variant": variant,
        "outcome": outcome,
        "agent_version": AGENT_VERSION,
        "timestamp": datetime.now().isoformat()
    })


@track(name="daily_plan", project_name="Tenax")
def log_daily_plan_trace(input_context, output, metadata):
    """Generic trace for daily plan generation with structured context."""
    return {
        "input_context": input_context,
        "output": output,
        "metadata": metadata,
        "logged_at": datetime.now().isoformat()
    }


@track(name="reminder", project_name="Tenax")
def log_reminder_trace(input_context, output, metadata):
    """Generic trace for reminder messages so LLM-as-judge can score tone."""
    return {
        "input_context": input_context,
        "output": output,
        "metadata": metadata,
        "logged_at": datetime.now().isoformat()
    }


@track(name="eod_summary", project_name="Tenax")
def log_eod_summary_trace(input_context, output, metadata):
    """Generic trace for end-of-day summaries."""
    return {
        "input_context": input_context,
        "output": output,
        "metadata": metadata,
        "logged_at": datetime.now().isoformat()
    }

# Export all logging functions
__all__ = [
    'log_morning_summary',
    'log_morning_summary_dispatch',
    'log_reminder_generated',
    'log_reminder_sent',
    'log_task_completion',
    'log_intent_parsing',
    'log_completion_stats',
    'log_eod_summary_draft',
    'log_eod_summary',
    'log_llm_call',
    'log_agent_effectiveness',
    'calculate_reminder_effectiveness',
    'log_experiment_variant',
    'log_daily_plan_trace',
    'log_reminder_trace',
    'log_eod_summary_trace'
]
