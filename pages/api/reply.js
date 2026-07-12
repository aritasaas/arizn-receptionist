const { processMessage } = require('../../lib/reply');
const { getClientByPageId, getActiveClients } = require('../../lib/supabase');

// Manual trigger endpoint — useful for testing without a real Instagram DM
// POST /api/reply  { "senderId": "12345", "message": "how much?", "pageId": "<optional>" }
// Requires header x-reply-secret matching REPLY_TEST_SECRET; disabled when unset
export default async function handler(req, res) {
  const secret = process.env.REPLY_TEST_SECRET;
  if (!secret || req.headers['x-reply-secret'] !== secret) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { senderId, message, pageId } = req.body ?? {};

  if (!senderId || !message) {
    return res.status(400).json({ error: 'senderId and message are required' });
  }

  try {
    let client;
    if (pageId) {
      client = await getClientByPageId(pageId);
    } else {
      const clients = await getActiveClients();
      client = clients[0];
    }
    if (!client) {
      return res.status(400).json({ error: 'No active client found — add a row to the clients table' });
    }

    await processMessage(
      {
        sender: { id: senderId },
        message: { text: message, mid: `test-${Date.now()}` },
      },
      client
    );
    return res.status(200).json({ ok: true, client: client.business_name });
  } catch (err) {
    console.error('[/api/reply]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
