const axios = require('axios');
const { saveInstagramConnection } = require('../../../../lib/supabase');

const SUCCESS_REDIRECT = 'https://arizn-receptionist.vercel.app/?instagram=connected';
const ERROR_REDIRECT_BASE = 'https://arizn-receptionist.vercel.app/?instagram=error';
const DEFAULT_REDIRECT_URI = 'https://arizn-receptionist.vercel.app/api/auth/instagram/callback';
const GRAPH_VERSION = process.env.GRAPH_API_VERSION || 'v23.0';

function redirectWithError(res, reason) {
  return res.redirect(302, `${ERROR_REDIRECT_BASE}&reason=${encodeURIComponent(reason)}`);
}

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getOAuthConfig() {
  return {
    clientId: process.env.INSTAGRAM_CLIENT_ID || process.env.META_APP_ID,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || process.env.META_APP_SECRET,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

function tokenExpiresAt(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function sanitizeProviderError(err) {
  return err.response?.data?.error?.code || err.response?.status || err.code || 'unknown';
}

function sanitizeServerError(err) {
  return err.code || err.status || err.name || 'unknown';
}

function supabaseDiagnostic(err) {
  return {
    operation: err.operation ?? null,
    supabase: err.supabase ?? {
      code: null,
      message: err.message ?? null,
      details: null,
      hint: null,
    },
    env: {
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseKey: Boolean(process.env.SUPABASE_KEY),
    },
  };
}

async function exchangeCodeForShortLivedToken(code, { clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const { data } = await axios.post('https://api.instagram.com/oauth/access_token', body.toString(), {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

  if (!data?.access_token) throw new Error('short_lived_token_missing');
  return data.access_token;
}

async function exchangeForLongLivedToken(shortLivedToken, clientSecret) {
  const { data } = await axios.get('https://graph.instagram.com/access_token', {
    params: {
      grant_type: 'ig_exchange_token',
      client_secret: clientSecret,
      access_token: shortLivedToken,
    },
  });

  if (!data?.access_token) throw new Error('long_lived_token_missing');
  return {
    accessToken: data.access_token,
    expiresAt: tokenExpiresAt(data.expires_in),
  };
}

async function fetchInstagramIdentity(accessToken) {
  const { data } = await axios.get(`https://graph.instagram.com/${GRAPH_VERSION}/me`, {
    params: {
      fields: 'id,user_id,username,name,account_type',
      access_token: accessToken,
    },
  });

  const instagramAccountId = data?.user_id || data?.id;
  if (!instagramAccountId) throw new Error('instagram_account_id_missing');

  return {
    instagramAccountId,
    username: data.username ?? null,
    name: data.name ?? null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const oauthError = getSingleQueryValue(req.query.error);
  if (oauthError) {
    console.warn('[Instagram OAuth] Authorization denied or failed:', oauthError);
    return redirectWithError(res, 'oauth_denied');
  }

  const code = getSingleQueryValue(req.query.code);
  if (!code) {
    console.warn('[Instagram OAuth] Missing authorization code');
    return redirectWithError(res, 'missing_code');
  }

  const oauthConfig = getOAuthConfig();
  if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
    console.error('[Instagram OAuth] Missing OAuth client configuration');
    return redirectWithError(res, 'server_config');
  }

  let longLivedToken;
  let expiresAt;
  try {
    const shortLivedToken = await exchangeCodeForShortLivedToken(code, oauthConfig);
    const longLived = await exchangeForLongLivedToken(shortLivedToken, oauthConfig.clientSecret);
    longLivedToken = longLived.accessToken;
    expiresAt = longLived.expiresAt;
  } catch (err) {
    console.error('[Instagram OAuth] Token exchange failed:', sanitizeProviderError(err));
    return redirectWithError(res, 'token_exchange_failed');
  }

  let identity;
  try {
    identity = await fetchInstagramIdentity(longLivedToken);
  } catch (err) {
    console.error('[Instagram OAuth] Profile lookup failed:', sanitizeProviderError(err));
    return redirectWithError(res, 'profile_lookup_failed');
  }

  try {
    await saveInstagramConnection({
      ...identity,
      accessToken: longLivedToken,
      tokenExpiresAt: expiresAt,
    });
  } catch (err) {
    console.error('[Instagram OAuth] Supabase save failed:', sanitizeServerError(err));
    console.error('[Instagram OAuth] Supabase diagnostic:', JSON.stringify(supabaseDiagnostic(err)));
    return redirectWithError(res, 'supabase_failed');
  }

  return res.redirect(302, SUCCESS_REDIRECT);
}
