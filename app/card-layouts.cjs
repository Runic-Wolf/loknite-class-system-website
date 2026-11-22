const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const CLASS_NAMES = ['FIGHTER', 'BARBARIAN', 'NATURALIST', 'ROGUE', 'ARCANIST', 'CLERIC', 'INNOVATOR', 'SORCERER', 'ACOLYTE', 'DISCIPLE', 'BUSHI', 'SPIRITUALIST', 'ARTIST', 'OUTLAW', 'SWORDSMAN'];
const TIERS = [
  { id: 'C1', folder: '01_C1_BRONZE' },
  { id: 'C2', folder: '02_C2_PRATA' },
  { id: 'C3', folder: '03_C3_OURO' }
];

function fail(message) { throw new Error('Card layouts: ' + message); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function expectedLayout(entry) {
  const match = /^card-layout\.(C1|C2|C3)\.base_(\d+)$/.exec(entry?.id || '');
  if (!match) return null;
  const tier = TIERS.find(item => item.id === match[1]);
  const index = Number(match[2]);
  if (!tier || !Number.isInteger(index) || index < 0 || index >= CLASS_NAMES.length) return null;
  const filename = `${String(index + 1).padStart(2, '0')}_${CLASS_NAMES[index]}.png`;
  return {
    tier: tier.id,
    classId: `base_${index}`,
    className: CLASS_NAMES[index][0] + CLASS_NAMES[index].slice(1).toLowerCase(),
    folder: tier.folder,
    filename,
    path: `${tier.folder}/${filename}`,
    mime: 'image/png',
    width: 1060,
    height: 1484,
    colorType: 6
  };
}

async function loadCardLayoutCatalog(codeRoot, { verifyFiles = false } = {}) {
  const assetRoot = path.resolve(codeRoot, 'official-assets', 'card-layouts');
  const manifestPath = path.join(assetRoot, 'manifest.json');
  for (const directory of [path.dirname(path.dirname(manifestPath)), path.dirname(manifestPath)]) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('diretório do pacote inseguro.');
  }
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('manifesto inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-card-layout-assets' || manifest.schemaVersion !== 1 || manifest.assetCount !== 45 || manifest.canvas?.width !== 1060 || manifest.canvas?.height !== 1484 || manifest.canvas?.colorType !== 6 || !Array.isArray(manifest.assets) || manifest.assets.length !== 45) {
    fail('manifesto precisa declarar os 45 layouts RGBA de 1060×1484.');
  }
  const rootStat = await fs.lstat(assetRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('raiz dos layouts insegura.');
  const byId = new Map();
  const byPath = new Map();
  for (const entry of manifest.assets) {
    const expected = expectedLayout(entry);
    if (!expected || entry.tier !== expected.tier || entry.classId !== expected.classId || entry.className !== expected.className || entry.folder !== expected.folder || entry.filename !== expected.filename || entry.path !== expected.path || entry.mime !== expected.mime || entry.width !== expected.width || entry.height !== expected.height || entry.colorType !== expected.colorType || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || byId.has(entry.id) || byPath.has(entry.path)) {
      fail('mapeamento/hash inválido no manifesto: ' + String(entry.id || '(sem ID)'));
    }
    const parts = entry.path.split('/');
    if (entry.path.includes('\\') || parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) fail('caminho inválido no manifesto: ' + entry.id);
    const target = path.resolve(assetRoot, ...parts);
    const relative = path.relative(assetRoot, target);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('arquivo fora do pacote: ' + entry.id);
    if (verifyFiles) {
      let cursor = assetRoot;
      for (const part of parts) {
        cursor = path.join(cursor, part);
        const stat = await fs.lstat(cursor);
        if (stat.isSymbolicLink() || (cursor === target ? !stat.isFile() : !stat.isDirectory())) fail('arquivo empacotado inseguro: ' + entry.id);
      }
      const bytes = await fs.readFile(target);
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) fail('hash/tamanho diverge: ' + entry.id);
      if (bytes.length < 29 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || bytes.toString('ascii', 12, 16) !== 'IHDR') fail('PNG inválido: ' + entry.id);
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      const colorType = bytes.readUInt8(25);
      if (width !== entry.width || height !== entry.height || colorType !== entry.colorType) fail('dimensões/canal divergentes: ' + entry.id);
    }
    byId.set(entry.id, Object.freeze({ ...entry }));
    byPath.set(entry.path, Object.freeze({ ...entry }));
  }
  for (const tier of TIERS) for (let index = 0; index < CLASS_NAMES.length; index++) {
    if (!byId.has(`card-layout.${tier.id}.base_${index}`)) fail(`layout ausente: ${tier.id}/base_${index}`);
  }
  const publicAssets = [...byId.values()].map(({ id, tier, classId, className, path: relativePath, mime, sha256: digest, size, width, height }) => ({ id, tier, classId, className, path: relativePath, mime, sha256: digest, size, width, height }));
  return { byId, byPath, publicAssets, manifest };
}

async function loadClassMechanicLayoutCatalog(codeRoot, { verifyFiles = false } = {}) {
  const assetRoot = path.resolve(codeRoot, 'official-assets', 'class-mechanics');
  const manifestPath = path.join(assetRoot, 'manifest.json');
  for (const directory of [path.dirname(path.dirname(manifestPath)), path.dirname(manifestPath)]) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('diretório de Class Mechanic inseguro.');
  }
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('manifesto Class Mechanic inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-class-mechanic-layout-assets' || manifest.schemaVersion !== 1 || manifest.assetCount !== 15 || manifest.canvas?.width !== 1060 || manifest.canvas?.height !== 1484 || manifest.canvas?.colorType !== 6 || !Array.isArray(manifest.assets) || manifest.assets.length !== 15) {
    fail('manifesto precisa declarar 15 templates RGBA de Class Mechanic com canvas 1060×1484.');
  }
  const rootStat = await fs.lstat(assetRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('raiz dos templates Class Mechanic insegura.');
  const byId = new Map();
  const byPath = new Map();
  for (let index = 0; index < CLASS_NAMES.length; index++) {
    const filename = `${String(index + 1).padStart(2, '0')}_${CLASS_NAMES[index]}.png`;
    const id = `class-mechanic-layout.base_${index}`;
    const classId = `base_${index}`;
    const className = CLASS_NAMES[index][0] + CLASS_NAMES[index].slice(1).toLowerCase();
    const entry = manifest.assets.find(asset => asset?.id === id);
    if (!entry || entry.classId !== classId || entry.className !== className || entry.filename !== filename || entry.path !== filename || entry.mime !== 'image/png' || entry.width !== 1060 || entry.height !== 1484 || entry.colorType !== 6 || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || byPath.has(entry.path)) {
      fail('mapeamento/hash inválido no manifesto: ' + id);
    }
    const target = path.resolve(assetRoot, filename);
    if (path.dirname(target) !== assetRoot) fail('arquivo fora do pacote: ' + id);
    if (verifyFiles) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) fail('arquivo empacotado inseguro: ' + id);
      const bytes = await fs.readFile(target);
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256 || bytes.length < 29 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== 1060 || bytes.readUInt32BE(20) !== 1484 || bytes.readUInt8(25) !== 6) {
        fail('hash/tamanho/canvas diverge: ' + id);
      }
    }
    byId.set(id, Object.freeze({ ...entry }));
    byPath.set(filename, Object.freeze({ ...entry }));
  }
  if (manifest.assets.length !== byId.size) fail('manifesto contém entradas Class Mechanic duplicadas ou desconhecidas.');
  return { byId, byPath, publicAssets: [...byId.values()].map(({ id, classId, className, path: relativePath, mime, sha256: digest, size, width, height }) => ({ id, classId, className, path: relativePath, mime, sha256: digest, size, width, height })), manifest };
}

module.exports = { loadCardLayoutCatalog, loadClassMechanicLayoutCatalog };
