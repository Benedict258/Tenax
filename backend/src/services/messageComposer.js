const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const tonePools = {
  friendly_supportive: {
    add_task: [
      'Locked in: "{title}"{timeText}{recurrenceText}. Ping me when it is done.',
      'Got it. "{title}"{timeText}{recurrenceText} is on your board.',
      'Added "{title}"{timeText}{recurrenceText}. I will keep you honest.'
    ],
    complete: [
      'Nice work on "{title}" ✅ Want me to line up the next one?',
      'Logged: "{title}" complete. Keep that rhythm going.',
      'Solid. "{title}" is done. What is next?'
    ],
    clarify: [
      'Which one did you finish?',
      'Which task was that?',
      'Tell me which one you closed.'
    ],
    status: [
      'Here is the lineup for today:',
      'This is what is left for today:',
      'On deck right now:'
    ],
    greeting: [
      'Hey {name}! Want a quick status, add something, or start a resolution plan?',
      'Yo {name} — need a status check or want to add a task?',
      'Hey {name}! I am here. Want your plan or to add something?'
    ]
  },
  focused_coach: {
    add_task: [
      'Added: "{title}"{timeText}{recurrenceText}. Keep the focus.',
      'Scheduled "{title}"{timeText}{recurrenceText}. Let us execute.',
      'Done. "{title}"{timeText}{recurrenceText} is locked.'
    ],
    complete: [
      'Good. "{title}" complete. Stay on the next one.',
      'Checked off "{title}". Keep moving.',
      'Nice finish on "{title}". Next task when you are ready.'
    ],
    clarify: [
      'Which task did you finish?',
      'Name the one you completed.',
      'Which one should I mark done?'
    ],
    status: [
      'Today’s targets:',
      'Current stack:',
      'Remaining moves:'
    ],
    greeting: [
      'Morning {name}. Status update or add a task?',
      'Hey {name}. Want today’s plan or to add a task?',
      'Hi {name}. Ready to line up today’s work?'
    ]
  },
  playful_duolingo: {
    add_task: [
      'Okay okay! "{title}"{timeText}{recurrenceText} is set. Do not ghost it 😄',
      'Locked: "{title}"{timeText}{recurrenceText}. Streak energy.',
      'Added "{title}"{timeText}{recurrenceText}. You got this 💪'
    ],
    complete: [
      'Let’s gooo. "{title}" is done ✅',
      'We love a finisher. "{title}" checked.',
      'Nice. "{title}" complete. Keep the streak alive.'
    ],
    clarify: [
      'Which one did you smash?',
      'Which task did you clear?',
      'Name the one you finished.'
    ],
    status: [
      'Here is the mission list:',
      'Today’s quest log:',
      'Your lineup:'
    ],
    greeting: [
      'Hey {name}! Ready to keep the streak alive?',
      '{name}, we move. Status or new task?',
      'Yo {name} — want your plan or add something?'
    ]
  },
  strict_but_supportive: {
    add_task: [
      'Added "{title}"{timeText}{recurrenceText}. Let us actually do it this time.',
      'Scheduled "{title}"{timeText}{recurrenceText}. No hiding now.',
      'Okay. "{title}"{timeText}{recurrenceText} is on the board. Execute.'
    ],
    complete: [
      'Good. "{title}" is done. Keep it going.',
      'Marked "{title}" complete. Let us not stall.',
      'Nice. "{title}" done. Next one when ready.'
    ],
    clarify: [
      'Which task did you actually finish?',
      'Which one should I mark done?',
      'Be specific — which task?'
    ],
    status: [
      'Here is what is still pending:',
      'Remaining tasks:',
      'Still on deck:'
    ],
    greeting: [
      'Hey {name}. Let us get this day under control. Status or add task?',
      '{name}, quick check-in — want the plan?',
      'You in, {name}? Status or add something.'
    ]
  }
};

function formatTemplate(template, tokens) {
  return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? '');
}

function composeMessage(type, tone, tokens) {
  const pool = tonePools[tone] || tonePools.friendly_supportive;
  const choices = pool[type] || tonePools.friendly_supportive[type] || [];
  if (!choices.length) return '';
  const template = pickRandom(choices);
  return formatTemplate(template, tokens);
}

module.exports = {
  composeMessage
};

