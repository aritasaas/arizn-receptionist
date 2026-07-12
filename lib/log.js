// Verbose logging toggle (B3): set LOG_VERBOSE=true to log full payloads
// and message content. Keep it off in production — customer DM content
// should not sit in Vercel logs by default.
const VERBOSE = process.env.LOG_VERBOSE === 'true';

function vlog(...args) {
  if (VERBOSE) console.log(...args);
}

module.exports = { vlog, VERBOSE };
