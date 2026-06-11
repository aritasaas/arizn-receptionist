const { processMessage } = require('../../lib/reply');

// Manual trigger endpoint — useful for testing without a real Instagram DM
// POST /api/reply  { "senderId": "12345", "message": "how much does it cost?" }
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { senderId, message } = req.body ?? {};

  if (!senderId || !message) {
    return res.status(400).json({ error: 'senderId and message are required' });
  }

  try {
    await processMessage({
      sender: { id: senderId },
      message: { text: message },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[/api/reply]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
