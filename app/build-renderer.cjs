const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadFinalAssetCatalog, loadEquipmentAssetCatalog, loadTierRoleAssetCatalog } = require('./official-media.cjs');
const { loadCardLayoutCatalog, loadClassMechanicLayoutCatalog } = require('./card-layouts.cjs');

const codeRoot = __dirname;
const baselinePath = path.join(codeRoot, 'baseline', 'Loknite_Class_System_Prototype_v04.html');
const adapterPath = path.join(__dirname, 'renderer-adapter.js');
const outputPath = path.resolve(process.argv[2] || path.join(codeRoot, '..', 'dist', 'classic', 'index.html'));
const expectedBaselineSha256 = 'ea57d13766801e6f6faaeead2b2ff7de7c8598d9d21bd53b0bc71d5e466f5cad';
const marker = 'wire();setScale();boot();';

function replaceExact(source, search, replacement, expectedCount) {
  const count = source.split(search).length - 1;
  if (count !== expectedCount) throw new Error(`Expected ${expectedCount} occurrences of ${JSON.stringify(search)}, found ${count}.`);
  return source.split(search).join(replacement);
}

function removeRetiredGameplaySubtype(source) {
  let html = source;
  const replacements = [
    ["subtype:'Technique',", '', 2],
    ["subtype:'Other',", '', 2],
    [`<div class="control"><label class="small">Subtype</label>\${opts('subtype',['Technique','Conjuration','Other'])}</div>`, '', 1],
    [`<div class="control"><label class="small">SUBTYPE</label>\${opts('subtype',['Technique','Conjuration','Other'])}</div>`, '', 1],
    [" · ${escapeHtml(ca.subtype||'Technique')}", '', 1],
    ["'type','subtype','element'", "'type','element'", 1],
    ['o.card?.subtype,', '', 1],
    ['gallery-subtypes', 'gallery-groups', 6],
    ['subtypeLabel', 'galleryGroupName', 2],
    ['TODAS AS SUBCATEGORIAS', 'TODOS OS GRUPOS', 1]
  ];
  for (const [search, replacement, count] of replacements) html = replaceExact(html, search, replacement, count);
  const portugueseTermCount = (html.match(/\bsubtipo\b/gi) || []).length;
  if (!portugueseTermCount) throw new Error('Expected legacy Portuguese group wording to rename.');
  html = html.replace(/\bsubtipo\b/gi, term => term === term.toUpperCase() ? 'GRUPO' : term[0] === term[0].toUpperCase() ? 'Grupo' : 'grupo');
  if (/\b(?:subtype|subtipo)\b/i.test(html)) throw new Error('Retired card gameplay subtype remains in the transformed baseline.');
  if (!html.includes("Array.from({length:15}") || !html.includes("data.galleryNames[cat+':'+i]")) {
    throw new Error('The 15 Gallery group slots or galleryNames compatibility were not preserved.');
  }
  return html;
}

function removeGalleryCreateButton(source) {
  let html = replaceExact(source, '<button class="btn xs gold" data-action="gallery-add">＋ Criar carta</button>', '', 1);
  html = replaceExact(html, 'Use “Criar carta” para registrar uma carta independente, ou abra o editor 🃏 de uma skill para criar cartas vinculadas à linhagem.', 'Dê duplo clique no fundo da galeria para criar uma carta independente, ou abra o editor 🃏 de uma skill para criar cartas vinculadas à linhagem.', 1);
  return html;
}

function removeBetween(source, startMarker, endMarker, description) {
  const start = source.indexOf(startMarker);
  if (start < 0 || source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Expected one start marker for ${description}.`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing end marker for ${description}.`);
  return source.slice(0, start) + source.slice(end);
}

function stripRelationalGraphStyles(source) {
  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/i);
  if (!styleMatch) throw new Error('Could not find the baseline stylesheet to remove Graph styles.');
  const graphSelector = /#graph(?:stage|svg)\b|\.graph-(?:edge|node|legend|footer)\b/i;
  const styles = styleMatch[1].replace(/([^{}]+)\{([^{}]*)\}/g, (rule, rawSelectors, declarations) => {
    const selectors = rawSelectors.split(',').map(selector => selector.trim()).filter(Boolean);
    const retained = selectors.filter(selector => !graphSelector.test(selector));
    return retained.length ? `${retained.join(',')}{${declarations}}` : '';
  });
  if (graphSelector.test(styles)) throw new Error('Relational Graph CSS remains in the active renderer.');
  return source.replace(styleMatch[0], `<style>${styles}</style>`);
}

function removeRelationalGraph(source) {
  let html = source;
  html = replaceExact(html, '<button class="nav" data-nav="graph">RELATIONAL GRAPH</button>', '', 1);
  html = replaceExact(html, "graphMode:'global',graphDepth:2,graphSkills:true,graphTags:true,graphSearch:'',graphArrows:false,graphFreeze:false,graphLayoutSeed:0,graphView:{x:0,y:0,z:1},", '', 1);
  html = replaceExact(html, "graphTier:'ALL',graphOrphans:true,", '', 1);
  html = removeBetween(html, 'let graph={nodes:', 'let effectsOn=true', 'Graph state and simulation');
  html = removeBetween(html, 'function graphPointerDown(e){', '// Marquee selection on empty Class Matrix background.', 'Graph pointer handlers');
  html = replaceExact(html, "case'graph-locate':locateGraph();break;", '', 1);
  html = replaceExact(html, "case'graph-reset':graphFit();break;", '', 1);
  html = replaceExact(html, 'else graphView();', 'else database();', 1);
  html = removeBetween(html, "if(t.id==='graphTier')", "if(t.id==='filterField')", 'Graph tier change handler');
  html = removeBetween(html, "if(t.id==='graphMode')", 'const o=selection()[0]', 'Graph control change handlers');
  html = removeBetween(html, "if(t.id==='graphSearch')", 'if(t.dataset.edit||t.dataset.card)', 'Graph search handler');
  html = removeBetween(html, "if(e.target.closest?.('[data-gnode]')", 'if(editing(e.target)', 'Graph keyboard handler');
  html = replaceExact(html, "if(state.tab==='graph')graphDraw()", '', 1);
  html = replaceExact(html, "['Relational Graph','graph'],", '', 1);
  html = removeBetween(html, 'function locateGraph(){', 'function wire(){', 'Graph locate command');
  html = replaceExact(html, "document.addEventListener('pointerdown',e=>{if(e.target.closest('#graphsvg'))graphPointerDown(e);else matrixDown(e)});", "document.addEventListener('pointerdown',matrixDown);", 1);
  html = replaceExact(html, "document.addEventListener('pointermove',e=>{if(graph.pointer)graphPointerMove(e);else matrixMove(e)});", "document.addEventListener('pointermove',matrixMove);", 1);
  html = replaceExact(html, "document.addEventListener('pointerup',e=>{if(graph.pointer)graphPointerUp(e);matrixUp()});", "document.addEventListener('pointerup',matrixUp);", 1);
  html = replaceExact(html, "document.addEventListener('wheel',graphWheel,{passive:false});", '', 1);
  html = replaceExact(html, "document.addEventListener('pointerover',e=>{const t=e.target.closest('[data-gnode]');if(t&&graph.hover!==t.dataset.gnode){graph.hover=t.dataset.gnode;graphDraw()}});", '', 1);
  html = replaceExact(html, "document.addEventListener('pointerout',e=>{if(e.target.closest('[data-gnode]')){graph.hover=null;graphDraw()}})", '', 1);

  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const lines = html.split(/\r?\n/);
  const wrapperLines = lines.reduce((matches, line, index) => line === 'const oldGraphDraw=graphDraw;' ? [...matches, index] : matches, []);
  if (wrapperLines.length !== 1 || !lines[wrapperLines[0] + 1]?.startsWith("graphDraw=function(){oldGraphDraw();if(state.tab!=='graph')return;")) {
    throw new Error('Expected one official-icon Graph rendering wrapper in the baseline.');
  }
  lines.splice(wrapperLines[0], 2);
  html = lines.join(newline);
  html = stripRelationalGraphStyles(html);

  const graphResidue = /data-nav=["']graph["']|RELATIONAL GRAPH|\b(?:graphData|graphView|graphDraw|graphFit|initGraph|focusGraphNode|locateGraph|physicsStep|graphPointerDown|graphPointerMove|graphPointerUp|graphWheel)\b|state\.graph\w*|#graph(?:stage|svg)\b|\.graph-(?:edge|node|legend|footer)\b|data-gnode/i;
  const residue = html.match(graphResidue);
  if (residue) {
    const offset = residue.index || 0;
    throw new Error('Active renderer still contains Relational Graph code or controls: ' + residue[0] + ' near ' + html.slice(Math.max(0, offset - 100), offset + 160));
  }
  return html;
}

async function buildRenderer() {
  await loadFinalAssetCatalog(codeRoot, { verifyFiles: true });
  await loadEquipmentAssetCatalog(codeRoot, { verifyFiles: true });
  await loadTierRoleAssetCatalog(codeRoot, { verifyFiles: true });
  await loadCardLayoutCatalog(codeRoot, { verifyFiles: true });
  await loadClassMechanicLayoutCatalog(codeRoot, { verifyFiles: true });
  const baseline = fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
  const baselineHash = crypto.createHash('sha256').update(baseline).digest('hex');
  if (baselineHash !== expectedBaselineSha256) throw new Error('Baseline HTML hash mismatch: ' + baselineHash);

  const adapter = fs.readFileSync(adapterPath, 'utf8').trim();
  if (/\beval\s*\(|\bnew\s+Function\b/.test(adapter)) throw new Error('Renderer adapter cannot use eval or new Function.');
  if (baseline.split(marker).length !== 2) throw new Error('Expected exactly one final V0.4 bootstrap marker.');

  let html = removeRelationalGraph(removeGalleryCreateButton(removeRetiredGameplaySubtype(baseline)));
  html = replaceExact(html, 'groupDefs[7]', 'groupDefs[2]', 2);
  html = html.replace(marker, () => adapter + '\n' + marker);
  if (html.split(marker).length !== 2) throw new Error('Expected exactly one renderer bootstrap marker after adapter injection.');
  if (/\b(?:subtype|subtipo)\b/i.test(html)) throw new Error('Generated renderer contains the retired card gameplay subtype factor.');
  if ((html.match(/\bconst\s+imgSrc\s*=/g) || []).length !== 1) throw new Error('Expected one V0.4 imgSrc binding for the media adapter.');
  html = html.replace(/\bconst\s+imgSrc\s*=/, 'let imgSrc=');
  html = html.replaceAll('lcs-app://app/', '/').replaceAll('lcs-media://vault/', '/media/');
  const inlineScript = html.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
  if (!inlineScript || (html.match(/<script(?:\s[^>]*)?>/gi) || []).length !== 1) {
    throw new Error('Expected one inline source script for the renderer CSP hash.');
  }
  const scriptHash = crypto.createHash('sha256').update(inlineScript[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64');
  const csp = [
    "default-src 'none'",
    "script-src 'self' 'sha256-" + scriptHash + "'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: lcs-media:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob: lcs-media:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'"
  ].join('; ');
  if (!/^<!doctype html><html/i.test(html)) throw new Error('Unexpected baseline document prefix.');
  html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="' + csp + '">');

  html = html.replace('<title>', '<link rel="stylesheet" href="/web.css"><link rel="icon" type="image/png" sizes="128x128" href="/branding/favicon.png"><title>').replace('<script>', '<script src="/bridge.js"></script><script>').replace('Lok\'nite Class System — Prototype V0.4', 'Lok\'nite Class System');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  process.stdout.write(JSON.stringify({ baselineSha256: baselineHash, rendererSha256: crypto.createHash('sha256').update(html).digest('hex'), scriptCspSha256: scriptHash, outputPath }) + '\n');
}

buildRenderer().catch(error => {
  process.stderr.write((error?.stack || String(error)) + '\n');
  process.exitCode = 1;
});
