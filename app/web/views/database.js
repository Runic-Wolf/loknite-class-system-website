import { queryPath, request } from '../lib/api.js';
import { esc, href } from '../lib/dom.js';
import { renderDatabaseTabs } from '../catalog/database-tabs.js';

const records = [
  { table: 'classes', label: 'Classes', kind: 'class', route: item => ({ view: 'classes', id: item.id, tier: item.tier }) },
  { table: 'cards', label: 'Cards', kind: 'card', route: item => ({ view: 'cards', id: item.id }) },
  { table: 'skills', label: 'Skills', kind: 'skill', route: item => ({ view: 'database', entity: 'skills', id: item.id }) },
  { table: 'keywords', label: 'Keywords', kind: 'keyword', route: item => ({ view: 'database', entity: 'keywords', id: item.id }) }
];

function renderHit(item, config) {
  const info = item.tier ? `${item.tier} · ${item.slot}` : item.category ? `${item.category} · ${item.type} · ${item.status}` : item.kind ? `${item.kind} · ${item.className ?? ''}` : item.effect;
  return `<a class="global-result" href="${href(config.route(item))}"><span class="global-result-kind">${config.kind}</span><span class="global-result-copy"><strong>${esc(item.name || '?')}</strong><small>${esc(info || '')}</small></span><span aria-hidden="true">↗</span></a>`;
}

export async function renderDatabase(params) {
  if (params.entity === 'classes') return null;
  const term = (params.q ?? '').trim();
  if (!term) {
    return `${renderDatabaseTabs(params)}<section class="page-heading"><div><span class="eyebrow">WORKSPACE INDEX</span><h1>Database</h1><p>Search the structured catalogue and open the record type you need.</p></div></section>
      <form class="global-search" action="/" method="get"><input type="hidden" name="view" value="database"><label class="search-field"><span class="sr-only">Search all records</span><span aria-hidden="true">⌕</span><input name="q" placeholder="Search classes, cards, skills and keywords…" autocomplete="off"><kbd>Enter</kbd></label><button class="button button-primary" type="submit">Search catalogue</button></form>
      <section class="database-shortcuts" aria-label="Record type summaries">${records.map(item => `<a class="database-shortcut" href="${href(item.table === 'classes' ? { view: 'classes' } : { view: 'database', entity: item.table })}"><span class="eyebrow">${item.kind.toUpperCase()}</span><strong>${item.label}</strong><small>Open records and manage fields</small><span aria-hidden="true">↗</span></a>`).join('')}</section>`;
  }
  const pages = await Promise.all(records.map(config => request(queryPath(config.table, { q: term, limit: 6 }))));
  const total = pages.reduce((sum, page) => sum + page.items.length, 0);
  return `${renderDatabaseTabs(params)}<section class="page-heading"><div><span class="eyebrow">CROSS-CATALOGUE SEARCH</span><h1>Results</h1><p>Matching records across the class, card, skill and keyword indexes.</p></div><span class="stat-number">${total}</span></section>
    <form class="global-search" action="/" method="get"><input type="hidden" name="view" value="database"><label class="search-field"><span class="sr-only">Search all records</span><span aria-hidden="true">⌕</span><input name="q" value="${esc(term)}" placeholder="Search all record types…" autocomplete="off"><kbd>Enter</kbd></label><button class="button button-primary" type="submit">Search again</button></form>
    <div class="global-results">${pages.map((page, index) => `<section class="surface global-result-group"><div class="surface-heading"><div><span class="eyebrow">${records[index].kind.toUpperCase()}</span><h2>${records[index].label} <span class="count-pill">${page.items.length}</span></h2></div></div>${page.items.map(item => renderHit(item, records[index])).join('') || '<p class="muted-copy result-empty">No matches in this record type.</p>'}</section>`).join('')}</div>`;
}
