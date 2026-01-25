const dayMap = {
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
  thur: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
};

function parseTime(value) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const meridiemMatch = trimmed.match(/(am|pm)$/);
  let meridiem = meridiemMatch ? meridiemMatch[1] : null;
  let numeric = trimmed.replace(/(am|pm)/, '').trim();
  if (!numeric.includes(':')) {
    numeric = `${numeric}:00`;
  }
  let [hourStr, minuteStr] = numeric.split(':');
  let hour = Number(hourStr);
  const minute = Number(minuteStr || '0');
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (!meridiem && hour <= 6) {
    meridiem = 'pm';
  }
  if (meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

function parseLine(line) {
  const cleaned = line.replace(/[-•*]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const regex = /^(?<title>[\w\s&,-]{2,})\s+(?<day>sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+(?<start>\d{1,2}(?::\d{2})?\s?(?:am|pm)?)\s*(?:-|to)\s*(?<end>\d{1,2}(?::\d{2})?\s?(?:am|pm)?)/i;
  const match = cleaned.match(regex);
  if (!match || !match.groups) {
    return null;
  }
  const { title, day, start, end } = match.groups;
  const dayOfWeek = dayMap[day.toLowerCase()];
  const startTime = parseTime(start);
  const endTime = parseTime(end);
  if (typeof dayOfWeek === 'undefined' || !startTime || !endTime) {
    return null;
  }
  return {
    raw: cleaned,
    title: title.trim(),
    dayOfWeek,
    start: startTime,
    end: endTime
  };
}

function parseCoursesFromText(text) {
  if (!text) return [];
  const lines = text.split(/\n|;/).map((line) => line.trim());
  return lines
    .map(parseLine)
    .filter(Boolean);
}

function buildConfirmationSummary(entries) {
  if (!entries.length) {
    return 'No recurring classes detected yet.';
  }
  return entries
    .map((entry) => {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const start = `${String(entry.start.hour).padStart(2, '0')}:${String(entry.start.minute).padStart(2, '0')}`;
      const end = `${String(entry.end.hour).padStart(2, '0')}:${String(entry.end.minute).padStart(2, '0')}`;
      return `${entry.title} • ${dayNames[entry.dayOfWeek]} ${start}-${end}`;
    })
    .join('\n');
}

module.exports = {
  parseCoursesFromText,
  buildConfirmationSummary
};
