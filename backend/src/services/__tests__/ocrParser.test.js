const fs = require('fs');
const path = require('path');
const { parseRowText, parseDinoPrediction } = require('../ocrParser');

describe('ocrParser utilities', () => {
  test('parseRowText extracts normalized schedule fields', () => {
    const row = parseRowText('Mon 8:00 AM - 9:30 AM Calculus 101 (Room B12)');
    expect(row).toMatchObject({
      title: 'Calculus 101',
      location: 'Room B12',
      day_of_week: 1,
      start_time: '08:00:00',
      end_time: '09:30:00'
    });
  });

  test('parseDinoPrediction filters, deduplicates, and normalizes annotations', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'dino-output.json');
    const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const rows = parseDinoPrediction(payload, { minConfidence: 0.2 });
    expect(rows).toHaveLength(3);

    const titles = rows.map((row) => row.title);
    expect(titles).toContain('Calculus 101');
    expect(titles).toContain('Data Structures Lab');
    expect(titles).toContain('Algorithms II');

    const wedRow = rows.find((row) => row.day_of_week === 3);
    expect(wedRow.start_time).toBe('19:00:00');
    expect(wedRow.end_time).toBe('21:00:00');
    expect(wedRow.metadata.raw_text).toMatch(/Wed 7pm - 9pm/i);
  });
});
