const Groq = require('groq-sdk');

let _groq;
function client() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// Builds the per-client system prompt from the clients table. A custom
// system_prompt overrides the generated one; the JSON output contract is
// always appended so hot lead / booking detection keeps working (M4).
function buildSystemPrompt(clientConfig) {
  const {
    business_name,
    business_type,
    services,
    hours,
    tone_of_voice,
    system_prompt,
    calendly_url,
  } = clientConfig;

  let base;
  if (system_prompt) {
    base = system_prompt;
  } else {
    const lines = [
      `You are the virtual receptionist for ${business_name}${business_type ? `, a ${business_type}` : ''}. You reply to Instagram DMs from potential customers.`,
    ];
    if (Array.isArray(services) && services.length > 0) {
      lines.push(`Services offered: ${services.join(', ')}.`);
    }
    if (hours) lines.push(`Business hours: ${hours}.`);
    lines.push(`Tone of voice: ${tone_of_voice || 'friendly, helpful, conversational'}.`);
    lines.push(
      'Keep replies under 3 sentences. Answer in the same language the customer writes in. Never invent prices, discounts, or availability you were not given — offer to have the team confirm instead.'
    );
    base = lines.join('\n');
  }

  const booking = calendly_url
    ? `If the customer wants to book or schedule, naturally share this exact booking link in your reply: ${calendly_url}`
    : 'If the customer wants to book or schedule, tell them a team member will reach out shortly to confirm a time, and ask for their preferred day and time.';

  const jsonContract = `Respond ONLY with a JSON object in this exact format:
{"reply": "<your message to the customer>", "hot_lead": <true or false>, "booking_intent": <true or false>}
Set "hot_lead" to true when the customer shows buying intent in any language — asking about pricing, quotes, booking, availability, or signing up. Set "booking_intent" to true when the customer wants to schedule an appointment or visit.`;

  return `${base}\n\n${booking}\n\n${jsonContract}`;
}

// Single Groq call returns the reply AND intent flags (M4) — no extra cost.
// Returns { reply, hotLead, bookingIntent }.
async function getAIResponse(clientConfig, userMessage, history = []) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(clientConfig) },
    // Inject conversation history for context
    ...history.map((h) => ({ role: h.role, content: h.message })),
    { role: 'user', content: userMessage },
  ];

  const completion = await client().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.65,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages,
  });

  const raw = (completion.choices[0].message.content ?? '').trim();

  try {
    const parsed = JSON.parse(raw);
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (!reply) throw new Error('empty reply field');
    return {
      reply,
      hotLead: parsed.hot_lead === true,
      bookingIntent: parsed.booking_intent === true,
    };
  } catch (err) {
    // Model broke the JSON contract — salvage the raw text as the reply
    console.error('[Groq] JSON parse failed, using raw content:', err.message);
    return { reply: raw, hotLead: false, bookingIntent: false };
  }
}

module.exports = { getAIResponse, buildSystemPrompt };
