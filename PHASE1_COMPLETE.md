# Phase 1 - Agent Service with Opik Integration

## ✅ What We Built

1. **Agent Service** (`backend/src/services/agent.js`)
   - Morning summary generator
   - Reminder scheduler
   - End-of-day summary generator
   - Completion stats calculator

2. **Opik Integration** 
   - Python wrapper (`backend/src/utils/opik_wrapper.py`)
   - Node.js client (`backend/src/utils/opikClient.js`)
   - Automatic tracing for all agent actions

3. **Test Suite** (`backend/test-agent.js`)

## 🚀 Quick Start

### 1. Install Python Dependencies
```bash
pip install opik openai
```

### 2. Add OpenAI API Key
Edit `backend/.env`:
```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Test Agent Service
```bash
cd backend
node test-agent.js
```

Expected output:
```
🧪 Testing Tenax Agent Service with Opik Integration

Test 1: Generate Morning Summary
✅ Summary: Good morning Benedict! Focus on your workout and Tenax review today...

Test 2: Generate Reminder
✅ Reminder: ⏰ Reminder: "Morning Workout" starts in 30 minutes...

Test 3: Calculate Completion Stats
✅ EOD Summary: 👍 Good progress! You finished 3/5 tasks (60%)...
   Tone: encouraging

🎉 All tests passed!

📊 Check Opik dashboard at: https://www.comet.com/opik/
   Project: Tenax
   Workspace: Tenax
```

### 4. Check Opik Dashboard

Go to: https://www.comet.com/opik/

You should see traces for:
- `generate_morning_summary`
- `generate_reminder`
- `generate_eod_summary`

Each trace includes:
- User ID
- Agent version
- Input/output data
- Timestamps
- Status (success/error)

## 📊 What Gets Tracked

Every agent action logs to Opik:

```javascript
{
  action: "generate_morning_summary",
  metadata: {
    user_id: "test-user-123",
    agent_version: "v1.0",
    task_count: 3,
    timestamp: "2026-01-10T10:30:00Z"
  },
  input: {
    task_count: 3,
    user_name: "Benedict"
  },
  output: {
    summary: "Good morning Benedict!...",
    tokens: 45
  },
  status: "success"
}
```

## 🔄 Next Steps

### Integrate with WhatsApp Routes

Update `backend/src/routes/whatsapp.js`:

```javascript
const agentService = require('../services/agent');

// In webhook handler
router.post('/webhook', async (req, res) => {
  const { From, Body } = req.body;
  const user = await User.findByPhone(From.replace('whatsapp:', ''));
  
  // Use agent service
  if (Body.toLowerCase() === 'status') {
    const stats = await agentService.calculateCompletionStats(user);
    // Send stats via WhatsApp
  }
  
  // All agent actions automatically traced in Opik!
});
```

### Schedule Morning Summaries

Update `backend/src/services/queue.js`:

```javascript
const agentService = require('./agent');

// Add job processor
reminderQueue.process('morning-summary', async (job) => {
  const { user } = job.data;
  await agentService.sendMorningSummary(user);
  // Automatically traced in Opik!
});
```

## 🎯 Phase 1 Complete!

✅ Agent service with 5 core functions  
✅ Opik tracing on every action  
✅ OpenAI integration for smart summaries  
✅ Test suite passing  

**Ready for Phase 2: LLM-as-Judge Evaluation!**

## 🐛 Troubleshooting

**Python not found:**
```bash
# Windows
where python
# Use full path in opikClient.js if needed
```

**Opik not configured:**
```bash
opik configure
# Enter API key from comet.com
```

**OpenAI API error:**
- Check API key in `.env`
- Verify you have credits: https://platform.openai.com/usage

**No traces in Opik:**
- Check Python wrapper runs: `python backend/src/utils/opik_wrapper.py '{"action":"test"}'`
- Verify Opik config: `opik healthcheck`
