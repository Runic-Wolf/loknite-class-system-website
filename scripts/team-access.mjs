import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [action, rawEmail, role] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const folder = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Loknite Class System', 'team-access')
  : join(homedir(), '.config', 'loknite-team-access');
const registryPath = join(folder, 'registry.json');
const command = 'npm run team:access -- add <email> [--admin] | rotate <email> | revoke <email> | sync';
if (!['add', 'rotate', 'revoke', 'sync'].includes(action) ||
    (action !== 'sync' && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254))) {
  throw new Error('Uso: ' + command);
}

await mkdir(folder, { recursive: true, mode: 0o700 });
const registry = await readFile(registryPath, 'utf8').then(JSON.parse, error => {
  if (error.code !== 'ENOENT' || action !== 'add') throw error;
  return { secret: randomBytes(32).toString('base64url'), accounts: {} };
});

const accounts = new Map(Object.entries(registry.accounts));
let credentialPath;
if (action === 'add' || action === 'rotate') {
  if (action === 'add' && accounts.has(email)) throw new Error('E-mail já cadastrado. Use rotate para trocar a chave.');
  if (action === 'rotate' && !accounts.has(email)) throw new Error('E-mail não cadastrado.');
  const accessKey = randomBytes(32).toString('base64url');
  const digest = createHash('sha256').update(accessKey, 'utf8').digest('hex');
  const admin = action === 'rotate' ? accounts.get(email).admin : role === '--admin';
  accounts.set(email, { digest, admin });
  const fileName = 'chave-' + email.replace(/[^a-z0-9._@-]/g, '_') + '-' + Date.now() + '.json';
  credentialPath = join(folder, fileName);
  await writeFile(credentialPath, JSON.stringify({ email, key: accessKey }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
} else if (action === 'revoke') {
  if (!accounts.has(email)) throw new Error('E-mail não cadastrado.');
  if (accounts.get(email).admin && [...accounts.values()].filter(account => account.admin).length === 1) {
    throw new Error('Cadastre outra conta administradora antes de revogar a chave atual.');
  }
  accounts.delete(email);
}

const next = { secret: registry.secret, accounts: Object.fromEntries(accounts) };
const settings = JSON.stringify(next.accounts);
if (Buffer.byteLength(settings) > 5000) throw new Error('A lista excede o tamanho disponível para este Worker.');
const temporary = registryPath + '.' + randomBytes(8).toString('hex') + '.tmp';
await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
await rename(temporary, registryPath);

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const secrets = JSON.stringify({ LCS_SESSION_KEY: next.secret, LCS_TEAM_KEYS: settings });
const result = spawnSync(process.execPath, [wrangler, 'secret', 'bulk'], {
  input: secrets, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true
});
if (credentialPath) console.log('Chave individual salva em ' + credentialPath);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('Configuração guardada localmente. Execute "npm run team:access -- sync" para reenviar.');
console.log('Acesso sincronizado para ' + accounts.size + ' conta(s).');
