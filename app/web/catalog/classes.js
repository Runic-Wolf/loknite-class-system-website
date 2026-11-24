import { ApiError, queryPath, recordPath, request } from '../lib/api.js';
import { currentParams, esc, field, href, notice, parseTags, tagsText } from '../lib/dom.js';

const tierNames = { C1: 'C1 · Bronze', C2: 'C2 · Silver', C3: 'C3 · Gold', SPEC: 'Specialization' };

function listHref(item, params) {
  return href({ ...params, id: item.id, edit: '' });
}

function renderFilters(params, lineages) {
  return `<form class="filter-bar" action="/" method="get">
    <input type="hidden" name="view" value="classes">
    <label class="search-field"><span class="sr-only">Search classes</span><span aria-hidden="true">⌕</span>
      <input name="q" value="${esc(params.q ?? '')}" placeholder="Search names, concepts, notes…" autocomplete="off">
      <kbd>Enter</kbd>
    </label>
    <label class="select-field"><span class="sr-only">Tier</span><select name="tier">
      <option value="">All tiers</option>${Object.entries(tierNames).map(([tier, title]) => `<option value="${tier}" ${params.tier === tier ? 'selected' : ''}>${title}</option>`).join('')}
    </select></label>
    <label class="select-field"><span class="sr-only">Lineage</span><select name="lineage">
      <option value="">All lineages</option>${lineages.map(item => `<option value="${esc(item.slot)}" ${params.lineage === item.slot ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}
    </select></label>
    <button class="button button-quiet" type="submit">Search</button>
    ${params.q || params.tier || params.lineage ? `<a class="button button-quiet" href="/?view=classes">Clear</a>` : ''}
  </form>`;
}

function renderClassRow(item, params, selectedId) {
  const active = item.id === selectedId;
  return `<a class="class-row ${active ? 'is-selected' : ''}" href="${listHref(item, params)}" ${active ? 'aria-current="true"' : ''}>
    <span class="class-icon">${item.icon ? `<img src="${esc(item.icon)}" alt="" width="40" height="40" loading="lazy">` : '<span aria-hidden="true">◇</span>'}</span>
    <span class="class-row-copy"><span class="class-row-name">${esc(item.name || '?')}</span><span class="class-row-meta">${esc(item.tier)} <span aria-hidden="true">·</span> ${esc(item.slot)}</span></span>
    <span class="row-chevron" aria-hidden="true">›</span>
  </a>`;
}

function renderList(items, params, selectedId, next) {
  const rows = items.map(item => renderClassRow(item, params, selectedId)).join('');
  const empty = `<div class="empty-state"><span class="empty-mark" aria-hidden="true">⌕</span><strong>No classes found</strong><p>Try a broader search or clear a filter.</p></div>`;
  const nextHref = next ? href({ ...params, after: next, id: '' }) : '';
  return `<section class="surface class-list" aria-label="Class results">
    <div class="surface-heading"><div><span class="eyebrow">CLASS RECORDS</span><h2>Results <span class="count-pill">${items.length}</span></h2></div><span class="surface-note">Sorted by name</span></div>
    <div class="class-rows">${rows || empty}</div>
    ${next ? `<a class="next-page" href="${nextHref}">Next page <span aria-hidden="true">→</span></a>` : ''}
  </section>`;
}

function renderClassDetail(record, related, params, session, message) {
  const item = record.item;
  const parent = record.lineage?.at(-2);
  const path = record.lineage?.map(part => part.name).join(' / ');
  const isEditing = params.edit === '1';
  const backParams = { ...params, id: '', edit: '', saved: '' };
  const image = item.imagePath ? `/media/${item.imagePath.split('/').map(encodeURIComponent).join('/')}` : record.icon ?? null;
  const children = record.children ?? [];
  const skills = related.skills?.items ?? [];
  const cards = related.cards?.items ?? [];
  const note = message ?? (params.saved ? 'Class saved.' : '');
  const tags = item.tags ?? [];
  const editor = isEditing ? `<form class="record-form" data-class-form data-version="${esc(record.version)}">
      ${field('Class name', 'name', item.name, { max: 160 })}
      <div class="form-grid">${field('Concept', 'concept', item.concept, { max: 4000 })}
        ${field('Tags', 'tags', tagsText(tags), { max: 4000, hint: 'Use existing game tags, such as INT, DPS or Arcane.' })}</div>
      ${field('Notes', 'notes', item.notes, { multiline: true, max: 32000 })}
      ${field('Image path', 'imagePath', item.imagePath, { max: 500, hint: 'Optional path to media already in the workspace.' })}
      <div class="form-actions"><a class="button button-quiet" href="${href({ ...params, edit: '', saved: '' })}">Cancel</a>
        <button class="button button-primary" type="submit">Save class</button><span class="form-status" role="status" aria-live="polite"></span></div>
    </form>` : `<div class="detail-copy"><span class="field-caption">CONCEPT</span><p>${esc(item.concept || 'No concept yet.')}</p></div>
      <div class="detail-copy"><span class="field-caption">NOTES</span><p class="preserve-lines">${esc(item.notes || 'No notes yet.')}</p></div>
      <div class="tag-list" aria-label="Class tags">${tags.map(tag => `<span class="tag-chip">${esc(tag)}</span>`).join('') || '<span class="muted-copy">No tags assigned</span>'}</div>`;
  return `<article class="surface class-detail" aria-labelledby="detail-title">
    <div class="detail-topline"><a class="back-link" href="${href(backParams)}"><span aria-hidden="true">←</span> Classes</a>
      ${item.official ? '<span class="status-dot">Official</span>' : '<span class="status-dot is-draft">In design</span>'}</div>
    <div class="class-hero">
      <div class="class-hero-icon">${image ? `<img src="${esc(image)}" alt="" width="88" height="88">` : '<span aria-hidden="true">◇</span>'}</div>
      <div class="class-hero-title"><span class="eyebrow">${esc(tierNames[item.tier] ?? item.tier)} <span aria-hidden="true">·</span> ${esc(item.slot)}</span>
        <h2 id="detail-title">${esc(item.name || '?')}</h2><p class="lineage-path">${esc(path || item.slot)}</p></div>
      <div class="detail-actions">${!isEditing && session ? `<a class="button button-primary" href="${href({ ...params, edit: '1', saved: '' })}">Edit class</a><a class="button button-quiet" href="${href({ view: 'database', entity: 'skills', class: item.id, create: '1' })}">Add skill</a>` : ''}</div>
    </div>
    ${notice(note, message ? 'error' : 'success')}
    ${editor}
    <div class="detail-stats"><div><strong>${record.skillCount ?? 0}</strong><span>Skills</span></div><div><strong>${record.cardCount ?? 0}</strong><span>Cards</span></div><div><strong>${children.length}</strong><span>Child classes</span></div></div>
    ${parent ? `<div class="relation-block"><span class="field-caption">PARENT CLASS</span><a href="${href({ ...params, id: parent.id, edit: '' })}" class="relation-link">${esc(parent.name)} <span>${esc(parent.tier)}</span></a></div>` : ''}
    ${children.length ? `<div class="relation-block"><span class="field-caption">CHILD CLASSES</span><div class="relation-list">${children.map(child => `<a class="relation-link" href="${href({ ...params, id: child.id, edit: '' })}">${esc(child.name || '?')} <span>${esc(child.tier)}</span></a>`).join('')}</div></div>` : ''}
    ${skills.length ? `<div class="relation-block"><span class="field-caption">SKILLS</span><div class="relation-list">${skills.map(skill => `<a class="relation-link" href="${href({ view: 'database', entity: 'skills', id: skill.id })}">${esc(skill.name)} <span>${esc(skill.kind ?? '')}</span></a>`).join('')}</div></div>` : ''}
    ${cards.length ? `<div class="relation-block"><span class="field-caption">RELATED CARDS</span><div class="relation-list">${cards.map(card => `<a class="relation-link" href="${href({ view: 'cards', id: card.id })}">${esc(card.name || '?')} <span>${esc(card.status)}</span></a>`).join('')}</div></div>` : ''}
    ${parent ? `<span class="sr-only">Workspace member: ${esc(session?.email ?? '')}</span>` : ''}
  </article>`;
}

function renderContext(record) {
  const lineage = record?.lineage ?? [];
  if (!lineage.length) return `<aside class="context-panel"><div class="context-head"><span class="eyebrow">DESIGN CONTEXT</span><h2>Class lineage</h2></div><p class="muted-copy">Choose a class to inspect its place in the 315-slot structure.</p><div class="context-note"><span class="context-mark" aria-hidden="true">15</span><div><strong>15 base lineages</strong><p>Each lineage branches through C2, C3 and specialization slots.</p></div></div></aside>`;
  return `<aside class="context-panel"><div class="context-head"><span class="eyebrow">DESIGN CONTEXT</span><h2>Class lineage</h2></div>
    <div class="lineage-stack">${lineage.map((part, index) => `<div class="lineage-step ${index === lineage.length - 1 ? 'is-current' : ''}"><span class="lineage-tier">${esc(part.tier)}</span><span class="lineage-name">${esc(part.name || '?')}</span><span class="lineage-slot">${esc(part.slot)}</span></div>`).join('<span class="lineage-connector" aria-hidden="true">↓</span>')}</div>
    <div class="context-note"><span class="context-mark" aria-hidden="true">${record.children?.length ?? 0}</span><div><strong>Next branches</strong><p>${record.children?.length ? 'Open a child slot to continue the design tree.' : 'This slot has no child classes.'}</p></div></div>
  </aside>`;
}

export async function renderClasses(params, session, overview) {
  const requestParams = { q: params.q, tier: params.tier, lineage: params.lineage, after: params.after, limit: 24 };
  const listPromise = request(queryPath('classes', requestParams));
  const detailPromise = params.id ? request(recordPath('classes', params.id)) : Promise.resolve(null);
  const [list, record] = await Promise.all([listPromise, detailPromise]);
  let related = {};
  if (record && !params.edit) {
    const [skills, cards] = await Promise.all([
      request(queryPath('skills', { class: record.item.id, limit: 6 })),
      request(queryPath('cards', { owner: record.item.id, limit: 6 }))
    ]);
    related = { skills, cards };
  }
  const error = params.error ? 'The save could not be completed. Your changes are still in the form.' : '';
  const count = overview?.counts?.classes ?? 315;
  const content = `<section class="page-heading"><div><span class="eyebrow">CLASS MATRIX <span aria-hidden="true">/</span> LOK’NITE</span><h1>Classes</h1><p>Shape the 315-slot progression, one lineage at a time.</p></div>
    <div class="heading-aside"><span class="stat-number">${count}</span><span class="stat-label">fixed class slots</span></div></section>
    ${renderFilters(params, overview?.lineages ?? [])}
    <div class="class-workspace ${record ? 'has-detail' : ''}">
      ${renderList(list.items, params, params.id, list.next)}
      ${record ? renderClassDetail(record, related, params, session, params.saved ? null : error) : `<section class="surface detail-placeholder"><span class="placeholder-mark" aria-hidden="true">↖</span><h2>Choose a class</h2><p>Open a record to inspect its lineage, notes, tags and linked content.</p></section>`}
      ${renderContext(record)}
    </div>`;
  return content;
}

export function wireClassEditor() {
  const form = document.querySelector('[data-class-form]');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const status = form.querySelector('.form-status');
    const data = new FormData(form);
    const body = {
      name: data.get('name'), concept: data.get('concept'), notes: data.get('notes'),
      imagePath: data.get('imagePath') || null, tags: parseTags(data.get('tags'))
    };
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Saving…';
    try {
      await request(recordPath('classes', currentParams().id), { method: 'PATCH', body, version: form.dataset.version });
      const next = currentParams();
      next.saved = '1';
      delete next.edit;
      location.assign(href(next));
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 409
        ? 'This class changed in another session. Copy your text, then reload before saving again.'
        : error.message;
      status.dataset.error = 'true';
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}
