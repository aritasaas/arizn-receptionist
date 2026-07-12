const crypto = require('crypto');
const { processMessage } = require('../../lib/reply');
const { getClientByPageId } = require('../../lib/supabase');
const { vlog } = require('../../lib/log');

// Body parsing is disabled so we can verify Meta's X-Hub-Signature-256
// against the exact raw bytes they signed
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Returns true when the payload is authentic. If META_APP_SECRET isn't
// configured yet we let the request through but warn loudly.
function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    console.warn('[Webhook] META_APP_SECRET not set — accepting unverified payload');
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

export default async function handler(req, res) {
  // ── GET: Meta webhook verification ───────────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[Webhook] GET verify:', { mode });

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Token mismatch' });
  }

  // ── POST: Any incoming payload ────────────────────────────────────────────
  if (req.method === 'POST') {
    const rawBody = await readRawBody(req);

    if (!isValidSignature(rawBody, req.headers['x-hub-signature-256'])) {
      console.warn('[Webhook] Invalid X-Hub-Signature-256 — rejecting payload');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    let body;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      console.error('[Webhook] Malformed JSON body');
      return res.status(400).json({ error: 'Malformed JSON' });
    }

    console.log('[Webhook] POST received. object:', body.object);
    vlog('[Webhook] Full payload:', JSON.stringify(body, null, 2));

    // Multi-tenant routing: entry.id is the Instagram professional account
    // id — look up which client this webhook belongs to
    const jobs = [];

    for (const entry of body.entry ?? []) {
      const pageId = entry.id;
      const messagingEvents = entry.messaging ?? [];
      const changes = entry.changes ?? [];

      vlog('[Webhook] Entry:', pageId, 'messaging:', messagingEvents.length, 'changes:', changes.length);

      if (messagingEvents.length === 0) {
        for (const change of changes) {
          vlog('[Webhook] Change field:', change.field, JSON.stringify(change.value));
        }
        continue;
      }

      let client;
      try {
        client = await getClientByPageId(pageId);
      } catch (err) {
        console.error('[Webhook] Client lookup failed:', err.message);
        continue;
      }
      if (!client) {
        console.warn(`[Webhook] No active client for page ${pageId} — skipping. Add a row to the clients table.`);
        continue;
      }

      for (const event of messagingEvents) {
        vlog('[Webhook] Event:', JSON.stringify(event));
        // Echoes flow through: processMessage uses them for human takeover
        if (!event.message) continue;
        jobs.push(processMessage(event, client));
      }
    }

    // Await processing BEFORE responding: on Vercel the function can be
    // frozen as soon as the response is sent, killing in-flight work.
    // processMessage handles its own errors, so a failure here never
    // causes Meta to retry the whole batch.
    if (jobs.length > 0) {
      await Promise.allSettled(jobs);
    }

    return res.status(200).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}
