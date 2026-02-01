const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const opikLogger = require('../utils/opikBridge');

class LLMService {
  constructor() {
    // Load environment variables
    require('dotenv').config();
    
    // Initialize all models
    this.groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
    this.gemini = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    
    console.log('[LLM] Initialized:', {
      groq: !!this.groq,
      gemini: !!this.gemini,
      openai: !!this.openai
    });
    
    this.modelPriority = ['groq', 'gemini', 'openai'];
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.modelCooldowns = new Map();
    this.cooldownMs = Number(process.env.LLM_COOLDOWN_MS || 10 * 60 * 1000);
  }

  /**
   * Generate text with automatic fallback
   * Primary: Llama 4 (Groq) - Fast & Free
   * Secondary: Gemini - Free tier
   * Fallback: OpenAI - Reliable but costs
   */
  async generate(prompt, options = {}) {
    const { 
      maxTokens = 150, 
      temperature = 0.7,
      preferredModel = null,
      opikMeta = {}
    } = options;

    // Try preferred model first if specified and not on cooldown
    if (preferredModel && !this._isOnCooldown(preferredModel)) {
      try {
        return await this._attemptModel(preferredModel, prompt, maxTokens, temperature, opikMeta, 1);
      } catch (error) {
        console.log(`[LLM] ${preferredModel} failed, trying fallback:`, error.message);
      }
    }

    // Try models in priority order
    let attempt = preferredModel ? 2 : 1;
    for (const model of this.modelPriority) {
      if (this._isOnCooldown(model)) {
        continue;
      }
      try {
        const result = await this._attemptModel(model, prompt, maxTokens, temperature, opikMeta, attempt);
        console.log(`[LLM] Success with ${model}`);
        return result;
      } catch (error) {
        console.log(`[LLM] ${model} failed:`, error.message);
        this._markCooldownIfNeeded(model, error);
        attempt += 1;
        continue;
      }
    }

    // All models failed - return simple fallback
    console.error('[LLM] All models failed, using fallback text');
    const fallback = this._getFallbackResponse(prompt);
    await this._logLlmCall({
      action: opikMeta.action || 'fallback_generation',
      userId: opikMeta.user_id,
      model: 'fallback',
      success: true,
      tokensUsed: fallback.tokens,
      latencyMs: 0,
      attempt: attempt,
      prompt
    });
    return fallback;
  }

  async _attemptModel(model, prompt, maxTokens, temperature, opikMeta, attempt) {
    const startedAt = Date.now();
    try {
      const result = await this._generateWithModel(model, prompt, maxTokens, temperature);
      await this._logLlmCall({
        action: opikMeta.action || 'agent_generation',
        userId: opikMeta.user_id,
        model: result.model || model,
        success: true,
        tokensUsed: result.tokens,
        latencyMs: Date.now() - startedAt,
        attempt,
        prompt,
        metadata: opikMeta
      });
      return result;
    } catch (error) {
      this._markCooldownIfNeeded(model, error);
      await this._logLlmCall({
        action: opikMeta.action || 'agent_generation',
        userId: opikMeta.user_id,
        model,
        success: false,
        tokensUsed: 0,
        latencyMs: Date.now() - startedAt,
        attempt,
        prompt,
        errorMessage: error.message,
        metadata: opikMeta
      });
      throw error;
    }
  }

  _isOnCooldown(model) {
    const until = this.modelCooldowns.get(model);
    if (!until) return false;
    if (Date.now() >= until) {
      this.modelCooldowns.delete(model);
      return false;
    }
    return true;
  }

  _markCooldownIfNeeded(model, error) {
    if (!error) return;
    const message = String(error.message || '').toLowerCase();
    const isQuota = message.includes('quota') || message.includes('rate') || message.includes('429');
    const isAuth = message.includes('invalid api key') || message.includes('unauthorized') || message.includes('forbidden');
    if (isQuota || isAuth) {
      this.modelCooldowns.set(model, Date.now() + this.cooldownMs);
    }
  }

  async _generateWithModel(model, prompt, maxTokens, temperature) {
    switch (model) {
      case 'groq':
        return await this._generateGroq(prompt, maxTokens, temperature);
      case 'gemini':
        return await this._generateGemini(prompt, maxTokens, temperature);
      case 'openai':
        return await this._generateOpenAI(prompt, maxTokens, temperature);
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  async _generateGroq(prompt, maxTokens, temperature) {
    if (!this.groq) throw new Error('Groq not configured');

    const response = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Llama 4 equivalent
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: temperature
    });

    return {
      text: response.choices[0].message.content.trim(),
      model: 'groq-llama-3.3',
      tokens: response.usage.total_tokens
    };
  }

  async _generateGemini(prompt, maxTokens, temperature) {
    if (!this.gemini) throw new Error('Gemini not configured');

    const model = this.gemini.getGenerativeModel({ model: this.geminiModel });
    const result = await model.generateContent(prompt);
    const response = await result.response;

    return {
      text: response.text().trim(),
      model: this.geminiModel,
      tokens: 0 // Gemini doesn't return token count easily
    };
  }

  async _generateOpenAI(prompt, maxTokens, temperature) {
    if (!this.openai) throw new Error('OpenAI not configured');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: temperature
    });

    return {
      text: response.choices[0].message.content.trim(),
      model: 'gpt-4o-mini',
      tokens: response.usage.total_tokens
    };
  }

  _getFallbackResponse(prompt) {
    // Simple rule-based fallback
    if (prompt.includes('morning') || prompt.includes('summary')) {
      return {
        text: 'Good morning! You have tasks scheduled today. Let\'s make it count!',
        model: 'fallback',
        tokens: 0
      };
    }
    
    if (prompt.includes('reminder')) {
      return {
        text: 'Time to focus on your task. You\'ve got this!',
        model: 'fallback',
        tokens: 0
      };
    }

    return {
      text: 'Keep up the great work on your tasks!',
      model: 'fallback',
      tokens: 0
    };
  }

  async _logLlmCall({
    action,
    userId,
    model,
    success,
    tokensUsed,
    latencyMs,
    attempt,
    prompt,
    errorMessage,
    metadata = {}
  }) {
    const payload = {
      action,
      user_id: userId,
      model,
      success,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      attempt,
      prompt_preview: prompt.slice(0, 120),
      error_message: errorMessage,
      metadata
    };

    await opikLogger.log('log_llm_call', payload);
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return {
      groq: !!this.groq,
      gemini: !!this.gemini,
      openai: !!this.openai
    };
  }
}

module.exports = new LLMService();
