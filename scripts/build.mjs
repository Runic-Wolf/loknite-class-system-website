import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadFinalAssetCatalog, loadEquipmentAssetCatalog, loadTierRoleAssetCatalog } from '../app/official-media.cjs';
import { loadCardLayoutCatalog, loadClassMechanicLayoutCatalog } from '../app/card-layouts.cjs';

const app = resolve('app');
const out = resolve('dist');
execFileSync(process.execPath, [join(app, 'build-renderer.cjs')], { stdio: 'inherit' });

async function publish(source, relative) {
  const destination = join(out, relative);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
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
await Promise.all(jobs);

const html = await readFile(join(out, 'index.html'), 'utf8');
if (!html.includes('<script src="/bridge.js">')) throw new Error('Bridge do navegador ausente.');
await writeFile('server/catalog.generated.json', JSON.stringify({ palette, metadata }));
await writeFile(join(out, '404.html'), '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Página indisponível</title><p>Página indisponível.</p></html>');
await writeFile(join(out, '.assetsignore'), '_routes.json\n_headers\n');
