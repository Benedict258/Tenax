const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_TIMEOUT_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS || 20000);
const DEFAULT_RETRIES = Number(process.env.SUPABASE_FETCH_RETRIES || 2);
const DEFAULT_BACKOFF_MS = Number(process.env.SUPABASE_FETCH_BACKOFF_MS || 300);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = DEFAULT_RETRIES) {
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      const backoff = DEFAULT_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoff);
      attempt += 1;
    }
  }
  throw lastError;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON key) in .env'
  );
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  { global: { fetch: fetchWithRetry } }
);

const supabaseAuth = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || supabaseKey || 'placeholder-key',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry }
  }
);

supabase
  .from('users')
  .select('id', { count: 'exact', head: true })
  .then(() => console.log('Supabase client initialized'))
  .catch((error) => {
    console.error('Supabase init failed:', error.message);
  });

module.exports = supabase;
module.exports.supabase = supabase;
module.exports.supabaseAuth = supabaseAuth;
module.exports.supabaseAdmin = supabase;
