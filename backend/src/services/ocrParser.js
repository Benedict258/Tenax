const DAY_NAME_LOOKUP = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
};

const TIME_RANGE_REGEX = /([0-2]?\d(?:[:\.][0-5]\d)?\s*(?:am|pm)?)\s*(?:-|–|to)\s*([0-2]?\d(?:[:\.][0-5]\d)?\s*(?:am|pm)?)/i;
const LOCATION_PARENS_REGEX = /(?:\(|\[)([^)\]]{2,})(?:\)|\])\s*$/i;
const LOCATION_ROOM_REGEX = /(room|rm|hall|lab|block)\s*([A-Za-z0-9\-]+)/i;
const MIN_CONFIDENCE_DEFAULT = 0.2;

function toMinutes(hour, minute, meridiem) {
  let normalizedHour = hour % 24;
  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === 'pm' && normalizedHour < 12) {
      normalizedHour += 12;
    } else if (lower === 'am' && normalizedHour === 12) {
      normalizedHour = 0;
    }
  }
  return normalizedHour * 60 + minute;
}

function parseTimeToken(token, defaultMeridiem = null) {
  if (!token) return null;
  const trimmed = token.toString().trim().toLowerCase().replace(/\s+/g, '');
  const match = trimmed.match(/^(\d{1,2})(?:[:\.]?(\d{2}))?(am|pm)?$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3] || defaultMeridiem;
  if (hour > 23 || minute > 59) return null;
  return toMinutes(hour, minute, meridiem);
}

function extractTimeRange(text) {
  if (!text) return null;
  const rangeMatch = text.match(TIME_RANGE_REGEX);
  if (!rangeMatch) return null;
  const [, startRaw, endRaw] = rangeMatch;
  const startMeridiemMatch = startRaw.match(/(am|pm)/i);
  const startMinutes = parseTimeToken(startRaw);
  const endMinutes = parseTimeToken(endRaw, startMeridiemMatch ? startMeridiemMatch[1].toLowerCase() : null);
  if (startMinutes == null || endMinutes == null) {
    return null;
  }
  let adjustedEnd = endMinutes;
  while (adjustedEnd <= startMinutes) {
    adjustedEnd += 12 * 60;
    if (adjustedEnd - startMinutes >= 24 * 60) break;
  }
  return {
    raw: rangeMatch[0],
    start: startMinutes,
    end: adjustedEnd
  };
}

function extractDayOfWeek(text) {
  if (!text) return null;
  const match = text.match(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i);
  if (!match) return null;
  const key = match[1].toLowerCase();
  return {
    value: DAY_NAME_LOOKUP[key],
    raw: match[0]
  };
}

function extractLocation(text) {
  if (!text) return null;
  const paren = text.match(LOCATION_PARENS_REGEX);
  if (paren) {
    return {
      value: paren[1].trim(),
      raw: paren[0]
    };
  }
  const room = text.match(LOCATION_ROOM_REGEX);
  if (room) {
    return {
      value: `${room[1]} ${room[2]}`.replace(/\s+/g, ' ').trim(),
      raw: room[0]
    };
  }
  return null;
}

function formatTime(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
}

function sanitizeTitle(text, removals = []) {
  let result = text;
  removals
    .filter(Boolean)
    .forEach((segment) => {
      result = result.replace(segment, ' ');
    });
  return result.replace(/\s+/g, ' ').trim();
}

function parseRowText(text) {
  if (!text) return null;
  const day = extractDayOfWeek(text);
  const timeRange = extractTimeRange(text);
  if (!timeRange || day?.value == null) {
    return null;
  }
  const location = extractLocation(text);
  const title = sanitizeTitle(text, [day?.raw, timeRange?.raw, location?.raw]);
  if (!title) {
    return null;
  }
  return {
    title,
    location: location?.value || null,
    day_of_week: day?.value ?? null,
    start_time: formatTime(timeRange.start),
    end_time: formatTime(timeRange.end),
    category: 'class',
    metadata: {
      parsed_tokens: {
        raw: text,
        day: day?.raw || null,
        time_range: timeRange?.raw || null,
        location: location?.raw || null
      }
    }
  };
}

function getAnnotationConfidence(annotation) {
  if (typeof annotation?.confidence === 'number') return annotation.confidence;
  if (typeof annotation?.score === 'number') return annotation.score;
  if (typeof annotation?.probability === 'number') return annotation.probability;
  return null;
}

function getAnnotationText(annotation) {
  return (
    annotation?.text ||
    annotation?.caption ||
    annotation?.label ||
    (Array.isArray(annotation?.texts) ? annotation.texts.join(' ') : null) ||
    ''
  ).trim();
}

function normalizeAnnotations(prediction) {
  if (!prediction) return [];
  if (Array.isArray(prediction.output)) return prediction.output;
  if (Array.isArray(prediction?.output?.annotations)) return prediction.output.annotations;
  if (Array.isArray(prediction?.output?.predictions)) return prediction.output.predictions;
  if (prediction?.output?.results && Array.isArray(prediction.output.results)) {
    return prediction.output.results;
  }
  return [];
}

function parseDinoPrediction(prediction, options = {}) {
  const annotations = normalizeAnnotations(prediction);
  if (!annotations.length) {
    return [];
  }

  const minConfidence = options.minConfidence ?? MIN_CONFIDENCE_DEFAULT;
  const rows = [];
  const seenKeys = new Set();

  annotations.forEach((annotation, idx) => {
    const text = getAnnotationText(annotation);
    if (!text) return;
    const confidence = getAnnotationConfidence(annotation);
    if (confidence !== null && confidence < minConfidence) return;

    const parsed = parseRowText(text);
    if (!parsed) return;
    const key = `${parsed.day_of_week ?? 'x'}-${parsed.start_time}-${parsed.end_time}-${parsed.title.toLowerCase()}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    rows.push({
      ...parsed,
      confidence: confidence ?? null,
      metadata: {
        ...parsed.metadata,
        source_box: annotation.box || annotation.bbox || annotation.rectangle || null,
        replicate_prediction_index: idx,
        raw_text: text,
        replicate_status: prediction?.status || null,
        replicate_id: prediction?.id || null,
        upload_id: options.uploadId || null
      }
    });
  });

  return rows;
}

module.exports = {
  parseRowText,
  parseDinoPrediction
};
