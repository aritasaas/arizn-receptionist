const axios = require('axios');

const GRAPH_URL = 'https://graph.instagram.com/v19.0';

async function sendDM(recipientId, text) {
  try {
    await axios.post(
      `${GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
      },
      {
        params: { access_token: process.env.META_ACCESS_TOKEN },
      }
    );
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    throw new Error(`[Instagram] sendDM failed: ${detail}`);
  }
}

module.exports = { sendDM };
