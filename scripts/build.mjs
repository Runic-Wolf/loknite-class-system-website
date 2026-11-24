import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { loadFinalAssetCatalog, loadEquipmentAssetCatalog, loadTierRoleAssetCatalog } from '../app/official-media.cjs';
import { loadCardLayoutCatalog, loadClassMechanicLayoutCatalog } from '../app/card-layouts.cjs';

const app = resolve('app');
const out = resolve('build/public');
if (out !== resolve('build/public')) throw new Error('Public asset output path is invalid.');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync(process.execPath, [join(app, 'build-renderer.cjs'), join(out, 'classic', 'index.html')], { stdio: 'inherit' });

async function publish(source, relative) {
  const destination = join(out, relative);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function publishTreeFavicon() {
  const source = join(app, 'official-assets', 'branding', 'loknite-tree-favicon-source.png');
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = [data[0], data[1], data[2]];
  const differenceAt = offset => Math.max(
    Math.abs(data[offset] - background[0]),
    Math.abs(data[offset + 1] - background[1]),
    Math.abs(data[offset + 2] - background[2])
  );
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (differenceAt((y * info.width + x) * info.channels) <= 24) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('Tree favicon artwork is empty.');

  const artworkWidth = right - left + 1;
  const artworkHeight = bottom - top + 1;
  const padding = Math.ceil(Math.max(artworkWidth, artworkHeight) * 0.07);
  const side = Math.min(Math.max(artworkWidth, artworkHeight) + padding * 2, info.width, info.height);
  const centerX = (left + right + 1) / 2;
  const centerY = (top + bottom + 1) / 2;
  const cropLeft = Math.max(0, Math.min(info.width - side, Math.floor(centerX - side / 2)));
  const cropTop = Math.max(0, Math.min(info.height - side, Math.floor(centerY - side / 2)));
  const { data: crop, info: cropInfo } = await sharp(source)
    .extract({ left: cropLeft, top: cropTop, width: side, height: side })
    .removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < crop.length; offset += cropInfo.channels) {
    const contrast = Math.max(
      Math.abs(crop[offset] - background[0]),
      Math.abs(crop[offset + 1] - background[1]),
      Math.abs(crop[offset + 2] - background[2])
    );
    crop[offset + 3] = contrast <= 12 ? 0 : contrast < 36 ? Math.round(((contrast - 12) / 24) * 255) : 255;
  }
  const destination = join(out, 'branding', 'favicon.png');
  await mkdir(dirname(destination), { recursive: true });
  await sharp(crop, { raw: { width: side, height: side, channels: 4 } })
    .resize(128, 128, { fit: 'contain', kernel: 'lanczos3' })
    .png({ palette: true, quality: 100, effort: 10 })
    .toFile(destination);
}

const [finalAssets, equipment, tierRoles, layouts, mechanics] = await Promise.all([
  loadFinalAssetCatalog(app), loadEquipmentAssetCatalog(app), loadTierRoleAssetCatalog(app),
  loadCardLayoutCatalog(app), loadClassMechanicLayoutCatalog(app)
]);

const palette = {
  references: {},
  assets: finalAssets.publicAssets,
  equipmentAssets: equipment.publicAssets,
  tierRoleAssets: tierRoles.publicAssets,
  cardLayouts: layouts.publicAssets,
  classMechanicLayouts: mechanics.publicAssets,
  installedAssetIds: []
};
const metadata = {};
const jobs = [];
jobs.push(publishTreeFavicon());
jobs.push(publish(join(app, 'official-assets', 'card-effects', 'mana-orb', 'toroidal-97.png'), 'card-effects/mana-orb/toroidal-97.png'));
for (const [folder, catalog] of [['final', finalAssets], ['equipment', equipment], ['tier-role-icons', tierRoles]]) {
  for (const asset of catalog.publicAssets) {
    const entry = catalog.byId.get(asset.id);
    metadata[asset.path] = asset;
    palette.installedAssetIds.push(asset.id);
    jobs.push(publish(join(app, 'official-assets', folder, entry.source), 'media/' + asset.path));
    if (asset.classId && ['icon', 'background'].includes(asset.variant)) {
      const reference = palette.references[asset.classId] ??= {};
      reference[asset.variant === 'icon' ? 'iconPath' : 'bgPath'] = asset.path;
    }
  }
}
for (const [folder, catalog] of [['card-layouts', layouts], ['class-mechanics', mechanics]]) {
  for (const asset of catalog.publicAssets) {
    const url = folder + '/' + asset.path;
    jobs.push(publish(join(app, 'official-assets', url), url));
  }
}
for (const path of ['branding/LCS.png', 'assets/sfx/soft.mp3', 'assets/sfx/click.mp3', 'bridge.js', 'web.css', 'workspace-changes.js']) {
  jobs.push(publish(join(app, path), path));
}
for (const name of ['runic-wolf-emblema.svg', 'runic-wolf-emblema-branco.svg']) {
  jobs.push(publish(join(app, 'official-assets', 'branding', name), `branding/${name}`));
}
const cloudIconOutput = join(out, 'icons/cloud-sync.png');
await mkdir(dirname(cloudIconOutput), { recursive: true });
jobs.push(sharp(join(app, 'official-assets', 'navigation-icons', 'cloud-sync.png'))
  .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
  .png({ palette: true, quality: 100, effort: 10 })
  .toFile(cloudIconOutput));
for (const name of [
  'dashboard-gap-consistente.svg',
  'espada-flecha.svg',
  'cardgame-three-monochrome.svg',
  'database-svgrepo-com.svg',
  'keyword-chave-unificada.svg',
]) {
  jobs.push(publish(join(app, 'official-assets', 'navigation-icons', name), `icons/${name}`));
}
await Promise.all(jobs);

const thumbnails = finalAssets.publicAssets.filter(asset => asset.group === 'class' && asset.variant === 'icon');
await Promise.all(thumbnails.map(async asset => {
  const source = join(app, 'official-assets', 'final', finalAssets.byId.get(asset.id).source);
  const destination = join(out, 'thumbs', `${asset.classId}.webp`);
  await mkdir(dirname(destination), { recursive: true });
  await sharp(source).resize(112, 112, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(destination);
}));

const classicHtml = await readFile(join(out, 'classic', 'index.html'), 'utf8');
if (!classicHtml.includes('<script src="/bridge.js">')) throw new Error('Bridge do renderer clássico ausente.');
await writeFile('server/catalog.generated.json', JSON.stringify({ palette, metadata }));
console.log(`Prepared ${palette.installedAssetIds.length} media assets and ${thumbnails.length} thumbnails in ${out}.`);
