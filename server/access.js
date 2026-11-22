import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuers = new Map();

export async function authenticate(request, env) {
  const url = new URL(request.url);
  if (env.LCS_LOCAL_DEV === 'true' && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    return { email: 'dev@loknite.local', admin: true, local: true };
  }
  const team = env.ACCESS_TEAM?.trim();
  const audience = env.ACCESS_AUDIENCE?.split(',').map(value => value.trim()).filter(Boolean);
  if (!team || !/^[a-z0-9-]+$/.test(team) || !audience?.length) {
    return null;
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const issuer = 'https://' + team + '.cloudflareaccess.com';
  let keyset = issuers.get(issuer);
  if (!keyset) {
    keyset = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));
    issuers.set(issuer, keyset);
  }
  try {
    const { payload } = await jwtVerify(token, keyset, {
      issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email']
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const teamEmails = new Set(env.LCS_TEAM_EMAILS?.toLowerCase().split(',').map(value => value.trim()).filter(Boolean));
    if (!email || !teamEmails.has(email)) return null;
    const admins = new Set(env.VAULT_ADMIN_EMAILS?.toLowerCase().split(',').map(value => value.trim()).filter(Boolean));
    return { email, admin: admins.has(email), local: false };
  } catch {
    return null;
  }
}
