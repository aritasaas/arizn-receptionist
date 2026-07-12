const { getAIResponse } = require('./groq');
const { sendDM, getUserProfile } = require('./instagram');
const {
  upsertLead,
  updateLeadProfile,
  saveMessage,
  getHistory,
  markLeadHot,
  pauseAI,
  messageExists,
  getDefaultAccessToken,
} = require('./supabase');
const { sendHotLeadAlert, matchesKeywords } = require('./alert');
const { notifyBrain } = require('./brain');
const { vlog } = require('./log');

const AI_PAUSE_MS = 2 * 60 * 60 * 1000; // human takeover pauses the AI for 2h

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Echo events fire for every message the business account sends — both the
// AI's own replies (whose mids we stored in `conversations`) and manual
// replies typed by the owner. An unknown mid means a human stepped in.
async function handleEcho(event, client) {
  const mid = event.message?.mid;
  const customerId = event.recipient?.id;
  if (!mid || !customerId) return;

  if (await messageExists(mid)) return; // our own AI message — ignore

  // The echo can race the insert of the mid we just sent — re-check once
  await sleep(2000);
  if (await messageExists(mid)) return;

  const pausedUntil = new Date(Date.now() + AI_PAUSE_MS).toISOString();
  await pauseAI(customerId, client.id, pausedUntil);
  console.log(`⏸️ AI paused — human responded (user ${customerId}, until ${pausedUntil})`);

  // Keep the owner's manual reply in history so the AI has context on resume
  if (event.message?.text) {
    await saveMessage({
      instagramUserId: customerId,
      clientId: client.id,
      role: 'assistant',
      message: event.message.text,
      mid,
    });
  }
}

async function processMessage(event, client) {
  if (event.message?.is_echo) {
    try {
      await handleEcho(event, client);
    } catch (err) {
      console.error('[Reply] Echo handling error:', err.message);
    }
    return;
  }

  const senderId = event.sender.id;
  const messageText = event.message?.text;
  const mid = event.message?.mid;

  // Skip non-text messages (stickers, reactions, etc.)
  if (!messageText || messageText.trim() === '') return;

  console.log(`[Reply] Message from ${senderId} → ${client.business_name}`);
  vlog(`[Reply] Content: "${messageText}"`);

  let replySent = false;

  try {
    // M3: skip webhook redeliveries
    if (await messageExists(mid)) {
      console.log('[Reply] Duplicate delivery (mid already seen) — skipping');
      return;
    }

    const accessToken = client.access_token || (await getDefaultAccessToken());
    if (!accessToken) throw new Error('no Instagram access token available');

    // 1. Upsert lead (atomic — M5)
    const { isNew, lead } = await upsertLead({
      instagramUserId: senderId,
      clientId: client.id,
      firstMessage: messageText,
    });

    // 2. New lead: fetch real profile + notify Brain
    if (isNew) {
      const profile = await getUserProfile(senderId, accessToken);
      if (profile) await updateLeadProfile(senderId, client.id, profile);
      await notifyBrain('lead.created', {
        client: client.business_name,
        instagram_user_id: senderId,
        username: profile?.username ?? null,
        first_message: messageText,
      });
    }

    // 3. History BEFORE saving the current message — it arrives as the
    //    current user turn, not as history
    const history = await getHistory(senderId, client.id, 10);

    // 4. Save incoming message; unique index on mid catches the race where
    //    two redeliveries pass the pre-check simultaneously
    const saved = await saveMessage({
      instagramUserId: senderId,
      clientId: client.id,
      role: 'user',
      message: messageText,
      mid,
    });
    if (saved === 'duplicate') {
      console.log('[Reply] Duplicate delivery (insert conflict) — skipping');
      return;
    }

    // 5. Human takeover pause — message stays saved for context, no AI reply
    if (lead?.ai_paused_until && new Date(lead.ai_paused_until) > new Date()) {
      console.log(`⏸️ AI paused for this conversation until ${lead.ai_paused_until} — not replying`);
      return;
    }

    // 6. AI reply + intent flags in a single Groq call
    const ai = await getAIResponse(client, messageText, history);
    vlog(`[Reply] AI response: "${ai.reply}"`);

    // 7. Send reply via Instagram; keep the mid so echo events recognize it
    const sentMid = await sendDM(senderId, ai.reply, accessToken);
    replySent = true;

    // 8. Save AI response
    await saveMessage({
      instagramUserId: senderId,
      clientId: client.id,
      role: 'assistant',
      message: ai.reply,
      mid: sentMid,
    });

    // 9. Hot lead: client-configured keywords win; otherwise trust the AI.
    //    Booking intent always marks hot — nobody is hotter than someone
    //    trying to book.
    const useKeywords =
      Array.isArray(client.hot_lead_keywords) && client.hot_lead_keywords.length > 0;
    const isHot =
      (useKeywords ? matchesKeywords(messageText, client.hot_lead_keywords) : ai.hotLead) ||
      ai.bookingIntent;

    if (isHot) {
      await markLeadHot(senderId, client.id);
      await sendHotLeadAlert({
        client,
        instagramUserId: senderId,
        username: lead?.username ?? null,
        message: messageText,
        aiReply: ai.reply,
      });
      await notifyBrain('lead.hot', {
        client: client.business_name,
        instagram_user_id: senderId,
        username: lead?.username ?? null,
        message: messageText,
        ai_reply: ai.reply,
        booking_intent: ai.bookingIntent,
      });
    }
  } catch (err) {
    console.error('[Reply] Error processing message:', err.message);
    // M2: only send the fallback if the real reply never went out
    if (!replySent) {
      try {
        const accessToken = client.access_token || (await getDefaultAccessToken());
        if (accessToken) {
          await sendDM(senderId, "Thanks for reaching out! We'll get back to you shortly.", accessToken);
        }
      } catch (fallbackErr) {
        console.error('[Reply] Fallback DM also failed:', fallbackErr.message);
      }
    }
  }
}

module.exports = { processMessage };
