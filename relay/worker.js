// TT Courtside relay: forwards the app's Jira calls and adds the CORS headers Jira Cloud does not send.
// It stores nothing. The Jira API token travels from the phone in the Authorization header of each call.
//
// Settings (Cloudflare dashboard > Worker > Settings > Variables):
//   ALLOWED_ORIGIN  the app's address, e.g. https://eniedling.github.io   (default below)
//   ALLOWED_HOSTS   comma-separated Jira sites, e.g. eniedling.atlassian.net (default below)
//
// URL shape: https://<worker>/<jira-site>/rest/api/...   e.g. /eniedling.atlassian.net/rest/api/2/myself

const DEFAULT_ORIGIN = 'https://eniedling.github.io';
const DEFAULT_HOSTS = 'eniedling.atlassian.net';

export default {
  async fetch(request, env = {}) {
    const allowedOrigin = (env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
    const allowedHosts = (env.ALLOWED_HOSTS || DEFAULT_HOSTS).split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';

    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, message) =>
      new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin !== allowedOrigin) return reply(403, `Relay: origin ${origin || '(none)'} is not allowed`);
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return reply(405, 'Relay: method not allowed');

    const url = new URL(request.url);
    const [, host = '', ...rest] = url.pathname.split('/');
    const path = rest.join('/');
    if (!allowedHosts.includes(host.toLowerCase())) return reply(403, `Relay: Jira site ${host || '(none)'} is not allowed`);
    if (!path.startsWith('rest/api/')) return reply(400, 'Relay: only /rest/api/ paths are forwarded');

    const upstream = await fetch(`https://${host}/${path}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: request.headers.get('Authorization') || '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
      body: request.method === 'GET' ? undefined : await request.text(),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  },
};
