import { authenticate } from './access.js';
import { json } from './http.js';
import { authenticateTeam, authRedirect, teamAuthRoute, teamLoginEnabled } from './team-login.js';
import catalog from './catalog.generated.json';

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const identity = await authenticate(request, env) ?? await authenticateTeam(request, env);
    if (['/auth', '/auth/login', '/auth/logout'].includes(url.pathname)) {
      return privateResponse(await teamAuthRoute(request, env, identity));
    }
    if (!identity) {
      if (url.pathname === '/' && request.method === 'GET' && teamLoginEnabled(env)) return privateResponse(authRedirect('/auth'));
      if (url.pathname.startsWith('/api/')) return json({ error: 'Acesso reservado à equipe.' }, 403);
      return privateResponse(new Response('Lok’nite Class System · Acesso reservado à equipe.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }));
    }

    const mediaPath = url.pathname.startsWith('/media/') ? url.pathname.slice(7) : '';
    let official = false;
    try {
      official = Boolean(mediaPath && Object.hasOwn(catalog.metadata, decodeURI(mediaPath)));
    } catch {
      return privateResponse(new Response('URL inválida.', { status: 400 }));
    }
    if (url.pathname.startsWith('/api/v1/') || (mediaPath && !official)) {
      const headers = new Headers(request.headers);
      headers.delete('Cookie');
      headers.delete('Cf-Access-Jwt-Assertion');
      headers.delete('Cf-Access-Token');
      headers.set('X-LCS-Identity', JSON.stringify(identity));
      const vault = env.VAULT.get(env.VAULT.idFromName('workspace'));
      return privateResponse(await vault.fetch(new Request(request, { headers })));
    }
    return privateResponse(await env.ASSETS.fetch(request));
  }
};
