const MAX_TURNS = 5;

class ConversationContext {
  constructor() {
    this.turnHistory = new Map();
    this.pendingActions = new Map();
  }

  _ensureUser(userId) {
    if (!this.turnHistory.has(userId)) {
      this.turnHistory.set(userId, []);
    }
    return this.turnHistory.get(userId);
  }

  appendTurn(userId, role, text, metadata = {}) {
    if (!userId) return;
    const turns = this._ensureUser(userId);
    turns.push({ role, text, metadata, at: new Date().toISOString() });
    if (turns.length > MAX_TURNS) {
      turns.splice(0, turns.length - MAX_TURNS);
    }
  }

  getTurns(userId) {
    return this.turnHistory.get(userId) || [];
  }

  clear(userId) {
    this.turnHistory.delete(userId);
    this.pendingActions.delete(userId);
  }

  setPendingAction(userId, action) {
    if (!userId) return;
    this.pendingActions.set(userId, {
      ...action,
      createdAt: new Date().toISOString()
    });
  }

  getPendingAction(userId) {
    return this.pendingActions.get(userId) || null;
  }

  consumePendingAction(userId) {
    const action = this.getPendingAction(userId);
    if (action) {
      this.pendingActions.delete(userId);
    }
    return action;
  }
}

module.exports = new ConversationContext();
