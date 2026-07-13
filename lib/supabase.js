const { createClient } = require('@supabase/supabase-js');

/*
  Schema — run in the Supabase SQL Editor (idempotent, safe to re-run).
  The full migration also lives in README.md.

  CREATE TABLE IF NOT EXISTS clients (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    instagram_page_id text UNIQUE NOT NULL,
    business_name text NOT NULL,
    business_type text,
    services text[],
    hours text,
    tone_of_voice text,
    system_prompt text,            -- custom override; NULL = auto-generated from fields above
    hot_lead_keywords text[],      -- empty/NULL = AI-based hot lead detection
    alert_email text,
    calendly_url text,             -- NULL = no booking link (Tier 2)
    access_token text,             -- per-client IG token; NULL = fall back to default
    token_expires_at timestamptz,
    instagram_connected_at timestamptz,
    instagram_connection_status text DEFAULT 'inactive',
    instagram_username text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    instagram_user_id text NOT NULL,
    username text,
    first_message text,
    status text DEFAULT 'new',
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS name text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz;
  CREATE UNIQUE INDEX IF NOT EXISTS leads_user_client_key
    ON leads (instagram_user_id, client_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    instagram_user_id text NOT NULL,
    role text NOT NULL,
    message text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS mid text;
  CREATE UNIQUE INDEX IF NOT EXISTS conversations_mid_key
    ON conversations (mid) WHERE mid IS NOT NULL;

  CREATE TABLE IF NOT EXISTS config (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz DEFAULT now()
  );
*/

let _client;
function db() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  return _client;
}

let _serverClient;
function serverDb() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('[Supabase] Missing SUPABASE_SERVICE_ROLE_KEY for privileged server operation');
  }
  if (!_serverClient) {
    _serverClient = createClient(process.env.SUPABASE_URL, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _serverClient;
}

// ── Clients (multi-tenant) ──────────────────────────────────────────────────

async function getClientByPageId(pageId) {
  const { data, error } = await serverDb()
    .from('clients')
    .select('*')
    .eq('instagram_page_id', pageId)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`[Supabase] getClientByPageId: ${error.message}`);
  return data;
}

async function getActiveClients() {
  const { data, error } = await serverDb().from('clients').select('*').eq('active', true);
  if (error) throw new Error(`[Supabase] getActiveClients: ${error.message}`);
  return data ?? [];
}

async function updateClientToken(clientId, accessToken) {
  const { error } = await serverDb()
    .from('clients')
    .update({ access_token: accessToken })
    .eq('id', clientId);
  if (error) throw new Error(`[Supabase] updateClientToken: ${error.message}`);
}

function supabaseOperationError(operation, error) {
  const err = new Error(`[Supabase] ${operation}: ${error?.message || 'unknown error'}`);
  err.operation = operation;
  err.supabase = {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
  return err;
}

async function saveInstagramConnection({
  instagramAccountId,
  username,
  name,
  accessToken,
  tokenExpiresAt,
}) {
  const connectedAt = new Date().toISOString();
  const businessName = name || username || `Instagram ${instagramAccountId}`;
  const connectionFields = {
    access_token: accessToken,
    token_expires_at: tokenExpiresAt,
    instagram_connected_at: connectedAt,
    instagram_connection_status: 'connected',
    instagram_username: username ?? null,
    active: true,
  };

  const { data: existing, error: lookupError } = await serverDb()
    .from('clients')
    .select('id')
    .eq('instagram_page_id', instagramAccountId)
    .maybeSingle();

  if (lookupError) throw supabaseOperationError('saveInstagramConnection lookup', lookupError);

  if (existing) {
    const { data, error } = await serverDb()
      .from('clients')
      .update(connectionFields)
      .eq('id', existing.id)
      .select('id, instagram_page_id, business_name, instagram_username, token_expires_at, instagram_connection_status, active')
      .maybeSingle();

    if (error) throw supabaseOperationError('saveInstagramConnection update', error);
    return data;
  }

  const { data, error } = await serverDb()
    .from('clients')
    .insert({
      instagram_page_id: instagramAccountId,
      business_name: businessName,
      ...connectionFields,
    })
    .select('id, instagram_page_id, business_name, instagram_username, token_expires_at, instagram_connection_status, active')
    .maybeSingle();

  if (error) throw supabaseOperationError('saveInstagramConnection insert', error);
  return data;
}

// ── Default access token (config table, refreshed by cron) ─────────────────

let _tokenCache = { value: null, fetchedAt: 0 };
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

async function getConfigValue(key) {
  const { data, error } = await serverDb().from('config').select('value').eq('key', key).maybeSingle();
  if (error) {
    console.error('[Supabase] getConfigValue:', error.message);
    return null;
  }
  return data?.value ?? null;
}

async function setConfigValue(key, value) {
  const { error } = await serverDb()
    .from('config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`[Supabase] setConfigValue: ${error.message}`);
}

// Resolution order: config table (kept fresh by the refresh cron) → env var.
// Cached for 5 minutes so we don't hit Supabase on every DM.
async function getDefaultAccessToken() {
  const now = Date.now();
  if (_tokenCache.value && now - _tokenCache.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return _tokenCache.value;
  }
  const stored = await getConfigValue('default_access_token');
  const token = stored ?? process.env.META_ACCESS_TOKEN ?? null;
  _tokenCache = { value: token, fetchedAt: now };
  return token;
}

// ── Leads ───────────────────────────────────────────────────────────────────

// Real upsert (M5): relies on the UNIQUE index on (instagram_user_id, client_id).
// Returns { isNew, lead } so callers can fetch the profile / notify Brain once.
async function upsertLead({ instagramUserId, clientId, firstMessage }) {
  const { data: inserted, error } = await serverDb()
    .from('leads')
    .upsert(
      {
        instagram_user_id: instagramUserId,
        client_id: clientId,
        first_message: firstMessage,
      },
      { onConflict: 'instagram_user_id,client_id', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (error) throw new Error(`[Supabase] upsertLead: ${error.message}`);
  if (inserted) return { isNew: true, lead: inserted };

  const { data: existing, error: fetchErr } = await serverDb()
    .from('leads')
    .select('*')
    .eq('instagram_user_id', instagramUserId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (fetchErr) throw new Error(`[Supabase] upsertLead fetch: ${fetchErr.message}`);
  return { isNew: false, lead: existing };
}

async function updateLeadProfile(instagramUserId, clientId, { username, name }) {
  const { error } = await serverDb()
    .from('leads')
    .update({ username: username ?? null, name: name ?? null })
    .eq('instagram_user_id', instagramUserId)
    .eq('client_id', clientId);
  if (error) console.error('[Supabase] updateLeadProfile:', error.message);
}

async function markLeadHot(instagramUserId, clientId) {
  const { error } = await serverDb()
    .from('leads')
    .update({ status: 'hot' })
    .eq('instagram_user_id', instagramUserId)
    .eq('client_id', clientId);
  if (error) throw new Error(`[Supabase] markLeadHot: ${error.message}`);
}

// Human takeover: pause the AI for this conversation until the given time.
// Upsert because the owner may message a user who has no lead row yet.
async function pauseAI(instagramUserId, clientId, untilISO) {
  const { error } = await serverDb()
    .from('leads')
    .upsert(
      {
        instagram_user_id: instagramUserId,
        client_id: clientId,
        ai_paused_until: untilISO,
      },
      { onConflict: 'instagram_user_id,client_id' }
    );
  if (error) throw new Error(`[Supabase] pauseAI: ${error.message}`);
}

// ── Conversations ───────────────────────────────────────────────────────────

async function messageExists(mid) {
  if (!mid) return false;
  const { data, error } = await serverDb()
    .from('conversations')
    .select('id')
    .eq('mid', mid)
    .maybeSingle();
  if (error) {
    console.error('[Supabase] messageExists:', error.message);
    return false;
  }
  return !!data;
}

// Returns 'ok' or 'duplicate' (M3: the unique index on mid catches webhook
// redeliveries that slip past the messageExists pre-check).
async function saveMessage({ instagramUserId, clientId, role, message, mid }) {
  const { error } = await serverDb().from('conversations').insert({
    instagram_user_id: instagramUserId,
    client_id: clientId,
    role,
    message,
    mid: mid ?? null,
  });
  if (error) {
    if (error.code === '23505') return 'duplicate';
    throw new Error(`[Supabase] saveMessage: ${error.message}`);
  }
  return 'ok';
}

// Returns last N messages ordered oldest → newest for Groq context
async function getHistory(instagramUserId, clientId, limit = 10) {
  const { data, error } = await serverDb()
    .from('conversations')
    .select('role, message')
    .eq('instagram_user_id', instagramUserId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) console.error('[Supabase] getHistory:', error.message);
  return (data ?? []).reverse();
}

module.exports = {
  getClientByPageId,
  getActiveClients,
  updateClientToken,
  saveInstagramConnection,
  getConfigValue,
  setConfigValue,
  getDefaultAccessToken,
  upsertLead,
  updateLeadProfile,
  markLeadHot,
  pauseAI,
  messageExists,
  saveMessage,
  getHistory,
};
