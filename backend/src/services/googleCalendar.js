const { google } = require('googleapis');
const supabase = require('../config/supabase');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URL;
const scope = process.env.GOOGLE_CALENDAR_SCOPE || 'https://www.googleapis.com/auth/calendar.readonly';

function getOAuthClient() {
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Calendar OAuth credentials not configured');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function storeTokens(userId, tokens) {
  if (!userId || !tokens?.access_token) return null;
  const payload = {
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    scope: tokens.scope || null,
    token_type: tokens.token_type || null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: fetchError } = await supabase
    .from('google_calendar_tokens')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing?.id) {
    const { data, error } = await supabase
      .from('google_calendar_tokens')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getTokens(userId) {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function generateAuthUrl(userId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state: userId
  });
}

async function exchangeCodeForTokens(code, userId) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  await storeTokens(userId, tokens);
  return tokens;
}

async function fetchEvents(userId, timeMin, timeMax) {
  const tokens = await getTokens(userId);
  if (!tokens) {
    return [];
  }
  const client = getOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });
  return response.data.items || [];
}

module.exports = {
  generateAuthUrl,
  exchangeCodeForTokens,
  fetchEvents,
  getTokens
};
