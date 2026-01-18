"""
Opik Integration Wrapper for Tenax Agent
Provides Python-based Opik tracing that Node.js backend can call via child_process
"""

import os
import sys
import json
from datetime import datetime
from opik import track, Opik
from opik.integrations.openai import track_openai

# Initialize Opik client
client = Opik(project_name="Tenax", workspace="Tenax")

# Track OpenAI calls automatically
track_openai()

@track(name="agent_action", project_name="Tenax")
def log_agent_action(action_name, metadata, input_data, output_data, status="success", error=None):
    """
    Log agent action to Opik with full tracing
    
    Args:
        action_name: Name of the action (e.g., "generate_morning_summary")
        metadata: Dict with user_id, agent_version, etc.
        input_data: Input parameters
        output_data: Output results
        status: success/error
        error: Error message if failed
    """
    trace_data = {
        "action": action_name,
        "timestamp": datetime.now().isoformat(),
        "metadata": metadata,
        "input": input_data,
        "output": output_data,
        "status": status
    }
    
    if error:
        trace_data["error"] = error
    
    # Log to Opik
    client.log_traces([trace_data])
    
    return trace_data

@track(name="evaluate_message_quality", project_name="Tenax")
def evaluate_message_quality(message, context):
    """
    Evaluate message quality using LLM-as-Judge
    Will be implemented in Phase 2
    """
    # Placeholder for Phase 2
    return {
        "tone_score": None,
        "specificity_score": None,
        "relevance_score": None
    }

def main():
    """
    CLI interface for Node.js to call Opik logging
    Usage: python opik_wrapper.py '{"action": "...", "metadata": {...}, ...}'
    """
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No data provided"}))
        sys.exit(1)
    
    try:
        data = json.loads(sys.argv[1])
        
        result = log_agent_action(
            action_name=data.get("action"),
            metadata=data.get("metadata", {}),
            input_data=data.get("input", {}),
            output_data=data.get("output", {}),
            status=data.get("status", "success"),
            error=data.get("error")
        )
        
        print(json.dumps({"success": True, "trace": result}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
