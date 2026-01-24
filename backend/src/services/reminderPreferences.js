const DAY_MS = 24 * 60 * 60 * 1000;

class ReminderPreferences {
  constructor() {
    this.preferences = new Map();
  }

  _get(userId) {
    if (!this.preferences.has(userId)) {
      this.preferences.set(userId, {
        snoozedUntil: null,
        pausedUntil: null
      });
    }
    return this.preferences.get(userId);
  }

  snooze(userId, minutes = 30) {
    const prefs = this._get(userId);
    const duration = Number(minutes) > 0 ? Number(minutes) : 30;
    prefs.snoozedUntil = Date.now() + duration * 60 * 1000;
    return prefs.snoozedUntil;
  }

  pauseForToday(userId) {
    const prefs = this._get(userId);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    prefs.pausedUntil = endOfDay.getTime();
    return prefs.pausedUntil;
  }

  clear(userId) {
    const prefs = this._get(userId);
    prefs.snoozedUntil = null;
    prefs.pausedUntil = null;
  }

  isSnoozed(userId) {
    const prefs = this._get(userId);
    if (!prefs.snoozedUntil) return false;
    if (Date.now() >= prefs.snoozedUntil) {
      prefs.snoozedUntil = null;
      return false;
    }
    return true;
  }

  isPaused(userId) {
    const prefs = this._get(userId);
    if (!prefs.pausedUntil) return false;
    if (Date.now() >= prefs.pausedUntil) {
      prefs.pausedUntil = null;
      return false;
    }
    return true;
  }
}

module.exports = new ReminderPreferences();
