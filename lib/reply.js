const { getAIResponse } = require('./groq');
const { sendDM } = require('./instagram');
const { upsertLead, saveMessage, getHistory, markLeadHot } = require('./supabase');
const { sendHotLeadAlert, isHotLead } = require('./alert');

async function processMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message?.text;

  // Skip non-text messages (stickers, reactions, etc.)
  if (!messageText || messageText.trim() === '') return;

  console.log(`[Reply] Message from ${senderId}: "${messageText}"`);

  try {
    // 1. Save lead (no-op if already exists)
    await upsertLead({
      instagramUserId: senderId,
      username: null, // Instagram webhook doesn't include username in DM events
      firstMessage: messageText,
    });

    // 2. Save incoming user message
    await saveMessage({ instagramUserId: senderId, role: 'user', message: messageText });

    // 3. Fetch conversation history (last 10 messages for context)
    const history = await getHistory(senderId, 10);
    // Exclude the message we just saved — Groq will receive it as the current turn
    const historyWithoutCurrent = history.slice(0, -1);

    // 4. Get AI response
    const aiReply = await getAIResponse(messageText, historyWithoutCurrent);
    console.log(`[Reply] AI response: "${aiReply}"`);

    // 5. Send reply via Instagram
    await sendDM(senderId, aiReply);

    // 6. Save AI response
    await saveMessage({ instagramUserId: senderId, role: 'assistant', message: aiReply });

    // 7. Check for hot keywords → email alert + mark lead
    const isHot = isHotLead(messageText);
    if (isHot) {
      await markLeadHot(senderId);
      await sendHotLeadAlert({
        instagramUserId: senderId,
        username: null,
        message: messageText,
        aiReply,
      });
    }
  } catch (err) {
    console.error('[Reply] Error processing message:', err.message);
    // Attempt a fallback reply so the user isn't left on read
    try {
      await sendDM(senderId, "Thanks for reaching out! We'll get back to you shortly.");
    } catch (_) {}
  }
}

module.exports = { processMessage };
