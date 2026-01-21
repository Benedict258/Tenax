jest.mock('../scheduleService', () => ({
  getAvailability: jest.fn().mockResolvedValue({
    freeWindows: [
      { start: new Date('2026-01-21T08:00:00.000Z'), end: new Date('2026-01-21T10:00:00.000Z') },
      { start: new Date('2026-01-21T13:00:00.000Z'), end: new Date('2026-01-21T15:30:00.000Z') }
    ]
  })
}));

const { rankTasksWithAvailability } = require('../taskPrioritizer');
const scheduleService = require('../scheduleService');

describe('taskPrioritizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('assigns recommended windows based on availability', async () => {
    const tasks = [
      { id: 't1', title: 'Deep Work', severity: 'p1', priority: 1, duration_minutes: 60 },
      { id: 't2', title: 'Review Notes', severity: 'p2', priority: 2, duration_minutes: 45 }
    ];

    const result = await rankTasksWithAvailability('user-1', tasks, new Date('2026-01-21T07:00:00Z'));

    expect(scheduleService.getAvailability).toHaveBeenCalled();
    expect(result[0].recommended_start).toBeDefined();
    expect(result[0].recommended_end).toBeDefined();
    expect(result[1].recommended_start).toBeDefined();
  });
});
