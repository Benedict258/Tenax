const nluService = require('../nluService');

describe('NLU task parsing', () => {
  test('add_task title cleanup', () => {
    const parsed = nluService.parseMessage('Add the task Read MCE321 for 7:35pm today');
    expect(parsed.intent).toBe('add_task');
    expect(parsed.slots.taskName).toBe('Read MCE321');
  });

  test('completion ambiguity stays generic', () => {
    const parsed = nluService.parseMessage('I have completed my task');
    expect(parsed.intent).toBe('mark_complete');
    expect(parsed.slots.taskName).toBe('');
  });
});

