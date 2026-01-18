# -*- coding: utf-8 -*-
"""
Simple Opik Test - Verify tracing to dashboard
Run: python test_opik.py
"""

from opik import track, Opik
from datetime import datetime
import time
import sys
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Initialize Opik client
client = Opik(project_name="Tenax", workspace="Tenax")

print("Testing Opik Integration\n")

@track(name="test_morning_summary", project_name="Tenax")
def test_morning_summary():
    """Test morning summary generation"""
    print("Test 1: Morning Summary Generation")
    
    user_data = {
        "user_id": "test-user-123",
        "name": "Benedict",
        "agent_version": "v1.0"
    }
    
    tasks = [
        {"title": "Morning Workout", "category": "Health"},
        {"title": "Review Tenax Code", "category": "P1"},
        {"title": "Integrate Opik", "category": "Academic"}
    ]
    
    # Simulate processing
    time.sleep(0.5)
    
    summary = f"Good morning {user_data['name']}! You have {len(tasks)} tasks today. Let's crush it! 💪"
    
    print(f"✅ Generated: {summary}\n")
    
    return {
        "summary": summary,
        "task_count": len(tasks),
        "user_id": user_data["user_id"]
    }

@track(name="test_reminder", project_name="Tenax")
def test_reminder():
    """Test reminder generation"""
    print("Test 2: Reminder Generation")
    
    task = {
        "id": "task-1",
        "title": "Morning Workout",
        "user_id": "test-user-123"
    }
    
    # Simulate processing
    time.sleep(0.3)
    
    reminder = f"⏰ Reminder: '{task['title']}' starts in 30 minutes!"
    
    print(f"✅ Generated: {reminder}\n")
    
    return {
        "reminder": reminder,
        "task_id": task["id"]
    }

@track(name="test_eod_summary", project_name="Tenax")
def test_eod_summary():
    """Test end-of-day summary"""
    print("Test 3: End-of-Day Summary")
    
    stats = {
        "completed": 3,
        "total": 5,
        "completion_rate": 60
    }
    
    # Simulate processing
    time.sleep(0.4)
    
    if stats["completion_rate"] >= 60:
        tone = "encouraging"
        emoji = "👍"
        message = f"Good progress! You finished {stats['completed']}/{stats['total']} tasks ({stats['completion_rate']}%)."
    else:
        tone = "corrective"
        emoji = "💪"
        message = f"You completed {stats['completed']}/{stats['total']} tasks. Tomorrow is a fresh start!"
    
    full_message = f"{emoji} {message}"
    
    print(f"✅ Generated: {full_message}")
    print(f"   Tone: {tone}\n")
    
    return {
        "message": full_message,
        "tone": tone,
        "stats": stats
    }

@track(name="test_intent_parsing", project_name="Tenax")
def test_intent_parsing():
    """Test WhatsApp intent parsing"""
    print("Test 4: Intent Parsing")
    
    messages = [
        "done workout",
        "status",
        "add review code tomorrow 8pm"
    ]
    
    results = []
    for msg in messages:
        time.sleep(0.2)
        
        if msg.startswith("done"):
            intent = "mark_complete"
            task_name = msg.replace("done", "").strip()
        elif msg == "status":
            intent = "status"
            task_name = None
        elif msg.startswith("add"):
            intent = "add_task"
            task_name = msg.replace("add", "").strip()
        else:
            intent = "unknown"
            task_name = None
        
        result = {
            "message": msg,
            "intent": intent,
            "task_name": task_name,
            "confidence": 0.95
        }
        results.append(result)
        print(f"   '{msg}' → {intent}")
    
    print("✅ Parsed all messages\n")
    
    return results

def main():
    """Run all tests"""
    try:
        # Test 1
        result1 = test_morning_summary()
        
        # Test 2
        result2 = test_reminder()
        
        # Test 3
        result3 = test_eod_summary()
        
        # Test 4
        result4 = test_intent_parsing()
        
        print("=" * 60)
        print("🎉 All tests completed successfully!")
        print("=" * 60)
        print("\n📊 Check your Opik dashboard:")
        print("   URL: https://www.comet.com/opik/")
        print("   Project: Tenax")
        print("   Workspace: Tenax")
        print("\nYou should see 4 traces:")
        print("   1. test_morning_summary")
        print("   2. test_reminder")
        print("   3. test_eod_summary")
        print("   4. test_intent_parsing")
        print("\nEach trace includes:")
        print("   • Input parameters")
        print("   • Output results")
        print("   • Execution time")
        print("   • Timestamps")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise

if __name__ == "__main__":
    main()
