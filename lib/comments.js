const { sendPrivateReplyToComment } = require('./instagram');
const {
  getDefaultAccessToken,
  recordCommentTrigger,
  recordCommentPrivateReply,
  upsertLead,
  updateLeadProfile,
} = require('./supabase');
const { escapeRegExp } = require('./text');

const DEFAULT_COMMENT_KEYWORDS = ['PRICE', 'INFO', 'BOOK'];
const DEFAULT_COMMENT_REPLY =
  "Thanks for commenting! We just sent you a DM with more info.";

function parseEnvList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCommentKeywords(client) {
  if (Array.isArray(client.comment_dm_keywords) && client.comment_dm_keywords.length > 0) {
    return client.comment_dm_keywords;
  }

  const envKeywords = parseEnvList(process.env.COMMENT_DM_KEYWORDS);
  return envKeywords.length > 0 ? envKeywords : DEFAULT_COMMENT_KEYWORDS;
}

function findMatchedKeyword(text, keywords) {
  const source = String(text ?? '');
  return (keywords ?? []).find((keyword) => {
    const trimmed = String(keyword ?? '').trim();
    if (!trimmed) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i');
    return pattern.test(source);
  }) ?? null;
}

function buildCommentReply(client, keyword) {
  const template =
    client.comment_dm_reply ||
    process.env.COMMENT_DM_REPLY_MESSAGE ||
    DEFAULT_COMMENT_REPLY;

  return String(template)
    .replaceAll('{{business_name}}', client.business_name || 'the business')
    .replaceAll('{{keyword}}', keyword || 'INFO');
}

function normalizeCommentChange(change) {
  const value = change?.value ?? {};
  const from = value.from ?? {};
  return {
    field: change?.field,
    commentId: value.comment_id || value.id,
    mediaId: value.media?.id || value.media_id || value.post_id || null,
    commenterId: from.id || value.sender_id || value.user_id || null,
    username: from.username || value.username || null,
    text: value.text || value.message || '',
  };
}

async function processCommentChange(change, client, pageId) {
  const comment = normalizeCommentChange(change);

  if (comment.field !== 'comments' && comment.field !== 'live_comments') {
    return { status: 'ignored', reason: `unsupported_field:${comment.field}` };
  }

  if (!comment.commentId || !comment.commenterId) {
    console.warn('[Comments] Missing comment_id or commenter id — skipping', {
      field: comment.field,
      hasCommentId: Boolean(comment.commentId),
      hasCommenterId: Boolean(comment.commenterId),
    });
    return { status: 'ignored', reason: 'missing_required_ids' };
  }

  if (comment.commenterId === pageId) {
    console.log('[Comments] Ignoring comment from connected Instagram account');
    return { status: 'ignored', reason: 'self_comment' };
  }

  const keywords = getCommentKeywords(client);
  const keyword = findMatchedKeyword(comment.text, keywords);
  console.log('[Comments] Comment received:', {
    client: client.business_name,
    commentId: comment.commentId,
    mediaId: comment.mediaId,
    username: comment.username,
    matchedKeyword: keyword,
  });

  if (!keyword) {
    return { status: 'ignored', reason: 'no_keyword_match' };
  }

  const recorded = await recordCommentTrigger({
    instagramUserId: comment.commenterId,
    clientId: client.id,
    commentId: comment.commentId,
    commentText: comment.text,
    keyword,
    mediaId: comment.mediaId,
  });

  if (recorded.status === 'duplicate') {
    console.log('[Comments] Duplicate comment delivery — private reply already attempted:', {
      commentId: comment.commentId,
      marker: recorded.marker,
    });
    return { status: 'duplicate', commentId: comment.commentId };
  }

  const accessToken = client.access_token || (await getDefaultAccessToken());
  if (!accessToken) throw new Error('no Instagram access token available for comment private reply');

  const { isNew } = await upsertLead({
    instagramUserId: comment.commenterId,
    clientId: client.id,
    firstMessage: `Instagram comment: ${comment.text}`,
  });

  if (isNew && comment.username) {
    await updateLeadProfile(comment.commenterId, client.id, {
      username: comment.username,
      name: null,
    });
  }

  const replyText = buildCommentReply(client, keyword);
  const sent = await sendPrivateReplyToComment(pageId, comment.commentId, replyText, accessToken);

  await recordCommentPrivateReply({
    instagramUserId: sent.recipientId || comment.commenterId,
    clientId: client.id,
    commentId: comment.commentId,
    replyText,
    messageId: sent.messageId,
  });

  console.log('[Comments] Private reply sent:', {
    client: client.business_name,
    commentId: comment.commentId,
    recipientId: sent.recipientId || comment.commenterId,
    messageId: sent.messageId,
    keyword,
  });

  return {
    status: 'sent',
    commentId: comment.commentId,
    recipientId: sent.recipientId || comment.commenterId,
    messageId: sent.messageId,
    keyword,
  };
}

module.exports = {
  processCommentChange,
  getCommentKeywords,
  findMatchedKeyword,
  buildCommentReply,
};
