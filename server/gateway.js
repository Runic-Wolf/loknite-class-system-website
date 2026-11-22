import { authenticate } from './access.js';
import { json } from './http.js';
import catalog from './catalog.generated.json';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const identity = await authenticate(request, env);
    if (!identity) {
      if (url.pathname.startsWith('/api/')) return json({ error: 'Acesso reservado à equipe.' }, 403);
      return new Response('Lok’nite Class System · Acesso reservado à equipe.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' }
      });
    }

    let response;
    if (url.pathname.startsWith('/api/v1/') || (url.pathname.startsWith('/media/') && !catalog.metadata[decodeURI(url.pathname.slice(7))])) {
      const headers = new Headers(request.headers);
      headers.delete('Cookie');
      headers.delete('Cf-Access-Jwt-Assertion');
      headers.set('X-LCS-Identity', JSON.stringify(identity));
      const vault = env.VAULT.get(env.VAULT.idFromName('workspace'));
      response = await vault.fetch(new Request(request, { headers }));
    } else {
      response = await env.ASSETS.fetch(request);
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    headers.set('Referrer-Policy', 'same-origin');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
