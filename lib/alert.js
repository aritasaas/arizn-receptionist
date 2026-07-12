const { Resend } = require('resend');

let _resend;
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function resendConfigured() {
  return !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'replace_with_your_resend_key';
}

// M1: DM content is user-controlled — escape it before it lands in HTML
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// M4: word-boundary matching — "book" no longer matches "facebook".
// Only used when a client explicitly configures hot_lead_keywords;
// otherwise hot lead detection comes from the AI (see lib/groq.js).
function matchesKeywords(message, keywords) {
  return (keywords ?? []).some((kw) => {
    const pattern = new RegExp(`\\b${escapeRegExp(kw.trim())}\\b`, 'i');
    return pattern.test(message);
  });
}

const DEFAULT_ALERT_EMAIL = process.env.ALERT_EMAIL ?? 'pedro@arizn.co';

async function sendHotLeadAlert({ client, instagramUserId, username, message, aiReply }) {
  if (!resendConfigured()) {
    console.log('[Alert] Resend not configured — skipping email');
    return false;
  }

  const displayName = username ? `@${username}` : `User ${instagramUserId}`;
  const to = client?.alert_email ?? DEFAULT_ALERT_EMAIL;

  const { error } = await resend().emails.send({
    from: process.env.RESEND_FROM ?? 'ARIZN <onboarding@resend.dev>',
    to,
    subject: `🔥 Hot lead on Instagram: ${displayName}${client?.business_name ? ` → ${client.business_name}` : ''}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1A56FF">🔥 Hot lead detected</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:8px;font-weight:bold;width:140px">Business</td>
            <td style="padding:8px">${escapeHtml(client?.business_name ?? '—')}</td>
          </tr>
          <tr style="background:#f5f5f5">
            <td style="padding:8px;font-weight:bold">Instagram user</td>
            <td style="padding:8px">${escapeHtml(displayName)}</td>
          </tr>
          <tr>
            <td style="padding:8px;font-weight:bold">Their message</td>
            <td style="padding:8px">"${escapeHtml(message)}"</td>
          </tr>
          <tr style="background:#f5f5f5">
            <td style="padding:8px;font-weight:bold">AI replied</td>
            <td style="padding:8px">"${escapeHtml(aiReply)}"</td>
          </tr>
          <tr>
            <td style="padding:8px;font-weight:bold">Time</td>
            <td style="padding:8px">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</td>
          </tr>
        </table>
        <p style="margin-top:24px;color:#666">Log in to Instagram to follow up personally. Replying manually pauses the AI for this conversation for 2 hours.</p>
      </div>
    `,
  });

  if (error) {
    console.error('[Alert] Resend error:', error.message);
    return false;
  }

  console.log('[Alert] Hot lead email sent for', displayName, '→', to);
  return true;
}

// Operational alerts (token refresh failures, health check failures)
async function sendOpsAlert(subject, lines) {
  if (!resendConfigured()) {
    console.log('[Alert] Resend not configured — skipping ops email:', subject);
    return false;
  }

  const { error } = await resend().emails.send({
    from: process.env.RESEND_FROM ?? 'ARIZN <onboarding@resend.dev>',
    to: DEFAULT_ALERT_EMAIL,
    subject: `⚠️ ARIZN Receptionist: ${subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#c0392b">⚠️ ${escapeHtml(subject)}</h2>
        <ul>${(lines ?? []).map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
        <p style="color:#666">Time: ${new Date().toISOString()}</p>
      </div>
    `,
  });

  if (error) {
    console.error('[Alert] Resend ops error:', error.message);
    return false;
  }
  return true;
}

module.exports = { sendHotLeadAlert, sendOpsAlert, matchesKeywords, escapeHtml };
