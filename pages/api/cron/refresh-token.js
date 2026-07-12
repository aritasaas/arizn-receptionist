const { refreshAccessToken } = require('../../../lib/instagram');
const {
  getActiveClients,
  updateClientToken,
  getConfigValue,
  setConfigValue,
} = require('../../../lib/supabase');
const { sendOpsAlert } = require('../../../lib/alert');

// Vercel Cron sends "Authorization: Bearer ${CRON_SECRET}" when the env var
// is set on the project. Without CRON_SECRET the endpoint stays open — set it.
function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[Cron] CRON_SECRET not set — endpoint is unprotected');
    return true;
  }
  return req.headers['authorization'] === `Bearer ${secret}`;
}

// Refreshes every stored long-lived Instagram token (60-day expiry) —
// per-client tokens in the clients table plus the shared default token in
// the config table (bootstrapped from META_ACCESS_TOKEN on first run).
export default async function handler(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });

  const results = [];
  const failures = [];

  try {
    const clients = await getActiveClients();
    for (const client of clients) {
      if (!client.access_token) continue;
      try {
        const newToken = await refreshAccessToken(client.access_token);
        await updateClientToken(client.id, newToken);
        results.push(`${client.business_name}: refreshed`);
      } catch (err) {
        failures.push(`${client.business_name}: ${err.message}`);
      }
    }
  } catch (err) {
    failures.push(`clients lookup: ${err.message}`);
  }

  const defaultToken = (await getConfigValue('default_access_token')) ?? process.env.META_ACCESS_TOKEN;
  if (defaultToken) {
    try {
      const newToken = await refreshAccessToken(defaultToken);
      await setConfigValue('default_access_token', newToken);
      results.push('default token: refreshed');
    } catch (err) {
      failures.push(`default token: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    console.error('[Cron] Token refresh failures:', failures);
    await sendOpsAlert('Instagram token refresh failed', failures);
    return res.status(500).json({ ok: false, refreshed: results, failures });
  }

  console.log('[Cron] Token refresh OK:', results);
  return res.status(200).json({ ok: true, refreshed: results });
}
