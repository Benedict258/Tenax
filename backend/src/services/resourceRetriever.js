const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', '..', 'logs', 'resource_cache.json');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3;

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {
    // ignore
  }
}

const cache = loadCache();

async function tavilySearch(query, maxResults = 5, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  const { searchDepth = 'basic' } = options;
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: false,
      search_depth: searchDepth
    })
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data?.results || [];
}

function fallbackResources(goal, phaseTitle) {
  const seed = `${goal} ${phaseTitle}`.toLowerCase();
  const picks = [
    { title: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn', type: 'course' },
    { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', type: 'docs' },
    { title: 'Coursera', url: 'https://www.coursera.org/', type: 'course' },
    { title: 'Khan Academy', url: 'https://www.khanacademy.org/', type: 'course' },
    { title: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/', type: 'course' }
  ];
  return seed.includes('ai') || seed.includes('ml')
    ? [
        { title: 'DeepLearning.AI', url: 'https://www.deeplearning.ai/', type: 'course' },
        { title: 'Fast.ai', url: 'https://www.fast.ai/', type: 'course' },
        { title: 'Hugging Face Course', url: 'https://huggingface.co/learn', type: 'course' }
      ]
    : picks.slice(0, 3);
}

async function retrieveResources(goal, phaseTitle, options = {}) {
  const { forceRefresh = false, recencyHint = '2024 2025' } = options;
  const key = `${goal}::${phaseTitle}`.toLowerCase();
  const cached = cache[key];
  if (!forceRefresh && cached && Date.now() - cached.updated_at < CACHE_TTL_MS) {
    return cached.items;
  }

  const query = `${goal} ${phaseTitle} official documentation tutorial ${recencyHint}`;
  const results = await tavilySearch(query, 6, { searchDepth: 'advanced' });
  let items = [];
  if (Array.isArray(results) && results.length) {
    items = results
      .filter((result) => result.url && result.title)
      .slice(0, 6)
      .map((result) => ({
        title: result.title,
        url: result.url,
        type: 'resource'
      }));
  } else {
    items = fallbackResources(goal, phaseTitle);
  }

  cache[key] = { updated_at: Date.now(), items };
  saveCache(cache);
  return items;
}

module.exports = {
  retrieveResources,
  async retrieveResearchPack(goal, resolutionType = 'skill_based') {
    const seed = `${goal}`.trim();
    if (!seed) return [];
    const key = `research::${seed}`.toLowerCase();
    const cached = cache[key];
    if (cached && Date.now() - cached.updated_at < CACHE_TTL_MS) {
      return cached.items;
    }

    const typeHint =
      resolutionType === 'habit_based'
        ? 'routine plan'
        : resolutionType === 'outcome_based'
        ? 'milestone plan'
        : 'learning roadmap';
    const queries = [
      `${seed} ${typeHint} syllabus`,
      `${seed} curriculum topics`,
      `${seed} official documentation`,
      `${seed} roadmap`
    ];

    const allResults = [];
    for (const query of queries) {
      // eslint-disable-next-line no-await-in-loop
      const results = await tavilySearch(query, 5, { searchDepth: 'advanced' });
      if (Array.isArray(results)) {
        allResults.push(...results);
      }
    }

    const unique = [];
    const seen = new Set();
    allResults.forEach((result) => {
      if (!result?.url || !result?.title) return;
      if (seen.has(result.url)) return;
      seen.add(result.url);
      unique.push({ title: result.title, url: result.url });
    });

    const items = unique.slice(0, 10);
    cache[key] = { updated_at: Date.now(), items };
    saveCache(cache);
    return items;
  }
};
