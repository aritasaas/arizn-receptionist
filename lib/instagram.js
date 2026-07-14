const axios = require('axios');

// B2: version is current default but overridable without a redeploy
const GRAPH_VERSION = process.env.GRAPH_API_VERSION || 'v23.0';
const GRAPH_URL = `https://graph.instagram.com/${GRAPH_VERSION}`;

// Sends a DM and returns the message id (mid) Meta assigned — reply.js
// stores it so echo events can tell AI messages apart from human ones.
async function sendDM(recipientId, text, accessToken) {
  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
      },
      {
        params: { access_token: accessToken },
      }
    );
    return data?.message_id ?? null;
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    throw new Error(`[Instagram] sendDM failed: ${detail}`);
  }
}

// Sends one private reply to the Instagram user who left a comment.
// Meta allows one private reply per comment; callers dedupe before sending.
async function sendPrivateReplyToComment(instagramAccountId, commentId, text, accessToken) {
  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${instagramAccountId}/messages`,
      {
        recipient: { comment_id: commentId },
        message: { text },
      },
      {
        headers: { authorization: `Bearer ${accessToken}` },
      }
    );
    return {
      recipientId: data?.recipient_id ?? null,
      messageId: data?.message_id ?? null,
    };
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    throw new Error(`[Instagram] private reply failed: ${detail}`);
  }
}

// Fetches the public profile of an Instagram-scoped user id.
// Returns null on failure — profile data is nice-to-have, never blocking.
async function getUserProfile(userId, accessToken) {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${userId}`, {
      params: { fields: 'username,name', access_token: accessToken },
    });
    return { username: data.username ?? null, name: data.name ?? null };
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    console.error('[Instagram] getUserProfile failed:', detail);
    return null;
  }
}

// Refreshes a long-lived Instagram access token (valid 60 days, must be
// at least 24h old to refresh). Returns the new token string.
async function refreshAccessToken(accessToken) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: { grant_type: 'ig_refresh_token', access_token: accessToken },
    });
    if (!data?.access_token) throw new Error('no access_token in refresh response');
    return data.access_token;
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    throw new Error(`[Instagram] refreshAccessToken failed: ${detail}`);
  }
}

// Lightweight token validity probe for the health check
async function checkToken(accessToken) {
  try {
    await axios.get(`${GRAPH_URL}/me`, {
      params: { fields: 'user_id,username', access_token: accessToken },
    });
    return true;
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message;
    console.error('[Instagram] checkToken failed:', detail);
    return false;
  }
}

module.exports = {
  sendDM,
  sendPrivateReplyToComment,
  getUserProfile,
  refreshAccessToken,
  checkToken,
};
