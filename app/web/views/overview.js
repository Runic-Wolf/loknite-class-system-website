import { esc, href } from '../lib/dom.js';
import { renderAuditEvents } from './activity.js';

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'recently';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function renderOverview(data, audit) {
  const countCards = [
    ['Classes', data.counts.classes, 'fixed slots', 'classes'],
    ['Cards', data.counts.cards, 'across six groups', 'cards'],
    ['Skills', data.counts.skills, 'linked to classes', 'database'],
    ['Keywords', data.counts.keywords, 'game terms', 'keywords']
  ];
  return `<section class="page-heading dashboard-heading"><div><span class="eyebrow">PRIVATE DESIGN WORKSPACE <span aria-hidden="true">/</span> REVISION ${esc(data.head.revision)}</span>
    <h1>Lok’nite at a glance</h1><p>Classes, cards and rules for the people shaping the game.</p></div>
    <a class="button button-quiet" href="/classic/">Open classic workspace <span aria-hidden="true">↗</span></a></section>
    <section class="summary-grid" aria-label="Workspace totals">${countCards.map(([label, value, note, view]) => `<a class="summary-card" href="${href({ view })}"><span class="summary-label">${label}</span><strong>${esc(value)}</strong><span class="summary-note">${note}</span><span class="summary-arrow" aria-hidden="true">↗</span></a>`).join('')}</section>
    <section class="surface lineage-section"><div class="surface-heading"><div><span class="eyebrow">PROGRESSION MAP</span><h2>Base lineages <span class="count-pill">${data.lineages.length}</span></h2></div><a href="${href({ view: 'classes', tier: 'C1' })}" class="text-link">View all classes <span aria-hidden="true">→</span></a></div>
      <div class="lineage-grid">${data.lineages.map((item, index) => `<a class="lineage-card" href="${href({ view: 'classes', lineage: item.slot })}"><span class="lineage-card-icon">${item.icon ? `<img src="${esc(item.icon)}" alt="" width="48" height="48" loading="lazy">` : `<span>${String(index + 1).padStart(2, '0')}</span>`}</span><span class="lineage-card-copy"><strong>${esc(item.name || '?')}</strong><small>${esc(item.slot)}</small></span><span class="lineage-card-arrow" aria-hidden="true">↗</span></a>`).join('')}</div>
    </section>
    <section class="audit-preview surface"><div class="surface-heading"><div><span class="eyebrow">TEAM TRACE</span><h2>Recent activity</h2></div><a class="text-link" href="${href({ view: 'activity' })}">Full audit log <span aria-hidden="true">→</span></a></div>
      ${renderAuditEvents(audit?.items ?? [], { compact: true })}</section>
    <section class="dashboard-footer"><span class="online-indicator"></span><span>Workspace online</span><span class="footer-divider" aria-hidden="true">·</span><span>Updated ${esc(formatDate(data.head.updatedAt))}</span><span class="footer-spacer"></span><span>${data.counts.confirmed} confirmed cards</span></section>`;
}
