const { Resend } = require('resend');

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const HOT_KEYWORDS = [
  'price', 'cost', 'how much', 'quote',
  'schedule', 'appointment', 'book', 'available', 'availability',
  'when can', 'interested', 'sign up',
];

function isHotLead(message) {
  const lower = message.toLowerCase();
  return HOT_KEYWORDS.some(kw => lower.includes(kw));
}

async function sendHotLeadAlert({ instagramUserId, username, message, aiReply }) {
  if (!isHotLead(message)) return false;
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'replace_with_your_resend_key') {
    console.log('[Alert] Resend not configured — skipping email');
    return false;
  }

  const displayName = username ? `@${username}` : `User ${instagramUserId}`;

  const { error } = await resend().emails.send({
    from: process.env.RESEND_FROM ?? 'ARIZN <onboarding@resend.dev>',
    to: process.env.ALERT_EMAIL ?? 'arita.saas@gmail.com',
    subject: `🔥 Hot lead on Instagram: ${displayName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1A56FF">🔥 Hot lead detected</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px;font-weight:bold;width:140px">Instagram user</td>
            <td style="padding:8px">${displayName}</td>
          </tr>
          <tr style="background:#f5f5f5">
            <td style="padding:8px;font-weight:bold">Their message</td>
            <td style="padding:8px">"${message}"</td>
          </tr>
          <tr>
            <td style="padding:8px;font-weight:bold">AI replied</td>
            <td style="padding:8px">"${aiReply}"</td>
          </tr>
          <tr style="background:#f5f5f5">
            <td style="padding:8px;font-weight:bold">Time</td>
            <td style="padding:8px">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</td>
          </tr>
        </table>
        <p style="margin-top:24px;color:#666">Log in to Instagram to follow up personally.</p>
      </div>
    `,
  });

  if (error) {
    console.error('[Alert] Resend error:', error.message);
    return false;
  }

  console.log('[Alert] Hot lead email sent for', displayName);
  return true;
}

module.exports = { sendHotLeadAlert, isHotLead };
