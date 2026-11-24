import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError, readBytes } from './http.js';

const cookieName = '__Host-lcs-session';
const sessionSeconds = 12 * 60 * 60;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const cookieOptions = 'Path=/; Secure; HttpOnly; SameSite=Lax';
const issuer = 'loknite-class-system';

function keys(env) {
  if (!keyPattern.test(env.LCS_SESSION_KEY ?? '') || !env.LCS_TEAM_KEYS) return null;
  try {
    const accounts = JSON.parse(env.LCS_TEAM_KEYS);
    if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return null;
    return { accounts, secret: Buffer.from(env.LCS_SESSION_KEY, 'base64url') };
  } catch {
    return null;
  }
}

export function teamLoginEnabled(env) {
  return Boolean(keys(env));
}

function accountFor(accounts, email) {
  const entry = Object.hasOwn(accounts, email) ? accounts[email] : null;
  return digestPattern.test(entry?.digest ?? '') ? entry : null;
}

function hashKey(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function keyVersion(account) {
  return createHash('sha256').update(account.digest, 'utf8').digest('base64url');
}

export async function authenticateTeam(request, env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-lcs-session=([^;]+)/)?.[1];
  if (!token || token.length > 1536) return null;
  const settings = keys(env);
  if (!settings) return null;
  try {
    const { payload } = await jwtVerify(token, settings.secret, {
      issuer, audience: new URL(request.url).origin, algorithms: ['HS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'keyVersion'], maxTokenAge: sessionSeconds
    });
    const account = accountFor(settings.accounts, payload.sub);
    if (!account || keyVersion(account) !== payload.keyVersion) return null;
    return { email: payload.sub, admin: account.admin === true, local: false, provider: 'team' };
  } catch {
    return null;
  }
}

function page({ error = '', status = 200 } = {}) {
  const invalid = error ? ' aria-invalid="true" aria-describedby="erro"' : '';
  return new Response(`<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${error ? 'Falha ao entrar · ' : ''}Lok’nite Class System</title>
<style>
  :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; color: #e7f1f4; background: #07131b; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background: radial-gradient(ellipse at 50% 18%, #193944, #07131b 64%); }
  main { width: min(100%, 430px); padding: clamp(24px, 6vw, 40px); border: 1px solid #3c6878; border-top: 3px solid #c9a74a; background: #0b1e28; border-radius: 10px; }
  h1 { margin: 0; font-size: clamp(25px, 6vw, 32px); line-height: 1.13; letter-spacing: -.035em; }
  p { margin: 12px 0 24px; color: #adbec7; }
  label, input { display: block; }
  label { font-weight: 600; margin: 0 0 5px; }
  input { background: #07131b; border: 1px solid #53727f; border-radius: 5px; color: inherit; width: 100%; padding: 11px; font: inherit; margin-bottom: 16px; }
  button { color: #07131b; background: #89dee8; border: 0; border-radius: 5px; padding: 11px 16px; width: 100%; font: inherit; font-weight: 750; cursor: pointer; }
  button:hover { background: #bcf4fa; }
  :focus-visible { outline: 2px solid #89dee8; outline-offset: 3px; }
  #erro { color: #ffe5ac; margin: 0 0 16px; }
</style>
<main>
  <h1>Lok’nite Class System</h1>
  <p>Entre com seu e-mail e a chave de acesso da equipe.</p>
  ${error ? '<p id="erro" role="alert">' + error + '</p>' : ''}
  <form action="/auth/login" method="post">
    <label for="email">E-mail</label>
    <input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required${invalid}>
    <label for="key">Chave de acesso</label>
    <input id="key" name="key" type="password" autocomplete="current-password" maxlength="64" required${invalid}>
    <button type="submit">Entrar</button>
  </form>
</main>
</html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}

export function authRedirect(location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}

export async function teamAuthRoute(request, env, identity) {
  const url = new URL(request.url);
  const settings = keys(env);
  if (!settings) return new Response('Acesso reservado à equipe.', { status: 403 });
  if (request.method === 'GET' && url.pathname === '/auth') return identity ? authRedirect('/') : page();
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
  if (url.pathname === '/auth/logout') return authRedirect('/auth', cookieName + '=; Max-Age=0; ' + cookieOptions);
  if (url.pathname !== '/auth/login') return new Response(null, { status: 404 });
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') return new Response(null, { status: 415 });
  let form;
  try {
    form = new URLSearchParams((await readBytes(request, 4096)).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpError) return new Response(null, { status: error.status });
    throw error;
  }
  const email = form.get('email')?.trim().toLowerCase() ?? '';
  const accessKey = form.get('key')?.trim() ?? '';
  if (!env.LCS_LOGIN_LIMITER) return new Response('Login temporariamente indisponível.', { status: 503 });
  const remoteAddress = request.headers.get('CF-Connecting-IP')?.trim() || '<unknown-ip>';
  const attemptBucket = createHmac('sha256', settings.secret)
    .update(`${email || '<empty>'}\0${remoteAddress}`).digest('hex');
  let allowed = false;
  try {
    ({ success: allowed } = await env.LCS_LOGIN_LIMITER.limit({ key: attemptBucket }));
  } catch {
    return new Response('Login temporariamente indisponível.', { status: 503 });
  }
  if (!allowed) {
    const response = page({ error: 'Muitas tentativas. Aguarde um minuto antes de tentar de novo.', status: 429 });
    response.headers.set('Retry-After', '60');
    return response;
  }
  const account = accountFor(settings.accounts, email);
  const expected = Buffer.from(account?.digest ?? '0'.repeat(64), 'hex');
  if (!timingSafeEqual(hashKey(accessKey), expected) || !keyPattern.test(accessKey) || !account) {
    return page({ error: 'E-mail ou chave inválidos. Confira os dados e tente de novo.', status: 401 });
  }

  const token = await new SignJWT({ keyVersion: keyVersion(account) }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(email).setIssuer(issuer).setAudience(url.origin).setIssuedAt().setExpirationTime(sessionSeconds + 's')
    .sign(settings.secret);
  return authRedirect('/', cookieName + '=' + token + '; Max-Age=' + sessionSeconds + '; ' + cookieOptions);
}
