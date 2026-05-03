const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';
const SCHWAB_API_BASE = 'https://api.schwabapi.com/marketdata/v1';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function getTokens(env) {
  const raw = await env.TOKENS.get('schwab_tokens');
  return raw ? JSON.parse(raw) : null;
}

async function saveTokens(env, tokens) {
  tokens.saved_at = Date.now();
  await env.TOKENS.put('schwab_tokens', JSON.stringify(tokens));
}

async function refreshAccessToken(env) {
  const tokens = await getTokens(env);
  if (!tokens || !tokens.refresh_token) return null;

  const auth = btoa(`${env.SCHWAB_CLIENT_ID}:${env.SCHWAB_CLIENT_SECRET}`);
  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokens.refresh_token)}`,
  });

  if (!res.ok) {
    console.error('Refresh failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const newTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_in: data.expires_in || 1800,
  };
  await saveTokens(env, newTokens);
  return newTokens.access_token;
}

async function getValidAccessToken(env) {
  const tokens = await getTokens(env);
  if (!tokens) return null;

  const elapsed = (Date.now() - (tokens.saved_at || 0)) / 1000;
  if (elapsed < (tokens.expires_in || 1800) - 60) {
    return tokens.access_token;
  }

  return await refreshAccessToken(env);
}

async function handleLogin(env) {
  const callbackUrl = `${env.WORKER_URL || 'https://schwab-proxy.workers.dev'}/callback`;
  const url = `${SCHWAB_AUTH_URL}?client_id=${env.SCHWAB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code`;
  return Response.redirect(url, 302);
}

async function handleCallback(url, env) {
  const code = url.searchParams.get('code');
  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  const callbackUrl = `${env.WORKER_URL || 'https://schwab-proxy.workers.dev'}/callback`;
  const auth = btoa(`${env.SCHWAB_CLIENT_ID}:${env.SCHWAB_CLIENT_SECRET}`);

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(callbackUrl)}`,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Token exchange failed:', res.status, err);
    return new Response(`Token exchange failed: ${err}`, { status: 500 });
  }

  const data = await res.json();
  await saveTokens(env, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 1800,
  });

  return new Response(`
    <html><body style="background:#1a1d27;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <div style="text-align:center;">
        <h1 style="color:#22c55e;">&#10003; Schwab conectado</h1>
        <p>Puedes cerrar esta ventana y volver a tu Trading Journal.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </div>
    </body></html>
  `, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

async function handleStatus(env, origin) {
  const tokens = await getTokens(env);
  if (!tokens) return jsonResponse({ connected: false }, 200, origin);
  const elapsed = (Date.now() - (tokens.saved_at || 0)) / 1000;
  const accessValid = elapsed < (tokens.expires_in || 1800) - 60;
  const refreshValid = elapsed < 7 * 24 * 3600;
  return jsonResponse({ connected: true, accessValid, refreshValid }, 200, origin);
}

async function handleApiProxy(url, env, origin) {
  const token = await getValidAccessToken(env);
  if (!token) {
    return jsonResponse({ error: 'Not authenticated. Please connect Schwab.' }, 401, origin);
  }

  const apiPath = url.pathname.replace('/api/', '');
  const schwabUrl = `${SCHWAB_API_BASE}/${apiPath}${url.search}`;

  try {
    const res = await fetch(schwabUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    return jsonResponse({ error: 'Schwab API error: ' + err.message }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.APP_ORIGIN || 'https://andriiyamelskyi56.github.io';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      switch (url.pathname) {
        case '/login':
          return handleLogin(env);
        case '/callback':
          return handleCallback(url, env);
        case '/status':
          return handleStatus(env, origin);
        default:
          if (url.pathname.startsWith('/api/')) {
            return handleApiProxy(url, env, origin);
          }
          return new Response('Not found', { status: 404 });
      }
    } catch (err) {
      return jsonResponse({ error: err.message }, 500, origin);
    }
  },
};
