const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(message) { throw new Error('Official C1 media: ' + message); }

const FINAL_ASSET_COUNT = 75;
const FINAL_CLASS_NAMES = ['FIGHTER', 'BARBARIAN', 'NATURALIST', 'ROGUE', 'ARCANIST', 'CLERIC', 'INNOVATOR', 'SORCERER', 'ACOLYTE', 'DISCIPLE', 'BUSHI', 'SPIRITUALIST', 'ARTIST', 'OUTLAW', 'SWORDSMAN'];
const FINAL_ELEMENT_SLUGS = ['neutral', 'fire', 'earth', 'water', 'wind', 'nature', 'spiritual', 'arcane', 'profane', 'holy'];
const EQUIPMENT_TAG_ASSETS = [
  ['armor', 'LIGHT', '01_Armadura_Leve.png'], ['armor', 'MEDIUM', '02_Armadura_Media.png'], ['armor', 'HEAVY', '03_Armadura_Pesada.png'], ['armor', 'SHIELD', '04_Escudo.png'],
  ['melee', '1H Sword', '05_Espada_1M.png'], ['melee', '2H Sword', '06_Espada_2M.png'], ['melee', '1H Axe', '07_Machado_1M.png'], ['melee', '2H Axe', '08_Machado_2M.png'], ['melee', '1H Mace', '09_Maca_1M.png'], ['melee', '2H Mace', '10_Maca_2M.png'], ['melee', '1H Spear', '11_Lanca_1M.png'], ['melee', '2H Spear', '12_Lanca_2M.png'], ['melee', '1H Katana', '28_Katana_1M.png'], ['melee', '2H Katana', '29_Katana_2M.png'],
  ['ranged', 'Shortbow', '24_Arco_Curto.png'], ['ranged', 'Longbow', '25_Arco_Longo.png'], ['ranged', 'Handgun', '26_Besta_Mao.png'], ['ranged', 'Crossbow', '27_Besta.png'], ['ranged', 'Pistol', '20_Pistola.png'], ['ranged', 'Blunderbuss', '21_Bacamarte.png'], ['ranged', 'Cannon', '22_Canhao.png'], ['ranged', 'Musket', '23_Mosquete.png'],
  ['other', '1H Wand', '13_Varinha.png'], ['other', '2H Rod', '14_Cetro.png'], ['other', '2H Staff', '15_Cajado.png'], ['other', 'Knuckles', '16_Soqueiras.png'], ['other', 'Claws', '17_Garras.png'], ['other', 'Dagger', '18_Adaga.png'], ['other', 'Katar', '19_Katar.png']
];
const TIER_ROLE_TAG_ASSETS = [
  ['tier', 'C1', 'C1_Bronze.png'], ['tier', 'C2', 'C2_Prata.png'], ['tier', 'C3', 'C3_Ouro.png'], ['tier', 'SPEC', 'SPEC_Especializacao.png'],
  ['role', 'DPS', 'DPS.png'], ['role', 'TANK', 'TANK.png'], ['role', 'HEAL', 'HEAL.png'], ['role', 'CTRL', 'CONTROL.png'],
  ['role', 'BUFF', 'BUFF.png'], ['role', 'DEBUFF', 'DEBUFF.png'], ['role', 'BURST', 'BURST.png'], ['role', 'DOT', 'DOT.png']
];

function equipmentSlug(tag) { return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function expectedFinalAsset(entry) {
  if (entry.group === 'class') {
    const match = /^class\.base_(\d+)\.(icon|background|combined)$/.exec(entry.id || '');
    if (!match || Number(match[1]) > 14) return null;
    const classId = 'base_' + Number(match[1]);
    const variant = match[2];
    const filename = variant === 'icon' ? 'C1_ICON_TRANSPARENT.png' : variant === 'background' ? 'C1_BACKGROUND.png' : 'C1_ICON_WITH_BACKGROUND.png';
    return { group: 'class', classId, variant, source: `CLASSPACK DEFINITIVO/Lite Class Palette Pack/${String(Number(match[1]) + 1).padStart(2, '0')}-${FINAL_CLASS_NAMES[Number(match[1])]}/${filename}`, path: `media_vault/official/final/class/${classId}/${variant}.png`, mime: 'image/png' };
  }
  if (entry.group === 'element') {
    const match = /^element\.([a-z]+)\.(transparent|metallic|textured)$/.exec(entry.id || '');
    if (!match || !FINAL_ELEMENT_SLUGS.includes(match[1])) return null;
    const folders = { transparent: '01_Icones_Sem_Fundo', metallic: '02_Medalhoes_Metalicos', textured: '03_Medalhoes_Texturizados' };
    const names = ['Equilibrio', 'Fogo', 'Terra', 'Agua', 'Vento', 'Natureza', 'Espiritual', 'Arcano', 'Profano', 'Luz'];
    const labels = ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'];
    const index = FINAL_ELEMENT_SLUGS.indexOf(match[1]);
    const basename = `${String(index + 1).padStart(2, '0')}_${names[index]}${match[2] === 'metallic' ? '_Medalhao' : match[2] === 'textured' ? '_Texturizado' : ''}.png`;
    return { group: 'element', element: labels[index], variant: match[2], source: `ELEMENT ICONS/${folders[match[2]]}/${basename}`, path: `media_vault/official/final/element/${match[1]}/${match[2]}.png`, mime: 'image/png' };
  }
  return null;
}

async function loadFinalAssetCatalog(codeRoot, { verifyFiles = false } = {}) {
  const manifestPath = path.join(codeRoot, 'official-assets', 'final', 'manifest.json');
  for (const directory of [path.dirname(path.dirname(manifestPath)), path.dirname(manifestPath)]) {
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('diretório do pacote final inseguro.');
  }
  const stat = await fs.lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('manifesto final inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-official-final-assets' || manifest.schemaVersion !== 1 || manifest.assetCount !== FINAL_ASSET_COUNT || !Array.isArray(manifest.assets) || manifest.assets.length !== FINAL_ASSET_COUNT) {
    fail('manifesto final precisa declarar exatamente os 75 assets operacionais de classe e elemento.');
  }
  const byId = new Map();
  const byGroup = { class: 0, element: 0 };
  const assetRoot = path.resolve(codeRoot, 'official-assets', 'final');
  const assetRootStat = await fs.lstat(assetRoot);
  if (!assetRootStat.isDirectory() || assetRootStat.isSymbolicLink()) fail('raiz dos assets finais insegura.');
  for (const entry of manifest.assets) {
    const expected = expectedFinalAsset(entry);
    if (!expected || entry.group !== expected.group || entry.source !== expected.source || entry.path !== expected.path || entry.mime !== expected.mime || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || byId.has(entry.id)) {
      fail('mapeamento/hash inválido no manifesto final: ' + String(entry.id || '(sem ID)'));
    }
    for (const field of ['classId', 'variant', 'element']) {
      if (expected[field] !== undefined && entry[field] !== expected[field]) fail('metadado divergente no manifesto final: ' + entry.id);
    }
    if (entry.mime !== 'image/png' && entry.mime !== 'image/svg+xml') fail('MIME inesperado no manifesto final: ' + entry.id);
    const sourceParts = entry.source.split('/');
    if (entry.source.includes('\\') || sourceParts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) fail('origem insegura no manifesto final: ' + entry.id);
    const source = path.resolve(assetRoot, ...sourceParts);
    const relative = path.relative(assetRoot, source);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('origem fora do pacote: ' + entry.id);
    if (verifyFiles) {
      let cursor = assetRoot;
      for (const part of sourceParts) {
        cursor = path.join(cursor, part);
        const component = await fs.lstat(cursor);
        if (component.isSymbolicLink() || (cursor === source ? !component.isFile() : !component.isDirectory())) fail('origem empacotada insegura: ' + entry.id);
      }
      const bytes = await fs.readFile(source);
      if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) fail('hash/tamanho do pacote diverge: ' + entry.id);
      if (entry.mime === 'image/png' && !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('PNG inválido no pacote: ' + entry.id);
      if (entry.mime === 'image/svg+xml' && !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(bytes.toString('utf8', 0, Math.min(bytes.length, 512)))) fail('SVG inválido no pacote: ' + entry.id);
    }
    byId.set(entry.id, Object.freeze({ ...entry }));
    byGroup[entry.group]++;
  }
  if (byGroup.class !== 45 || byGroup.element !== 30) fail('contagem de grupos incompatível no manifesto final.');
  return { byId, publicAssets: [...byId.values()].map(({ id, group, path: relativePath, mime, sha256, size, classId, variant, element }) => ({ id, group, path: relativePath, mime, sha256, size, ...(classId ? { classId } : {}), ...(variant ? { variant } : {}), ...(element ? { element } : {}) })) };
}

async function loadEquipmentAssetCatalog(codeRoot, { verifyFiles = false } = {}) {
  const packageRoot = path.join(codeRoot, 'official-assets');
  const assetRoot = path.join(packageRoot, 'equipment');
  const manifestPath = path.join(assetRoot, 'manifest.json');
  for (const directory of [packageRoot, assetRoot]) {
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('diretório equipment inseguro.');
  }
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('manifesto equipment inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-official-equipment-assets' || manifest.schemaVersion !== 1 || manifest.assetCount !== 29 || !Array.isArray(manifest.assets) || manifest.assets.length !== 29) fail('manifesto equipment precisa declarar exatamente os 29 ícones das tags.');
  const packagedNames = (await fs.readdir(assetRoot)).sort();
  const expectedNames = [...EQUIPMENT_TAG_ASSETS.map(([, , source]) => source), 'manifest.json'].sort();
  if (packagedNames.length !== expectedNames.length || packagedNames.some((name, index) => name !== expectedNames[index])) fail('pacote equipment não contém exatamente as 29 cópias e o manifesto esperado.');
  const byId = new Map();
  for (let index = 0; index < EQUIPMENT_TAG_ASSETS.length; index++) {
    const [group, tag, source] = EQUIPMENT_TAG_ASSETS[index];
    const slug = equipmentSlug(tag);
    const expected = { order: index + 1, group, tag, id: `equipment.${group}.${slug}`, source, path: `media_vault/official/equipment/${group}/${slug}.png`, mime: 'image/png' };
    const entry = manifest.assets[index];
    if (!entry || Object.entries(expected).some(([key, value]) => entry[key] !== value) || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || byId.has(entry.id)) fail('mapeamento/hash equipment inválido na posição ' + (index + 1) + '.');
    const sourceParts = entry.source.split('/');
    if (entry.source.includes('\\') || sourceParts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) fail('origem equipment insegura: ' + entry.id);
    const sourcePath = path.resolve(assetRoot, ...sourceParts);
    const relative = path.relative(assetRoot, sourcePath);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('origem equipment fora do pacote: ' + entry.id);
    if (verifyFiles) {
      let cursor = assetRoot;
      for (const part of sourceParts) {
        cursor = path.join(cursor, part);
        const component = await fs.lstat(cursor);
        if (component.isSymbolicLink() || (cursor === sourcePath ? !component.isFile() : !component.isDirectory())) fail('origem equipment empacotada insegura: ' + entry.id);
      }
      const bytes = await fs.readFile(sourcePath);
      if (bytes.length !== entry.size || hash(bytes) !== entry.sha256 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('hash/tamanho/PNG equipment diverge: ' + entry.id);
    }
    byId.set(entry.id, Object.freeze({ ...entry }));
  }
  return { byId, publicAssets: [...byId.values()].map(({ id, group, tag, order, path: relativePath, mime, sha256, size }) => ({ id, group, tag, order, path: relativePath, mime, sha256, size })) };
}

async function loadTierRoleAssetCatalog(codeRoot, { verifyFiles = false } = {}) {
  const packageRoot = path.join(codeRoot, 'official-assets');
  const assetRoot = path.join(packageRoot, 'tier-role-icons');
  const manifestPath = path.join(assetRoot, 'manifest.json');
  for (const directory of [packageRoot, assetRoot]) {
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('diretório tier-role-icons inseguro.');
  }
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('manifesto tier-role-icons inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-official-tier-role-icons' || manifest.schemaVersion !== 1 || manifest.assetCount !== TIER_ROLE_TAG_ASSETS.length || !Array.isArray(manifest.assets) || manifest.assets.length !== TIER_ROLE_TAG_ASSETS.length) fail('manifesto tier-role-icons precisa declarar os 12 ícones de tier e role.');
  const packagedNames = (await fs.readdir(assetRoot)).sort();
  const expectedNames = [...TIER_ROLE_TAG_ASSETS.map(([, , source]) => source), 'manifest.json'].sort();
  if (packagedNames.length !== expectedNames.length || packagedNames.some((name, index) => name !== expectedNames[index])) fail('pacote tier-role-icons não contém exatamente as 12 cópias e o manifesto esperado.');
  const byId = new Map();
  for (let index = 0; index < TIER_ROLE_TAG_ASSETS.length; index++) {
    const [group, tag, source] = TIER_ROLE_TAG_ASSETS[index];
    const slug = tag.toLowerCase();
    const expected = { order: index + 1, group, tag, id: `tag.${group}.${slug}`, source, path: `media_vault/official/tag-icons/${group}/${slug}.png`, mime: 'image/png' };
    const entry = manifest.assets[index];
    if (!entry || Object.entries(expected).some(([key, value]) => entry[key] !== value) || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || byId.has(entry.id)) fail('mapeamento/hash tier-role-icons inválido na posição ' + (index + 1) + '.');
    const sourceParts = entry.source.split('/');
    if (entry.source.includes('\\') || sourceParts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) fail('origem tier-role-icons insegura: ' + entry.id);
    const sourcePath = path.resolve(assetRoot, ...sourceParts);
    const relative = path.relative(assetRoot, sourcePath);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('origem tier-role-icons fora do pacote: ' + entry.id);
    if (verifyFiles) {
      let cursor = assetRoot;
      for (const part of sourceParts) {
        cursor = path.join(cursor, part);
        const component = await fs.lstat(cursor);
        if (component.isSymbolicLink() || (cursor === sourcePath ? !component.isFile() : !component.isDirectory())) fail('origem tier-role-icons empacotada insegura: ' + entry.id);
      }
      const bytes = await fs.readFile(sourcePath);
      if (bytes.length !== entry.size || hash(bytes) !== entry.sha256 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('hash/tamanho/PNG tier-role-icons diverge: ' + entry.id);
    }
    byId.set(entry.id, Object.freeze({ ...entry }));
  }
  return { byId, publicAssets: [...byId.values()].map(({ id, group, tag, order, path: relativePath, mime, sha256, size }) => ({ id, group, tag, order, path: relativePath, mime, sha256, size })) };
}

async function ensureOfficialAsset(codeRoot, vaultRoot, catalog, id) {
  if (typeof id !== 'string' || id.length > 120) fail('ID de asset final inválido.');
  const entry = catalog?.byId?.get(id);
  if (!entry) fail('asset final fora da allowlist: ' + id);
  if (entry.mime !== 'image/png') fail('SVG é mantido no pacote e não é servido pelo media_vault: ' + id);
  const assetPackage = id.startsWith('equipment.') ? 'equipment' : id.startsWith('tag.') ? 'tier-role-icons' : 'final';
  const assetRoot = path.resolve(codeRoot, 'official-assets', assetPackage);
  const packageRootStat = await fs.lstat(path.dirname(assetRoot));
  if (!packageRootStat.isDirectory() || packageRootStat.isSymbolicLink()) fail('diretório do pacote final inseguro.');
  const assetRootStat = await fs.lstat(assetRoot);
  if (!assetRootStat.isDirectory() || assetRootStat.isSymbolicLink()) fail('raiz dos assets finais insegura.');
  const source = path.resolve(assetRoot, ...entry.source.split('/'));
  const relative = path.relative(assetRoot, source);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) fail('asset fora do pacote: ' + id);
  let cursor = assetRoot;
  for (const part of entry.source.split('/')) {
    cursor = path.join(cursor, part);
    const component = await fs.lstat(cursor);
    if (component.isSymbolicLink() || (cursor === source ? !component.isFile() : !component.isDirectory())) fail('origem empacotada insegura: ' + id);
  }
  const bytes = await fs.readFile(source);
  if (bytes.length !== entry.size || hash(bytes) !== entry.sha256 || !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('hash/tamanho/magic do asset diverge: ' + id);
  await installBytes(vaultRoot, entry.path, bytes, entry.sha256);
  return { id: entry.id, path: entry.path, sha256: entry.sha256, mime: entry.mime };
}

async function ensureDirectory(root, target) {
  const base = path.resolve(root);
  const absolute = path.resolve(target);
  const rel = path.relative(base, absolute);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) fail('path fora do Vault.');
  const rootStat = await fs.lstat(base).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) fail('raiz do Vault insegura.');
  if (!rootStat) await fs.mkdir(base, { recursive: true });
  let current = base;
  for (const part of rel ? rel.split(path.sep) : []) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('diretório existente inseguro: ' + current);
    } else {
      await fs.mkdir(current);
    }
  }
}

async function installOne(codeRoot, vaultRoot, entry) {
  const sourceRoot = path.resolve(codeRoot, 'baseline', 'assets');
  if (typeof entry.source !== 'string' || entry.source.includes('\\') || entry.source.split('/').some(part => !part || part === '.' || part === '..')) fail('origem inválida no manifesto.');
  if (!/^media_vault\/official\/c1\/\d{2}-[A-Z0-9-]+\/C1_(?:BACKGROUND|ICON_TRANSPARENT)\.webp$/.test(entry.path || '')) fail('destino inválido no manifesto.');
  const source = path.resolve(sourceRoot, ...entry.source.split('/'));
  const rel = path.relative(sourceRoot, source);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) fail('origem fora dos assets oficiais.');
  const sourceStat = await fs.lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) fail('asset de origem não é arquivo regular.');
  const bytes = await fs.readFile(source);
  const digest = hash(bytes);
  if (digest !== entry.sha256 || bytes.length !== entry.size) fail('hash/tamanho da origem diverge do manifesto: ' + entry.source);

  return installBytes(vaultRoot, entry.path, bytes, digest);
}

async function installBytes(vaultRoot, relativePath, bytes, digest) {
  const destination = path.resolve(vaultRoot, ...relativePath.split('/'));
  const parent = path.dirname(destination);
  await ensureDirectory(vaultRoot, parent);
  const existing = await fs.lstat(destination).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) fail('destino existente inseguro: ' + relativePath);
    if (hash(await fs.readFile(destination)) !== digest) fail('destino existente diverge; preservado sem sobrescrita: ' + relativePath);
    return { installed: false, sha256: digest };
  }

  const temporary = path.join(parent, '.' + path.basename(destination) + '.' + crypto.randomUUID() + '.tmp');
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await fs.link(temporary, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const raceStat = await fs.lstat(destination);
    if (!raceStat.isFile() || raceStat.isSymbolicLink() || hash(await fs.readFile(destination)) !== digest) fail('destino concorrente diverge; preservado sem sobrescrita: ' + relativePath);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return { installed: true, sha256: digest };
}

async function ensureOfficialMedia(codeRoot, vaultRoot, decodeWebp) {
  if (typeof decodeWebp !== 'function') fail('validador Chromium WebP ausente.');
  const sourceRoot = path.resolve(codeRoot, 'baseline', 'assets');
  const manifestPath = path.join(codeRoot, 'baseline', 'assets', 'manifest.json');
  const manifestStat = await fs.lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('manifesto inseguro.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'lcs-official-c1-media' || manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length !== 30) {
    fail('manifesto precisa declarar exatamente os 30 assets C1.');
  }
  const references = {};
  const unityMedia = [];
  const seen = new Set();
  let installed = 0;
  for (const entry of manifest.assets) {
    const match = /^(\d{2})-([A-Z0-9-]+)\/(C1_(BACKGROUND|ICON_TRANSPARENT)\.webp)$/.exec(entry.path.replace('media_vault/official/c1/', ''));
    if (!match) fail('asset C1 inesperado: ' + entry.path);
    const index = Number(match[1]) - 1;
    const classId = 'base_' + index;
    const kind = match[4] === 'BACKGROUND' ? 'bgPath' : 'iconPath';
    if (entry.classId !== classId || entry.source !== match[1] + '-' + match[2] + '/' + match[3]) fail('mapeamento C1 inválido: ' + entry.source);
    const key = classId + ':' + kind;
    if (seen.has(key)) fail('asset C1 duplicado: ' + key);
    seen.add(key);
    const result = await installOne(codeRoot, vaultRoot, entry);
    if (result.installed) installed++;
    const sourceBytes = await fs.readFile(path.resolve(sourceRoot, ...entry.source.split('/')));
    const pngBytes = await decodeWebp(sourceBytes);
    if (!(Buffer.isBuffer(pngBytes) || pngBytes instanceof Uint8Array) || !pngBytes.length || pngBytes.length > 40 * 1024 * 1024 || !pngBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) fail('derivada PNG inválida para ' + entry.path);
    const pngPath = entry.path.replace(/\.webp$/i, '.png');
    const pngSha256 = hash(pngBytes);
    const pngResult = await installBytes(vaultRoot, pngPath, pngBytes, pngSha256);
    if (pngResult.installed) installed++;
    unityMedia.push({ sourcePath: entry.path, sourceSha256: result.sha256, pngPath, pngSha256 });
    references[classId] = references[classId] || {};
    references[classId][kind] = entry.path;
  }
  if (seen.size !== 30 || Object.keys(references).length !== 15 || Object.values(references).some(item => !item.bgPath || !item.iconPath)) {
    fail('cada uma das 15 C1 precisa de background e ícone.');
  }
  const finalCatalog = await loadFinalAssetCatalog(codeRoot);
  const installedFinalAssetIds = [];
  const finalClassReferences = {};
  for (let index = 0; index < 15; index++) {
    const classId = 'base_' + index;
    const iconId = `class.${classId}.icon`;
    const backgroundId = `class.${classId}.background`;
    const icon = await ensureOfficialAsset(codeRoot, vaultRoot, finalCatalog, iconId);
    const background = await ensureOfficialAsset(codeRoot, vaultRoot, finalCatalog, backgroundId);
    installedFinalAssetIds.push(iconId, backgroundId);
    finalClassReferences[classId] = { iconPath: icon.path, bgPath: background.path };
  }
  for (const slug of FINAL_ELEMENT_SLUGS) {
    const id = `element.${slug}.transparent`;
    await ensureOfficialAsset(codeRoot, vaultRoot, finalCatalog, id);
    installedFinalAssetIds.push(id);
  }
  const equipmentCatalog = await loadEquipmentAssetCatalog(codeRoot, { verifyFiles: true });
  const installedEquipmentAssetIds = [];
  for (const asset of equipmentCatalog.publicAssets) {
    await ensureOfficialAsset(codeRoot, vaultRoot, equipmentCatalog, asset.id);
    installedEquipmentAssetIds.push(asset.id);
  }
  const tierRoleCatalog = await loadTierRoleAssetCatalog(codeRoot, { verifyFiles: true });
  const installedTierRoleAssetIds = [];
  for (const asset of tierRoleCatalog.publicAssets) {
    await ensureOfficialAsset(codeRoot, vaultRoot, tierRoleCatalog, asset.id);
    installedTierRoleAssetIds.push(asset.id);
  }
  return {
    references: finalClassReferences,
    unityMedia,
    installed,
    verified: seen.size,
    finalAssets: finalCatalog.publicAssets,
    installedFinalAssetIds,
    equipmentCatalog,
    equipmentAssets: equipmentCatalog.publicAssets,
    installedEquipmentAssetIds,
    tierRoleCatalog,
    tierRoleAssets: tierRoleCatalog.publicAssets,
    installedTierRoleAssetIds
  };
}

module.exports = { ensureOfficialMedia, loadFinalAssetCatalog, loadEquipmentAssetCatalog, loadTierRoleAssetCatalog, ensureOfficialAsset };
