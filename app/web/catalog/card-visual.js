import { esc } from '../lib/dom.js';

const classNames = ['FIGHTER', 'BARBARIAN', 'NATURALIST', 'ROGUE', 'ARCANIST', 'CLERIC', 'INNOVATOR', 'SORCERER', 'ACOLYTE', 'DISCIPLE', 'BUSHI', 'SPIRITUALIST', 'ARTIST', 'OUTLAW', 'SWORDSMAN'];
const tierFolders = { C1: '01_C1_BRONZE', C2: '02_C2_PRATA', C3: '03_C3_OURO' };

function mediaUrl(path) {
  return path ? '/media/' + path.split('/').map(encodeURIComponent).join('/') : '';
}

function layoutPath(item) {
  const match = /^C1_(\d+)/.exec(item.ownerSlot ?? '');
  const index = Number(match?.[1]);
  if (!match || !Number.isInteger(index) || index < 0 || index >= classNames.length) return '';
  const filename = `${String(index + 1).padStart(2, '0')}_${classNames[index]}.png`;
  if (item.type === 'Class Mechanic') return `/class-mechanics/${filename}`;
  const tier = item.ownerTier === 'SPEC' ? 'C3' : item.ownerTier;
  const folder = tierFolders[tier];
  return folder ? `/card-layouts/${folder}/${filename}` : '';
}

function categoryLabel(category) {
  return typeof category === 'string' ? category[0]?.toUpperCase() + category.slice(1) : '';
}

export function renderCardGalleryItem(item, href, selected = false) {
  const image = mediaUrl(item.artPath) || item.ownerIcon;
  const frame = layoutPath(item);
  const status = item.status === 'CONFIRMADO' ? 'Confirmed' : 'Draft';
  return `<a class="game-card-link ${selected ? 'is-selected' : ''}" href="${href}" ${selected ? 'aria-current="true"' : ''}>
    <article class="game-card">
      <div class="game-card-stack" aria-hidden="true"><div class="game-card-face ${frame ? 'has-layout' : 'is-generic'}">
        <div class="game-card-art ${item.artPath ? 'has-artwork' : image ? 'has-class-icon' : 'no-artwork'}">${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async">` : '<span class="game-card-placeholder">◇</span>'}</div>
        <span class="game-card-cost">${esc(item.cost || '0')}</span><span class="game-card-print-title">${esc(item.name || '?')}</span>
        <span class="game-card-print-type">${esc(item.type || 'Other')}</span><span class="game-card-print-rules">${esc(item.ruleTextPreview || 'No rules written yet.')}</span>
        <span class="game-card-print-element">${esc(item.element || 'Neutral')}</span>
        ${frame ? `<img class="game-card-layout" src="${frame}" alt="" loading="lazy" decoding="async">` : ''}
      </div></div>
      <header class="game-card-heading"><h3>${esc(item.name || '?')}</h3><span class="game-card-status ${item.status === 'CONFIRMADO' ? 'is-confirmed' : ''}">${status}</span></header>
      <p class="game-card-meta">${esc(categoryLabel(item.category))} · ${esc(item.type)}${item.ownerName ? ` · ${esc(item.ownerName)}` : ''}</p>
    </article>
  </a>`;
}
