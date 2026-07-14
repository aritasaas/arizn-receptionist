# ARIZN Receptionist Meta App Review Guide

## Test URLs

- Product: `https://arizn-receptionist.vercel.app`
- Instagram OAuth callback: `https://arizn-receptionist.vercel.app/api/auth/instagram/callback`
- Webhook callback: `https://arizn-receptionist.vercel.app/api/webhook`
- Privacy Policy: `https://arizn.co/privacy`
- Data Deletion: `https://arizn.co/data-deletion`

## Permissions Requested

### instagram_business_basic

ARIZN Receptionist uses this permission to identify the Instagram professional account that connects through Instagram Business Login. The backend fetches the account ID and username, stores the connection in Supabase, and routes webhook events by `entry.id` to the matching active client.

### instagram_business_manage_messages

ARIZN Receptionist uses this permission to receive Instagram DM webhooks and send replies for the connected professional account. Incoming messages are received at `/api/webhook`, signature-validated, stored in Supabase, processed by the AI reply pipeline, and answered through the Instagram API.

### instagram_business_manage_comments

ARIZN Receptionist uses this permission to receive Instagram comment webhook events and send a private reply to commenters who use configured keywords such as `PRICE`, `INFO`, or `BOOK`. The feature is limited to media owned by the connected Instagram professional account. The backend stores each comment trigger in Supabase and deduplicates by comment ID before sending a private reply.

## Reviewer Test: Instagram Login and DM Reply

1. Open `https://arizn-receptionist.vercel.app`.
2. Click the Instagram connection button.
3. Sign in with an Instagram professional account that is eligible for testing.
4. Approve the requested Instagram permissions.
5. Confirm the browser redirects to `https://arizn-receptionist.vercel.app/?instagram=connected`.
6. From another Instagram account, send a DM to the connected professional account.
7. Confirm ARIZN receives `POST /api/webhook`, validates `X-Hub-Signature-256`, stores the incoming message, generates an AI reply, sends the reply through the Instagram API, and stores the sent message ID.

## Reviewer Test: Comment Keyword to Private DM

1. Confirm the app is subscribed to the Instagram `comments` webhook field for the connected professional account.
2. Publish or open an Instagram post owned by the connected professional account.
3. From a different Instagram account, comment exactly:

   ```text
   PRICE
   ```

4. Meta sends a `comments` webhook event to `POST /api/webhook`.
5. The webhook validates the `X-Hub-Signature-256` signature.
6. The backend routes `entry.id` to the active `clients.instagram_page_id`.
7. `lib/comments.js` parses `change.value.comment_id`, `change.value.from.id`, username, media ID, and comment text.
8. The comment text is matched against configured keywords. Defaults are `PRICE`, `INFO`, and `BOOK`.
9. The event is inserted into Supabase `conversations` with:

   ```text
   role = comment
   mid = comment:<comment_id>
   message = JSON payload with comment_id, media_id, keyword, and text
   ```

10. The unique `conversations_mid_key` index prevents duplicate private replies if Meta redelivers the same webhook.
11. ARIZN sends a private reply using the Instagram API:

   ```text
   POST https://graph.instagram.com/<API_VERSION>/<IG_ACCOUNT_ID>/messages
   recipient.comment_id = <COMMENT_ID>
   message.text = configured reply
   ```

12. The sent private reply is stored in Supabase with:

   ```text
   role = assistant
   mid = comment_reply:<message_id>
   ```

13. The commenter receives the private reply in their Instagram Inbox or Requests folder.

## Expected Production Logs

Successful comment-to-DM flow logs:

```text
[Webhook] POST received. object: instagram
[Comments] Comment received: { client, commentId, mediaId, username, matchedKeyword: "PRICE" }
[Comments] Private reply sent: { client, commentId, recipientId, messageId, keyword: "PRICE" }
```

Duplicate webhook delivery logs:

```text
[Comments] Duplicate comment delivery — private reply already attempted: { commentId, marker }
```

No keyword match logs:

```text
[Comments] Comment received: { client, commentId, mediaId, username, matchedKeyword: null }
```

## Screencast Script

1. Show `https://arizn-receptionist.vercel.app`.
   - Narration: "ARIZN Receptionist lets a business connect its Instagram professional account and automate responses to DMs and qualifying comments."

2. Click the Instagram connection button and complete Instagram Business Login.
   - Narration: "The business owner signs in with Instagram and grants the permissions needed to identify the professional account, manage messages, and manage comments."

3. Show the redirect to `/?instagram=connected`.
   - Narration: "The callback exchanges the authorization code for a long-lived Instagram token and stores the connection server-side in Supabase."

4. Send a DM from a separate Instagram account to the connected account.
   - Narration: "A customer sends a direct message. Meta delivers a webhook to ARIZN."

5. Show production logs for `POST /api/webhook`.
   - Narration: "The backend validates the Meta signature, routes the event by Instagram account ID, stores the incoming message, generates an AI reply, and sends it through the Instagram API."

6. Show the Instagram DM reply arriving.
   - Narration: "The customer receives the AI-generated response from the connected professional account."

7. Open an Instagram post owned by the connected account and comment `PRICE` from another account.
   - Narration: "A customer comments a configured keyword on the business's Instagram post."

8. Show production logs for the comment webhook.
   - Narration: "Meta sends a comments webhook. ARIZN matches the keyword, stores the event with the comment ID, and prevents duplicate sends if Meta retries the webhook."

9. Show the private reply arriving in the commenter's Instagram Inbox or Requests folder.
   - Narration: "ARIZN sends a private reply to the commenter using the Instagram private replies API. Only one private reply is sent for each comment."

10. Show Supabase records without exposing access tokens.
    - Narration: "The comment trigger and private reply are stored as operational records in Supabase. Access tokens remain server-side and are never shown in browser output, URLs, or logs."

## Reviewer Notes

- The app must be Live and subscribed to `messages`, `message_echoes`, and `comments`.
- The connected Instagram professional account must be active in the `clients` table.
- Comment-to-DM defaults work with `PRICE`, `INFO`, and `BOOK`.
- Client-specific comment keywords can be configured with `clients.comment_dm_keywords`.
- Client-specific private reply text can be configured with `clients.comment_dm_reply`.
- ARIZN does not sell personal data.
