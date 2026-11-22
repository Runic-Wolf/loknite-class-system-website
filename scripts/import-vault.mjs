import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [directory, target = 'http://127.0.0.1:8788', credentialFile] = process.argv.slice(2);
if (!directory) throw new Error('Uso: npm run import-vault -- /pasta/LCS_VAULT [URL]');
const base = new URL(target);
const local = base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname);
const token = process.env.LCS_ACCESS_TOKEN;
if (!local && (base.protocol !== 'https:' || (!token && !credentialFile))) {
  throw new Error('Para importar remotamente, use HTTPS e informe o arquivo da chave administrativa ou LCS_ACCESS_TOKEN.');
}
const headers = { 'X-LCS-Client': 'vault-import', 'User-Agent': 'Loknite-Vault-Importer/1.0' };
if (!local && credentialFile) {
  const { email, key } = JSON.parse(await readFile(credentialFile, 'utf8'));
  const login = await fetch(new URL('/auth/login', base), {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base.origin, 'User-Agent': headers['User-Agent'] },
    body: new URLSearchParams({ email, key })
  });
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('__Host-lcs-session='));
  if (login.status !== 303 || !cookie) throw new Error('A chave administrativa foi recusada (' + login.status + ').');
  headers.Cookie = cookie.split(';')[0];
} else if (!local) {
  headers['Cf-Access-Token'] = token;
}
const root = resolve(directory);
const names = await readdir(root);
const folder = names.find(name => name.toLowerCase() === 'media_vault');
if (!folder) throw new Error('Diretório media_vault ausente.');
const [vault, cardvault] = await Promise.all(['vault', 'cardvault'].map(async name => JSON.parse(await readFile(join(root, name + '.json'), 'utf8'))));
if (vault.transactionId !== cardvault.transactionId || vault.revision !== cardvault.revision) throw new Error('Os JSONs não são da mesma revisão.');

async function request(path, options) {
  const response = await fetch(new URL('/api/v1/' + path, base), { ...options, redirect: 'manual', headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(path + ' (' + response.status + '): ' + (await response.text()).slice(0, 300));
  return response.json();
}

async function upload(path, parts = []) {
  let count = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    const relative = [...parts, entry.name];
    if (entry.isDirectory()) count += await upload(full, relative);
    else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) {
      const key = ['media_vault', ...relative].map(encodeURIComponent).join('/');
      await request('import/media/' + key, { method: 'PUT', body: await readFile(full) });
      count++;
    }
  }
  return count;
}

const files = await upload(join(root, folder));
const result = await request('import/workspace', {
  method: 'POST', body: JSON.stringify({ vault, cardvault }), headers: { 'Content-Type': 'application/json' }
});
console.log(JSON.stringify({ ...result, mediaFiles: files }));
