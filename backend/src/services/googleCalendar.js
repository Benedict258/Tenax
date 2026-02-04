const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI
  || process.env.GOOGLE_CALENDAR_REDIRECT_URL
  || (process.env.BACKEND_PUBLIC_URL ? `${process.env.BACKEND_PUBLIC_URL.replace(/\/$/, '')}/api/integrations/google/callback` : null);
const scope = process.env.GOOGLE_CALENDAR_SCOPE || 'https://www.googleapis.com/auth/calendar.readonly';
const provider = 'google_calendar';
const stateSecret = process.env.JWT_SECRET || 'tenax-calendar-state';

function getOAuthClient() {
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Calendar OAuth credentials not configured');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function buildStateToken(userId) {
  const nonce = Math.random().toString(36).slice(2);
  return jwt.sign({ uid: userId, nonce }, stateSecret, { expiresIn: '10m' });
}

function parseStateToken(state) {
  const decoded = jwt.verify(state, stateSecret);
  return decoded?.uid;
}

async function storeTokens(userId, tokens, accountEmail = null) {
  if (!userId || !tokens?.access_token) return null;
  const payload = {
    user_id: userId,
    provider,
    status: 'connected',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scopes: tokens.scope || scope,
    provider_account_email: accountEmail,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: fetchError } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing?.id) {
    const { data, error } = await supabase
      .from('user_integrations')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('user_integrations')
    .insert([{ ...payload, created_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getTokens(userId) {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
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
    state: buildStateToken(userId)
  });
}

async function exchangeCodeForTokens(code, state) {
  const client = getOAuthClient();
  const userId = parseStateToken(state);
  const { tokens } = await client.getToken(code);
  await storeTokens(userId, tokens);
  return { userId, tokens };
}

async function disconnect(userId) {
  const { error } = await supabase
    .from('user_integrations')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null,
      token_expiry: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) throw error;
}

async function fetchEvents(userId, timeMin, timeMax) {
  const tokens = await getTokens(userId);
  if (!tokens?.access_token) {
    return [];
  }
  const client = getOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token
  });
  if (tokens.token_expiry && new Date(tokens.token_expiry).getTime() <= Date.now() + 60000 && tokens.refresh_token) {
    const refreshed = await client.refreshAccessToken();
    if (refreshed?.credentials?.access_token) {
      await storeTokens(userId, refreshed.credentials, tokens.provider_account_email || null);
      client.setCredentials({
        access_token: refreshed.credentials.access_token,
        refresh_token: tokens.refresh_token
      });
    }
  }
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
  getTokens,
  disconnect
};
