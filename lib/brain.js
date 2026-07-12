const axios = require('axios');

// ARIZN Brain (Relayline) integration — fire events so Instagram leads show
// up in the internal CRM. Fully optional: without BRAIN_API_URL and
// BRAIN_AUTH_TOKEN this is a silent no-op. A 2s timeout guarantees a Brain
// outage never delays the reply to the customer.
async function notifyBrain(eventType, payload) {
  const url = process.env.BRAIN_API_URL;
  const token = process.env.BRAIN_AUTH_TOKEN;
  if (!url || !token) return false;

  try {
    await axios.post(
      url,
      {
        event: eventType,
        channel: 'system:receptionist',
        timestamp: new Date().toISOString(),
        ...payload,
      },
      {
        timeout: 2000,
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log(`[Brain] Sent ${eventType}`);
    return true;
  } catch (err) {
    console.error(`[Brain] ${eventType} failed:`, err.message);
    return false;
  }
}

module.exports = { notifyBrain };
