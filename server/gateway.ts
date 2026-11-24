import { Hono, type Context } from 'hono';
import { authenticate } from './access.js';
import { authenticateTeam, authRedirect, teamAuthRoute, teamLoginEnabled } from './team-login.js';
import catalog from './catalog.generated.json' with { type: 'json' };
import type { Identity, LcsBindings } from './bindings';

type GatewayEnv = {
  Bindings: LcsBindings;
  Variables: { identity: Identity | null };
};
type GatewayContext = Context<GatewayEnv>;

const app = new Hono<GatewayEnv>();

function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  headers.set('Referrer-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function recordSessionEvent(env: LcsBindings, identity: Identity | null, action: 'login' | 'logout'): Promise<void> {
  if (!identity) return;
  try {
    const vault = env.VAULT.get(env.VAULT.idFromName('workspace'));
    const response = await vault.fetch(new Request('https://lcs.internal/audit/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LCS-Identity': JSON.stringify(identity) },
      body: JSON.stringify({ action }),
    }));
    if (!response.ok) console.error('LCS session audit event was not recorded.');
  } catch {
    console.error('LCS session audit event was not recorded.');
  }
}

app.use('*', async (_context, next) => {
  await next();
  const response = _context.res;
  _context.res = privateResponse(response);
});

app.use('*', async (context, next) => {
  const identity = await authenticate(context.req.raw, context.env)
    ?? await authenticateTeam(context.req.raw, context.env);
  context.set('identity', identity);
  await next();
});

async function handleAuth(context: GatewayContext): Promise<Response> {
  const url = new URL(context.req.url);
  const identity = context.get('identity');
  const response = await teamAuthRoute(context.req.raw, context.env, identity);
  if (response.status === 303 && url.pathname === '/auth/logout') {
    await recordSessionEvent(context.env, identity, 'logout');
  } else if (response.status === 303 && url.pathname === '/auth/login') {
    const cookie = response.headers.get('Set-Cookie')?.split(';', 1)[0];
    const loginIdentity = cookie
      ? await authenticateTeam(new Request(context.req.url, { headers: { Cookie: cookie } }), context.env)
      : null;
    await recordSessionEvent(context.env, loginIdentity, 'login');
  }
  return response;
}

app.all('/auth', handleAuth);
app.all('/auth/login', handleAuth);
app.all('/auth/logout', handleAuth);

function unauthorized(context: GatewayContext): Response {
  if (context.req.path.startsWith('/api/')) return context.json({ error: 'Acesso reservado à equipe.' }, 403);
  return context.text('Lok’nite Class Studio · Acesso reservado à equipe.', 403);
}

async function forwardToVault(context: GatewayContext): Promise<Response> {
  const identity = context.get('identity');
  if (!identity) return unauthorized(context);
  const headers = new Headers(context.req.raw.headers);
  headers.delete('Cookie');
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.delete('Cf-Access-Token');
  headers.set('X-LCS-Identity', JSON.stringify(identity));
  const vault = context.env.VAULT.get(context.env.VAULT.idFromName('workspace'));
  return vault.fetch(new Request(context.req.raw, { headers }));
}

app.all('/api/v1/*', forwardToVault);

app.on(['GET', 'HEAD'], '/media/*', async context => {
  const identity = context.get('identity');
  if (!identity) return unauthorized(context);
  const mediaPath = context.req.path.slice('/media/'.length);
  let official = false;
  try {
    official = Boolean(mediaPath && Object.hasOwn(catalog.metadata, decodeURI(mediaPath)));
  } catch {
    return context.text('URL inválida.', 400);
  }
  if (!official) return forwardToVault(context);
  return context.env.ASSETS.fetch(context.req.raw);
});

app.all('*', async context => {
  const identity = context.get('identity');
  if (!identity) {
    if (context.req.path === '/' && context.req.method === 'GET' && teamLoginEnabled(context.env)) {
      return authRedirect('/auth');
    }
    return unauthorized(context);
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

app.onError(error => {
  console.error('LCS gateway failed.', error);
  return new Response('O serviço não conseguiu concluir a solicitação.', { status: 500 });
});

export default app;
