const { createClient } = require('@supabase/supabase-js');

/*
  Run in Supabase SQL Editor before first use:

  CREATE TABLE IF NOT EXISTS leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    instagram_user_id text NOT NULL,
    username text,
    first_message text,
    status text DEFAULT 'new',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    instagram_user_id text NOT NULL,
    role text NOT NULL,
    message text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
*/

let _client;
function db() {
  if (!_client) _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  return _client;
}

// Insert lead only on first contact — silently skips if already exists
async function upsertLead({ instagramUserId, username, firstMessage }) {
  const { data: existing } = await db()
    .from('leads')
    .select('id')
    .eq('instagram_user_id', instagramUserId)
    .maybeSingle();

  if (!existing) {
    const { error } = await db().from('leads').insert({
      instagram_user_id: instagramUserId,
      username: username ?? null,
      first_message: firstMessage,
    });
    if (error) console.error('[Supabase] upsertLead:', error.message);
  }
}

async function saveMessage({ instagramUserId, role, message }) {
  const { error } = await db().from('conversations').insert({
    instagram_user_id: instagramUserId,
    role,
    message,
  });
  if (error) throw new Error(`[Supabase] saveMessage: ${error.message}`);
}

// Returns last N messages ordered oldest → newest for Groq context
async function getHistory(instagramUserId, limit = 10) {
  const { data, error } = await db()
    .from('conversations')
    .select('role, message')
    .eq('instagram_user_id', instagramUserId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) console.error('[Supabase] getHistory:', error.message);
  return data ?? [];
}

async function markLeadHot(instagramUserId) {
  await db()
    .from('leads')
    .update({ status: 'hot' })
    .eq('instagram_user_id', instagramUserId);
}

module.exports = { upsertLead, saveMessage, getHistory, markLeadHot };
