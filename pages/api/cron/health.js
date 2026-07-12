const Groq = require('groq-sdk');
const { checkToken } = require('../../../lib/instagram');
const { getActiveClients, getDefaultAccessToken } = require('../../../lib/supabase');
const { sendOpsAlert } = require('../../../lib/alert');

function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[Cron] CRON_SECRET not set — endpoint is unprotected');
    return true;
  }
  return req.headers['authorization'] === `Bearer ${secret}`;
}

// Daily health check: Groq, Supabase, and every Instagram token in use.
// Any failure emails ALERT_EMAIL via Resend.
export default async function handler(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const failures = [];
  let clients = [];

  // Supabase (also catches a missing clients table after a bad migration)
  try {
    clients = await getActiveClients();
    if (clients.length === 0) failures.push('Supabase OK but no active clients configured');
  } catch (err) {
    failures.push(`Supabase: ${err.message}`);
  }

  // Groq — models.list() is free, no tokens spent
  try {
    await new Groq({ apiKey: process.env.GROQ_API_KEY }).models.list();
  } catch (err) {
    failures.push(`Groq: ${err.message}`);
  }

  // Instagram tokens — default + each per-client token
  const defaultToken = await getDefaultAccessToken();
  if (defaultToken) {
    if (!(await checkToken(defaultToken))) failures.push('Instagram: default token invalid');
  }
  for (const client of clients) {
    if (!client.access_token) continue;
    if (!(await checkToken(client.access_token))) {
      failures.push(`Instagram: token invalid for ${client.business_name}`);
    }
  }
  if (!defaultToken && clients.every((c) => !c.access_token)) {
    failures.push('Instagram: no access token configured anywhere');
  }

  if (failures.length > 0) {
    console.error('[Health] FAILURES:', failures);
    await sendOpsAlert('Health check failed', failures);
    return res.status(503).json({ ok: false, failures });
  }

  console.log('[Health] All systems OK');
  return res.status(200).json({ ok: true, clients: clients.length });
}
