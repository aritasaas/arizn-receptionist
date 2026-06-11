const { processMessage } = require('../../lib/reply');

export default async function handler(req, res) {
  // ── GET: Meta webhook verification handshake ──────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('[Webhook] Verified by Meta');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden — token mismatch' });
  }

  // ── POST: Incoming Instagram DM ───────────────────────────────────────────
  if (req.method === 'POST') {
    // Respond 200 immediately — Meta will retry if it doesn't get a fast response
    res.status(200).end();

    const body = req.body;

    // Only handle Instagram messaging events
    if (body.object !== 'instagram') return;

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        // Skip echo events (messages sent by us)
        if (!event.message || event.message.is_echo) continue;

        // Fire and don't await — response already sent
        processMessage(event).catch(err =>
          console.error('[Webhook] Unhandled processMessage error:', err.message)
        );
      }
    }

    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
