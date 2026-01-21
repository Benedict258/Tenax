const fs = require('fs');
const path = require('path');
const optimizerConfig = require('../config/optimizer');

class DatasetExporter {
  constructor() {
    this.baseDir = optimizerConfig.datasetDir;
    this.streamDir = path.join(this.baseDir, 'streams');
  }

  ensureDir(dirPath) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      console.warn('[DatasetExporter] Failed to create directory:', error.message);
    }
  }

  appendJsonLine(filePath, payload) {
    try {
      this.ensureDir(path.dirname(filePath));
      const enriched = {
        recorded_at: new Date().toISOString(),
        ...payload
      };
      fs.appendFileSync(filePath, `${JSON.stringify(enriched)}\n`, 'utf8');
      return filePath;
    } catch (error) {
      console.warn('[DatasetExporter] Append failed:', error.message);
      return null;
    }
  }

  recordTrace(messageType, payload) {
    if (!messageType) {
      return null;
    }
    const fileName = `${messageType}_traces.jsonl`;
    const fullPath = path.join(this.streamDir, fileName);
    return this.appendJsonLine(fullPath, {
      message_type: messageType,
      ...payload
    });
  }

  recordReminderEvent(eventType, payload) {
    const fileName = 'reminder_events.jsonl';
    const fullPath = path.join(this.streamDir, fileName);
    return this.appendJsonLine(fullPath, {
      event_type: eventType,
      ...payload
    });
  }
}

module.exports = new DatasetExporter();
