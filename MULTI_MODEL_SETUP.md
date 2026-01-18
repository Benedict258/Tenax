# Multi-Model LLM Setup for Tenax

## Strategy: Llama 4 (Groq) → Gemini → OpenAI

### Why This Approach?

1. **Llama 4 (via Groq)** - Primary
   - ✅ FREE tier with high limits
   - ✅ FAST inference (< 1 second)
   - ✅ Good quality for summaries
   - Get key: https://console.groq.com/

2. **Gemini (Google)** - Secondary
   - ✅ FREE tier
   - ✅ Multimodal (for timetable OCR later)
   - ✅ Good for complex planning
   - Get key: https://makersuite.google.com/app/apikey

3. **OpenAI** - Fallback
   - ✅ Most reliable
   - ❌ Costs money
   - Use only when others fail

## Setup Instructions

### 1. Get Groq API Key (Primary - FREE)

1. Go to https://console.groq.com/
2. Sign up with GitHub/Google
3. Go to API Keys
4. Create new key
5. Copy key to `.env`:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxxx
   ```

### 2. Get Gemini API Key (Secondary - FREE)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy key to `.env`:
   ```
   GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxx
   ```

### 3. OpenAI (Optional Fallback)

Only if you have credits:
```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

## Test Multi-Model Setup

```bash
cd backend
node -e "const llm = require('./src/services/llm'); llm.generate('Say hello').then(r => console.log(r))"
```

Expected output:
```
[LLM] Success with groq
{ text: 'Hello! How can I help you?', model: 'groq-llama-3.3', tokens: 12 }
```

## Model Usage Strategy

### Groq (Llama 4) - Use for:
- ✅ Morning summaries
- ✅ Reminder messages
- ✅ Intent parsing
- ✅ Quick responses

### Gemini - Use for:
- ✅ LLM-as-Judge evaluations
- ✅ Complex planning
- ✅ Timetable OCR (Phase 4)
- ✅ Multi-step reasoning

### OpenAI - Use for:
- ✅ Critical operations only
- ✅ When Groq/Gemini fail
- ✅ Final fallback

## Automatic Fallback

The system tries models in order:
1. Groq (fast & free)
2. Gemini (free)
3. OpenAI (costs)
4. Rule-based fallback (no API)

## Cost Comparison

| Model | Cost | Speed | Quality |
|-------|------|-------|---------|
| Groq (Llama 4) | FREE | ⚡⚡⚡ | ⭐⭐⭐⭐ |
| Gemini | FREE | ⚡⚡ | ⭐⭐⭐⭐ |
| OpenAI | $$$$ | ⚡⚡ | ⭐⭐⭐⭐⭐ |

## For Hackathon Demo

**Recommended:** Use Groq (Llama 4) as primary

Benefits:
- ✅ FREE (no quota issues during demo)
- ✅ FAST (impressive live demo)
- ✅ Shows multi-model architecture
- ✅ Mention "Llama 4" in presentation

## Opik Integration

All models automatically log to Opik:
- Model used (groq/gemini/openai)
- Tokens consumed
- Response time
- Fallback attempts

This shows judges your robust architecture!
