export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  }

  try {
    const body = await request.json() as {
      action?: string;
      baseUrl?: string;
      apiKey?: string;
    };

    if (body.action !== 'models') {
      return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400, headers });
    }

    const apiKey = String(body.apiKey || '').trim();
    let baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '');
    if (!apiKey || !baseUrl) {
      return new Response(JSON.stringify({ error: 'baseUrl and apiKey are required' }), { status: 400, headers });
    }

    baseUrl = baseUrl
      .replace(/\/chat\/completions$/i, '')
      .replace(/\/responses$/i, '')
      .replace(/\/models$/i, '')
      .replace(/\/+$/, '');

    const upstream = await fetch(baseUrl + '/models', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
    });

    const text = await upstream.text();
    return new Response(text || '{}', {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Proxy request failed',
    }), { status: 502, headers });
  }
}
