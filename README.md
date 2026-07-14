# ARIZN Receptionist — Instagram DM AI

AI receptionist that answers Instagram DMs 24/7 for local businesses: replies with Groq (Llama), qualifies leads, detects buying intent, alerts the owner by email, shares a Calendly link when the customer wants to book, and pauses itself when a human takes over the conversation. Multi-tenant: one deploy serves all clients.

It also supports Instagram comment keyword automation for Meta App Review: when someone comments configured keywords such as `PRICE`, `INFO`, or `BOOK` on a connected Instagram professional account's post, Meta sends a comment webhook and ARIZN sends that commenter one private DM reply.

> **⚠️ Repo location:** this repo currently lives at `aritasaas/arizn-receptionist` and must be moved to the **`ARIZN-CO`** GitHub org (`ARIZN-CO/arizn-receptionist`) to follow ARIZN's standard. Use GitHub's "Transfer ownership" (Settings → Danger Zone) and re-link the Vercel project afterwards.

## Stack

Next.js (pages router) · Groq `llama-3.1-8b-instant` · Supabase · Resend · Meta Instagram Graph API · Vercel (deploy + crons). **No Claude/Anthropic in this project.**

## Flow

1. Customer DMs the business Instagram → Meta calls `POST /api/webhook` (signature-verified with `META_APP_SECRET`)
2. Webhook routes by `entry.id` (Instagram professional account id) → matching row in the `clients` table
3. Deduplicates redeliveries by message `mid`; upserts the lead (fetching real `@username` on first contact); notifies ARIZN Brain (`lead.created`)
4. If the AI is paused for that conversation (human takeover), the message is stored but not answered
5. One Groq call returns `{reply, hot_lead, booking_intent}` using the client's generated (or custom) system prompt
6. Reply is sent via Graph API and stored with its `mid`
7. Hot lead (AI flag, or client keywords, or booking intent) → lead marked `hot` + Resend email + Brain `lead.hot`
8. If the owner replies manually (echo event with an unknown `mid`), the AI pauses for that conversation for 2 hours

### Comment-to-DM flow

1. Instagram user comments `PRICE`, `INFO`, `BOOK`, or a client-configured keyword on the business's Instagram media
2. Meta calls `POST /api/webhook` with a `comments` webhook change
3. Webhook routes by `entry.id` → matching active row in `clients`
4. `lib/comments.js` matches the comment text against `clients.comment_dm_keywords` or `COMMENT_DM_KEYWORDS`
5. The comment event is stored in `conversations` with `mid = comment:<comment_id>` before any DM is sent
6. The unique `conversations_mid_key` index prevents duplicate private replies on webhook redelivery
7. ARIZN sends a private reply through `POST /<IG_ACCOUNT_ID>/messages` with `recipient.comment_id`
8. The private reply event is stored in `conversations` with `mid = comment_reply:<message_id>`

## Setup

### 1. Supabase migration

Run in the SQL Editor (idempotent):

```sql
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_page_id text UNIQUE NOT NULL,
  business_name text NOT NULL,
  business_type text,
  services text[],
  hours text,
  tone_of_voice text,
  system_prompt text,
  hot_lead_keywords text[],
  comment_dm_keywords text[] DEFAULT ARRAY['PRICE','INFO','BOOK'],
  comment_dm_reply text,
  alert_email text,
  calendly_url text,
  access_token text,
  token_expires_at timestamptz,
  instagram_connected_at timestamptz,
  instagram_connection_status text DEFAULT 'inactive',
  instagram_username text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_user_id text NOT NULL,
  username text,
  first_message text,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_client_key
  ON leads (instagram_user_id, client_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_user_id text NOT NULL,
  role text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS mid text;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_mid_key
  ON conversations (mid) WHERE mid IS NOT NULL;

CREATE TABLE IF NOT EXISTS config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);
```

> Legacy `leads`/`conversations` rows (pre-multi-tenant) have `client_id = NULL` and are ignored by the new code. Keep or archive them as you prefer.

### 2. Add a client

**Required — the webhook skips any Instagram account without an active `clients` row.**

```sql
INSERT INTO clients (instagram_page_id, business_name, business_type, services, hours, tone_of_voice, alert_email, calendly_url)
VALUES (
  '17841400000000000',              -- IG professional account id (entry.id in webhook payloads)
  'Rio Cali Beauty Spa',
  'beauty spa',
  ARRAY['massage', 'facials', 'waxing'],
  'Mon–Sat 9am–7pm',
  'warm, professional',
  'owner@riocali.com',              -- NULL = falls back to ALERT_EMAIL
  'https://calendly.com/riocali'    -- NULL = Tier 2 (no booking link)
);
```

- `system_prompt`: leave NULL to auto-generate from the fields above; set to fully override.
- `hot_lead_keywords`: leave NULL/empty to use AI-based hot lead detection (recommended — works in any language); set an array to force word-boundary keyword matching.
- `comment_dm_keywords`: comment keywords that trigger an automatic private reply. Defaults to `PRICE`, `INFO`, and `BOOK` when unset.
- `comment_dm_reply`: optional private reply template. Supports `{{business_name}}` and `{{keyword}}`. If NULL, the app uses `COMMENT_DM_REPLY_MESSAGE` or a built-in safe default.
- `access_token`: per-client IG long-lived token; NULL falls back to the shared default (`config.default_access_token` → `META_ACCESS_TOKEN`).

### 3. Environment variables

Copy `.env.example` to `.env.local` and set the same vars on Vercel. See the file for the full annotated list.

Set `SUPABASE_SERVICE_ROLE_KEY` only in server environments (Vercel env vars or local `.env.local`). It is used by trusted API routes for RLS-protected writes such as Instagram OAuth connection persistence and must never be exposed as a `NEXT_PUBLIC_*` variable.

### 4. Meta App

- Webhook URL: `https://<deploy>/api/webhook`, verify token = `META_WEBHOOK_VERIFY_TOKEN`, subscribe to `messages`, `message_echoes`, and `comments`. Echoes power human takeover; comments power comment-to-DM automation.
- **App Review**: request Advanced Access for `instagram_business_manage_messages` and `instagram_business_manage_comments` before the bot can answer the general public (without approval, only app testers/test accounts work).

### Optional comment automation migration

The code works with safe defaults even before these columns exist. Run this migration to configure keywords and reply copy per client:

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS comment_dm_keywords text[] DEFAULT ARRAY['PRICE','INFO','BOOK'],
  ADD COLUMN IF NOT EXISTS comment_dm_reply text;

UPDATE clients
SET
  comment_dm_keywords = COALESCE(comment_dm_keywords, ARRAY['PRICE','INFO','BOOK']),
  comment_dm_reply = COALESCE(
    comment_dm_reply,
    'Thanks for commenting! We just sent you a DM with more info.'
  );
```

### 5. Crons (configured in `vercel.json`)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/health` | daily 12:00 UTC | Checks Groq, Supabase, and all IG tokens; emails on failure |
| `/api/cron/refresh-token` | monthly (1st, 03:00 UTC) | Refreshes all 60-day IG tokens (clients table + default) |

Set `CRON_SECRET` on Vercel — the platform sends it automatically; without it the endpoints are open.

## Testing without Instagram

```bash
curl -X POST https://<deploy>/api/reply \
  -H 'content-type: application/json' \
  -H 'x-reply-secret: <REPLY_TEST_SECRET>' \
  -d '{"senderId":"12345","message":"how much is a massage?","pageId":"<optional instagram_page_id>"}'
```

Endpoint returns 404 until `REPLY_TEST_SECRET` is set. This writes to the real database and calls the real Graph API send (which fails for fake sender ids — expected).

## Known gaps

- **Data retention purge (B5):** the [privacy policy](pages/privacy.js) promises deletion of conversations after 12 months and leads after 24 months, but **no purge job exists yet**. Before a Meta audit or a privacy-sensitive client, add a cron that deletes `conversations` older than 12 months and `leads` older than 24 months.
- Vercel Hobby allows max 2 cron jobs — both slots are used.
