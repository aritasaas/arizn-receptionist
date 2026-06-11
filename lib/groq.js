const Groq = require('groq-sdk');

let _groq;
function client() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// Pedro: customize this system prompt per client
const SYSTEM_PROMPT = `You are a friendly assistant for a local service business.
Answer questions about services, hours, and pricing in a helpful, conversational tone.
Keep responses under 3 sentences.
If someone asks about scheduling or pricing, express interest and ask for their contact info or best time to call.`;

async function getAIResponse(userMessage, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    // Inject conversation history for context
    ...history.map(h => ({ role: h.role, content: h.message })),
    { role: 'user', content: userMessage },
  ];

  const completion = await client().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.65,
    max_tokens: 200,
    messages,
  });

  return completion.choices[0].message.content.trim();
}

module.exports = { getAIResponse };
