import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [directory, target = 'http://127.0.0.1:8788'] = process.argv.slice(2);
if (!directory) throw new Error('Uso: npm run import-vault -- /pasta/LCS_VAULT [URL]');
const base = new URL(target);
const local = base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname);
const token = process.env.LCS_ACCESS_TOKEN;
if (!local && (base.protocol !== 'https:' || !token)) throw new Error('Para importar remotamente, use HTTPS e a variável LCS_ACCESS_TOKEN.');
const headers = { 'X-LCS-Client': 'vault-import', 'User-Agent': 'Loknite-Vault-Importer/1.0', ...(local ? {} : { 'Cf-Access-Token': token }) };
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
