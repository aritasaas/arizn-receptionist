const { processMessage } = require('../../lib/reply');

export default async function handler(req, res) {
  // ── GET: Meta webhook verification ───────────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[Webhook] GET verify:', { mode, token, challenge });

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Token mismatch' });
  }

  // ── POST: Any incoming payload ────────────────────────────────────────────
  if (req.method === 'POST') {
    res.status(200).end();

    const body = req.body;

    // Log the FULL raw payload — helps diagnose what Meta is actually sending
    console.log('[Webhook] POST received. object:', body.object);
    console.log('[Webhook] Full payload:', JSON.stringify(body, null, 2));

    if (!body.entry || body.entry.length === 0) {
      console.log('[Webhook] No entries in payload');
      return;
    }

    for (const entry of body.entry) {
      console.log('[Webhook] Entry keys:', Object.keys(entry));

      // Instagram Messaging API sends under "messaging"
      const messagingEvents = entry.messaging ?? [];
      // Some integrations send under "changes" instead
      const changes = entry.changes ?? [];

      console.log('[Webhook] messaging events:', messagingEvents.length);
      console.log('[Webhook] changes:', changes.length);

      // Handle messaging events
      for (const event of messagingEvents) {
        console.log('[Webhook] Event:', JSON.stringify(event));
        if (!event.message || event.message.is_echo) {
          console.log('[Webhook] Skipping — no message or echo');
          continue;
        }
        processMessage(event).catch(err =>
          console.error('[Webhook] processMessage error:', err.message)
        );
      }

      // Handle changes (alternative payload format)
      for (const change of changes) {
        console.log('[Webhook] Change field:', change.field, JSON.stringify(change.value));
      }
    }

    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
