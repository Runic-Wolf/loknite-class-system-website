import { ApiError, queryPath, recordPath, request } from '../lib/api.js';
import { currentParams, esc, field, href, notice, parseTags, selectField, tagsText } from '../lib/dom.js';
import { classPicker, wireClassPicker } from '../catalog/class-picker.js';
import { renderDatabaseTabs } from '../catalog/database-tabs.js';

const kinds = [['Passive', 'Passive'], ['Active', 'Active'], ['Signature', 'Signature'], ['Ultimate', 'Ultimate']];

function route(params, extra = {}) {
  return { ...params, ...extra, view: 'database', entity: 'skills' };
}

function rowHref(item, params) { return href(route(params, { id: item.id, create: '', edit: '' })); }

function renderList(page, params) {
  return `<section class="surface catalog-list"><div class="surface-heading"><div><span class="eyebrow">SKILL RECORDS</span><h2>Results <span class="count-pill">${page.items.length}</span></h2></div><span class="surface-note">${page.items.length} shown</span></div>
    <div class="record-rows">${page.items.map(item => `<a class="record-row ${item.id === params.id ? 'is-selected' : ''}" href="${rowHref(item, params)}" ${item.id === params.id ? 'aria-current="true"' : ''}><span class="record-row-copy"><strong>${esc(item.name || '?')}</strong><small>${esc(item.kind)} · ${esc(item.className || item.classId)}</small></span><span class="row-chevron" aria-hidden="true">›</span></a>`).join('') || '<div class="empty-state"><strong>No skills match this search</strong><p>Create a skill and link it to a class.</p></div>'}</div>
    ${page.next ? `<a class="next-page" href="${href(route(params, { after: page.next, id: '', edit: '' }))}">Next page <span aria-hidden="true">→</span></a>` : ''}</section>`;
}

function editor(record, params, selectedClass, error = '') {
  const item = record?.item ?? { name: '', kind: 'Passive', tags: [], lcsNotes: '', mobileNotes: '' };
  const create = !record;
  return `<form class="record-form catalog-editor" data-skill-form data-version="${esc(record?.version ?? '')}" data-create="${create}">
    <div class="editor-heading"><div><span class="eyebrow">${create ? 'NEW RECORD' : 'EDIT RECORD'}</span><h2>${create ? 'Create skill' : 'Skill fields'}</h2></div></div>
    ${create ? classPicker({ selectedId: selectedClass?.item.id ?? '', selectedName: selectedClass?.item.name ?? '', required: true }) : `<div class="form-field"><span>Class</span><a class="relation-link" href="${href({ view: 'classes', id: item.classId })}">${esc(selectedClass?.item.name ?? item.classId)}</a><small>A skill stays linked to its original class.</small></div>`}
    ${field('Skill name', 'name', item.name, { max: 160 })}${selectField('Kind', 'kind', item.kind, kinds)}
    ${field('Tags', 'tags', tagsText(item.tags), { max: 3200, hint: 'Use existing game tags, such as INT, DPS or TANK.' })}
    ${field('Class system notes', 'lcsNotes', item.lcsNotes, { multiline: true, max: 12000 })}
    ${field('Mobile notes', 'mobileNotes', item.mobileNotes, { multiline: true, max: 12000 })}
    ${notice(error, 'error')}<div class="form-actions"><a class="button button-quiet" href="${href(route(params, { id: '', edit: '', create: '' }))}">Cancel</a><button class="button button-primary" type="submit">${create ? 'Create skill' : 'Save changes'}</button><span class="form-status" role="status" aria-live="polite"></span></div>
  </form>`;
}

function detail(record, owner, card, params) {
  const item = record.item;
  return `<article class="surface record-detail"><div class="detail-topline"><a class="back-link" href="${href(route(params, { id: '', edit: '', create: '' }))}"><span aria-hidden="true">←</span> Skills</a><span class="record-state">${esc(item.kind)}</span></div>
    <div class="record-heading"><span class="eyebrow">SKILL RECORD</span><h2>${esc(item.name || '?')}</h2><p>${owner ? `<a class="text-link" href="${href({ view: 'classes', id: owner.item.id })}">${esc(owner.item.name)} · ${esc(owner.item.tier)}</a>` : esc(item.classId)}</p></div>
    ${notice(params.saved ? 'Skill and linked card saved.' : params.created ? 'Skill created with its linked card.' : '', 'success')}
    <div class="detail-stats"><div><strong>${esc(item.kind)}</strong><span>Kind</span></div><div><strong>${esc(item.tags?.length ?? 0)}</strong><span>Tags</span></div><div><strong>1</strong><span>Linked card</span></div></div>
    <div class="detail-copy"><span class="field-caption">CLASS SYSTEM NOTES</span><p class="preserve-lines">${esc(item.lcsNotes || 'No notes yet.')}</p></div><div class="detail-copy"><span class="field-caption">MOBILE NOTES</span><p class="preserve-lines">${esc(item.mobileNotes || 'No notes yet.')}</p></div>
    <div class="tag-list">${(item.tags ?? []).map(tag => `<span class="tag-chip">${esc(tag)}</span>`).join('') || '<span class="muted-copy">No tags assigned</span>'}</div>
    ${card ? `<div class="relation-block"><span class="field-caption">LINKED CARD</span><a class="relation-link" href="${href({ view: 'cards', id: card.item.id })}">${esc(card.item.name)} <span>${esc(card.item.status)}</span></a><p class="muted-copy">Changes to the skill update the draft card in the same database transaction.</p></div>` : ''}
    <div class="record-admin-actions"><a class="button button-primary" href="${href(route(params, { edit: '1', create: '' }))}">Edit skill</a>
      <details class="delete-disclosure"><summary class="button button-danger">Delete skill</summary><form class="delete-choice" data-delete-skill-form data-id="${esc(item.id)}" data-version="${esc(record.version)}" data-card-status="${esc(card?.item.status ?? '')}">
        <p>Choose what happens to the skill’s linked card.</p><label class="form-field"><span>Linked card</span><select name="disposition"><option value="keep-card">Keep as an independent card</option><option value="delete-card" ${card?.item.status === 'CONFIRMADO' ? 'disabled' : ''}>Delete the card too${card?.item.status === 'CONFIRMADO' ? ' · reopen it first' : ''}</option></select></label><button class="button button-danger" type="submit">Confirm deletion</button><span class="form-status" role="status" aria-live="polite"></span>
      </form></details></div>
  </article>`;
}

export async function renderSkills(params) {
  const page = await request(queryPath('skills', { q: params.q, kind: params.kind, class: params.class, after: params.after, limit: 20 }));
  let record = null, owner = null, card = null;
  const selectedId = params.id ? null : params.class;
  if (params.id) {
    record = await request(recordPath('skills', params.id));
    [owner, card] = await Promise.all([
      request(recordPath('classes', record.item.classId)).catch(() => null),
      request(recordPath('cards', record.item.cardId)).catch(() => null)
    ]);
  } else if (selectedId || params.create) owner = selectedId ? await request(recordPath('classes', selectedId)).catch(() => null) : null;
  const title = params.view === 'database' ? 'Database · Skills' : 'Skills';
  let pane = record && params.edit === '1' ? editor(record, params, owner, params.error ? 'The skill could not be saved. Your entries are still in the form.' : '')
    : params.create ? editor(null, params, owner, params.error ? 'The skill could not be created. Your entries are still in the form.' : '')
      : record ? detail(record, owner, card, params) : `<section class="surface detail-placeholder"><span class="placeholder-mark" aria-hidden="true">↖</span><h2>Choose a skill</h2><p>Inspect its class relation, notes and paired card.</p></section>`;
  return `${params.view === 'database' ? renderDatabaseTabs(params) : ''}<section class="page-heading"><div><span class="eyebrow">CLASS CONTENT <span aria-hidden="true">/</span> LOK’NITE</span><h1>${title}</h1><p>Skills are class records with a transactionally linked card.</p></div><div class="heading-actions"><span class="stat-number">${page.items.length}</span><a class="button button-primary" href="${href(route(params, { create: '1', id: '', edit: '' }))}">New skill</a></div></section>
    <form class="catalog-filter" action="/" method="get"><input type="hidden" name="view" value="database"><input type="hidden" name="entity" value="skills"><label class="search-field"><span class="sr-only">Search skills</span><span aria-hidden="true">⌕</span><input name="q" value="${esc(params.q ?? '')}" placeholder="Search skill names and notes…" autocomplete="off"><kbd>Enter</kbd></label><label class="select-field"><span class="sr-only">Kind</span><select name="kind"><option value="">All kinds</option>${kinds.map(([value, name]) => `<option value="${value}" ${params.kind === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label><button class="button button-quiet" type="submit">Search</button>${params.q || params.kind ? `<a class="button button-quiet" href="${href({ view: 'database', entity: 'skills' })}">Clear</a>` : ''}</form>
    <div class="catalog-workspace ${record || params.create ? 'has-detail' : ''}">${renderList(page, params)}${pane}</div>`;
}

export function wireSkills() {
  const form = document.querySelector('[data-skill-form]');
  if (form) {
    wireClassPicker(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(form), status = form.querySelector('.form-status'), button = form.querySelector('[type="submit"]');
      const body = { name: values.get('name'), kind: values.get('kind'), tags: parseTags(values.get('tags')), lcsNotes: values.get('lcsNotes'), mobileNotes: values.get('mobileNotes') };
      if (form.dataset.create === 'true') {
        body.classId = values.get('classId');
        if (!body.classId) { status.textContent = 'Select a class before saving.'; return; }
      }
      button.disabled = true;
      status.textContent = form.dataset.create === 'true' ? 'Creating skill and linked card…' : 'Saving skill…';
      try {
        const params = currentParams();
        const saved = await request(form.dataset.create === 'true' ? '/catalog/skills' : recordPath('skills', params.id), { method: form.dataset.create === 'true' ? 'POST' : 'PATCH', body, version: form.dataset.version || undefined });
        location.assign(href(route(params, { id: saved.item.id, create: '', edit: '', saved: form.dataset.create === 'true' ? '' : '1', created: form.dataset.create === 'true' ? '1' : '' })));
      } catch (error) {
        status.textContent = error instanceof ApiError && error.status === 409 ? 'This skill or its linked card changed in another session. Reload before saving.' : error.message;
        button.disabled = false;
      }
    });
  }
  document.querySelectorAll('[data-delete-skill-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]'), status = form.querySelector('.form-status');
    button.disabled = true;
    status.textContent = 'Deleting skill…';
    try {
      const disposition = new FormData(form).get('disposition');
      await request(recordPath('skills', form.dataset.id), { method: 'DELETE', body: { disposition }, version: form.dataset.version });
      location.assign(href({ view: 'database', entity: 'skills' }));
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 409 ? 'The skill changed in another session. Reload before deleting.' : error.message;
      button.disabled = false;
    }
  }));
}
