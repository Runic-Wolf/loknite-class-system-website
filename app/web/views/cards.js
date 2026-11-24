import { ApiError, queryPath, recordPath, request } from '../lib/api.js';
import { currentParams, esc, field, href, notice, parseTags, selectField, tagsText } from '../lib/dom.js';
import { classPicker, wireClassPicker } from '../catalog/class-picker.js';
import { renderDatabaseTabs } from '../catalog/database-tabs.js';
import { renderCardGalleryItem } from '../catalog/card-visual.js';

const categories = [['class', 'Class'], ['enemy', 'Enemy'], ['neutral', 'Neutral'], ['equipment', 'Equipment'], ['species', 'Species'], ['status', 'Status']];
const types = [['Attack', 'Attack'], ['Skill', 'Skill'], ['Power', 'Power'], ['Other', 'Other'], ['Class Mechanic', 'Class Mechanic']];
const newTypes = types.filter(([value]) => value !== 'Class Mechanic');
const elements = ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'].map(value => [value, value]);
const workflow = [['draft', 'Draft'], ['review', 'In review'], ['completed', 'Completed'], ['audited', 'Audited']];
const statuses = [['RASCUNHO', 'Draft'], ['CONFIRMADO', 'Confirmed']];

function route(params, extra = {}) {
  return { ...params, ...extra, entity: params.view === 'database' ? 'cards' : undefined };
}

function cardListHref(item, params) {
  return href(route(params, { id: item.id, create: '', edit: '' }));
}

function filterBar(params) {
  return `<form class="catalog-filter" action="/" method="get">
    <input type="hidden" name="view" value="${esc(params.view)}">${params.view === 'database' ? '<input type="hidden" name="entity" value="cards">' : ''}
    ${params.owner ? `<input type="hidden" name="owner" value="${esc(params.owner)}">` : ''}
    <label class="search-field"><span class="sr-only">Search cards</span><span aria-hidden="true">⌕</span><input name="q" value="${esc(params.q ?? '')}" placeholder="Search names and rules…" autocomplete="off"><kbd>Enter</kbd></label>
    <label class="select-field"><span class="sr-only">Category</span><select name="category"><option value="">All groups</option>${categories.map(([value, name]) => `<option value="${value}" ${params.category === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <label class="select-field"><span class="sr-only">Status</span><select name="status"><option value="">All statuses</option>${statuses.map(([value, name]) => `<option value="${value}" ${params.status === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <label class="select-field"><span class="sr-only">Element</span><select name="element"><option value="">All elements</option>${elements.map(([value, name]) => `<option value="${value}" ${params.element === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <button class="button button-quiet" type="submit">Filter</button>
    ${params.q || params.category || params.status || params.element || params.owner ? `<a class="button button-quiet" href="${href(route(params, { q: '', category: '', status: '', element: '', owner: '', after: '' }))}">Clear</a>` : ''}
  </form>`;
}

function renderCardRow(item, params) {
  return `<a class="record-row ${item.id === params.id ? 'is-selected' : ''}" href="${cardListHref(item, params)}" ${item.id === params.id ? 'aria-current="true"' : ''}>
    <span class="record-row-copy"><strong>${esc(item.name || '?')}</strong><small>${esc(item.category)} · ${esc(item.type)}${item.ownerName ? ` · ${esc(item.ownerName)}` : ''}</small></span>
    <span class="record-row-state ${item.status === 'CONFIRMADO' ? 'is-confirmed' : ''}">${esc(item.status)}</span><span class="row-chevron" aria-hidden="true">›</span>
  </a>`;
}

function renderCardList(page, params) {
  const next = page.next ? href(route(params, { after: page.next, id: '', edit: '' })) : '';
  const gallery = params.view !== 'database';
  const items = gallery
    ? page.items.map(item => renderCardGalleryItem(item, cardListHref(item, params), item.id === params.id)).join('')
    : page.items.map(item => renderCardRow(item, params)).join('');
  const empty = '<div class="empty-state"><strong>No cards match this search</strong><p>Clear a filter or create a new card.</p></div>';
  return `<section class="surface catalog-list ${gallery ? 'card-gallery-list' : ''}" aria-label="Card results"><div class="surface-heading"><div><span class="eyebrow">${gallery ? 'CARD COLLECTION' : 'CARD RECORDS'}</span><h2>${gallery ? 'Collection' : 'Results'} <span class="count-pill">${page.items.length}</span></h2></div><span class="surface-note">Alphabetical · ${page.items.length} shown</span></div>
    <div class="${gallery ? 'game-card-grid' : 'record-rows'}">${items || empty}</div>
    ${next ? `<a class="next-page" href="${next}">Next page <span aria-hidden="true">→</span></a>` : ''}</section>`;
}

function mediaUrl(path) {
  return path ? '/media/' + path.split('/').map(encodeURIComponent).join('/') : '';
}

function cardEditor(record, params, error = '') {
  const item = record?.item ?? { category: params.category === 'enemy' ? 'enemy' : 'class', name: '', type: 'Skill', element: 'Neutral', cost: '0', ruleText: '', flavourText: '', workflowStatus: 'draft', tags: [], artPath: null };
  const creating = !record;
  const fixedType = item.type === 'Class Mechanic';
  return `<form class="record-form catalog-editor" data-card-form data-version="${esc(record?.version ?? '')}" data-create="${creating}">
    <div class="editor-heading"><div><span class="eyebrow">${creating ? 'NEW RECORD' : 'EDIT RECORD'}</span><h2>${creating ? 'Create card' : 'Card fields'}</h2></div>${item.status ? `<span class="record-state ${item.status === 'CONFIRMADO' ? 'is-confirmed' : ''}">${esc(item.status)}</span>` : ''}</div>
    ${creating ? `${selectField('Card group', 'category', item.category, categories)}${classPicker({ fieldName: 'ownerId', label: 'Origin class' })}` : ''}
    ${field('Card name', 'name', item.name, { max: 160 })}
    <div class="form-grid">${selectField('Type', 'type', item.type, fixedType ? types : newTypes)}${selectField('Element', 'element', item.element, elements)}</div>
    <div class="form-grid">${selectField('Cost', 'cost', item.cost, ['0', '1', '2', '3', '4', '5', 'X'].map(value => [value, value]))}${selectField('Workflow', 'workflowStatus', item.workflowStatus, workflow)}</div>
    ${field('Tags', 'tags', tagsText(item.tags), { max: 3200, hint: 'Use existing game tags, such as INT, DPS or Arcane.' })}
    ${field('Rule text', 'ruleText', item.ruleText, { multiline: true, max: 12000 })}
    ${field('Flavour text', 'flavourText', item.flavourText, { multiline: true, max: 12000 })}
    ${field('Artwork path', 'artPath', item.artPath, { max: 500, hint: 'Upload an image below, or leave empty to remove artwork.' })}
    <label class="form-field upload-field"><span>Upload artwork</span><input type="file" accept="image/png,image/jpeg,image/webp" data-art-upload><small>PNG, JPEG or WebP; up to 12 MB. Uploaded files are private to this workspace.</small><span data-upload-status class="upload-status" role="status" aria-live="polite"></span></label>
    ${notice(error, 'error')}
    <div class="form-actions"><a class="button button-quiet" href="${href(route(params, { id: '', create: '', edit: '' }))}">Cancel</a><button class="button button-primary" type="submit">${creating ? 'Create card' : 'Save changes'}</button><span class="form-status" role="status" aria-live="polite"></span></div>
  </form>`;
}

function ownerLabel(item) {
  return item.ownerName || item.layoutClassId || item.noteOwnerId || item.source?.classId || item.source?.rootClassId || '';
}

function cardDetail(record, owner, params) {
  const item = record.item;
  const path = mediaUrl(item.artPath);
  const source = item.source ?? { kind: 'independent' };
  const canDelete = item.status !== 'CONFIRMADO' && source.kind !== 'skill' && item.type !== 'Class Mechanic';
  const backLabel = params.view === 'database' ? 'Card results' : 'Card gallery';
  return `<article class="surface record-detail">
    <div class="detail-topline"><a class="back-link" href="${href(route(params, { id: '', edit: '', create: '' }))}"><span aria-hidden="true">←</span> ${backLabel}</a><span class="record-state ${item.status === 'CONFIRMADO' ? 'is-confirmed' : ''}">${esc(item.status)}</span></div>
    <div class="record-hero">${path ? `<img class="record-art" src="${esc(path)}" alt="Artwork for ${esc(item.name)}" loading="lazy">` : '<span class="record-art-placeholder" aria-hidden="true">◇</span>'}
      <div><span class="eyebrow">${esc(item.category)} · ${esc(item.type)}</span><h2>${esc(item.name || '?')}</h2><p>${esc(item.element)} · Cost ${esc(item.cost)}</p></div>
      <a class="button button-primary" href="${href(route(params, { edit: '1', create: '' }))}">Edit card</a>
    </div>
    ${notice(params.saved ? 'Card saved.' : params.created ? 'Card created.' : '', 'success')}
    ${owner ? `<div class="relation-block"><span class="field-caption">ORIGIN CLASS</span><a class="relation-link" href="${href({ view: 'classes', id: owner.item.id, tier: owner.item.tier })}">${esc(owner.item.name)} <span>${esc(owner.item.tier)}</span></a></div>` : ownerLabel(item) ? `<div class="relation-block"><span class="field-caption">ORIGIN</span><p class="muted-copy">${esc(ownerLabel(item))}</p></div>` : ''}
    ${source.kind === 'skill' ? `<div class="relation-block"><span class="field-caption">LINKED SKILL</span><a class="relation-link" href="${href({ view: 'database', entity: 'skills', id: source.skillId })}">${esc(source.skillId)}</a></div>` : ''}
    <div class="detail-copy"><span class="field-caption">RULE TEXT</span><p class="preserve-lines">${esc(item.ruleText || 'No rule text yet.')}</p></div>
    <div class="detail-copy"><span class="field-caption">FLAVOUR TEXT</span><p class="preserve-lines">${esc(item.flavourText || 'No flavour text yet.')}</p></div>
    <div class="tag-list" aria-label="Card tags">${(item.tags ?? []).map(tag => `<span class="tag-chip">${esc(tag)}</span>`).join('') || '<span class="muted-copy">No tags assigned</span>'}</div>
    <div class="record-admin-actions" data-card-actions data-id="${esc(item.id)}" data-version="${esc(record.version)}">
      ${item.status === 'CONFIRMADO' ? '<button class="button button-quiet" type="button" data-action="unconfirm">Reopen draft</button>' : '<button class="button button-primary" type="button" data-action="confirm">Confirm card</button>'}
      ${canDelete ? '<button class="button button-danger" type="button" data-action="delete">Delete draft</button>' : ''}<span class="form-status" role="status" aria-live="polite"></span>
    </div>
  </article>`;
}

export async function renderCards(params, session) {
  const page = await request(queryPath('cards', { q: params.q, category: params.category, status: params.status, type: params.type, element: params.element, owner: params.owner, after: params.after, limit: 24 }));
  let record = null;
  let owner = null;
  if (params.id) {
    record = await request(recordPath('cards', params.id));
    const ownerId = record.item.noteOwnerId || record.item.layoutClassId || record.item.source?.classId || record.item.source?.rootClassId;
    if (ownerId) owner = await request(recordPath('classes', ownerId)).catch(() => null);
  }
  const title = params.view === 'database' ? 'Database · Cards' : 'Card Gallery';
  let detail = record && params.edit === '1' ? cardEditor(record, params, params.error ? 'The save could not be completed. Your changes are still in the form.' : '')
    : params.create === '1' ? cardEditor(null, params, params.error ? 'The card could not be created. Your entries are still in the form.' : '')
      : record ? cardDetail(record, owner, params) : `<section class="surface detail-placeholder"><span class="placeholder-mark" aria-hidden="true">↖</span><h2>Choose a card</h2><p>Inspect its rules, artwork, origin, status and linked skill.</p></section>`;
  const gallery = params.view !== 'database';
  return `${params.view === 'database' ? renderDatabaseTabs(params) : ''}<section class="page-heading"><div><span class="eyebrow">${params.view === 'database' ? 'RECORD BROWSER' : 'CARD COLLECTION'} <span aria-hidden="true">/</span> LOK’NITE</span><h1>${title}</h1><p>Search and edit card records while protected gameplay remains immutable.</p></div><div class="heading-actions"><span class="stat-number">${page.items.length}</span><a class="button button-primary" href="${href(route(params, { create: '1', id: '', edit: '' }))}">New card</a></div></section>
    ${filterBar(params)}<div class="catalog-workspace ${gallery ? 'card-gallery-workspace' : ''} ${params.id || params.create ? 'has-detail' : ''}">${renderCardList(page, params)}${detail}</div>`;
}

export function wireCards() {
  const form = document.querySelector('[data-card-form]');
  if (form) wireCardForm(form);
  const actions = document.querySelector('[data-card-actions]');
  if (!actions) return;
  actions.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'delete' && !window.confirm('Delete this draft card? This cannot be undone.')) return;
    const status = actions.querySelector('.form-status');
    actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
    status.textContent = action === 'delete' ? 'Deleting…' : action === 'confirm' ? 'Confirming…' : 'Reopening…';
    try {
      const path = recordPath('cards', actions.dataset.id) + (action === 'delete' ? '' : '/' + action);
      const result = await request(path, { method: action === 'delete' ? 'DELETE' : 'POST', body: {}, version: actions.dataset.version });
      const params = currentParams();
      if (action === 'delete') { delete params.id; delete params.edit; }
      else { params.id = result.item.id; params.saved = '1'; }
      location.assign(href(params));
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 409 ? 'This card changed in another session. Reload before retrying.' : error.message;
      actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
    }
  });
}

function wireCardForm(form) {
  wireClassPicker(form);
  const upload = form.querySelector('[data-art-upload]');
  upload?.addEventListener('change', async () => {
    const file = upload.files?.[0];
    if (!file) return;
    const status = form.querySelector('[data-upload-status]');
    if (file.size > 12 * 1024 * 1024) { status.textContent = 'The file is larger than 12 MB.'; upload.value = ''; return; }
    status.textContent = 'Uploading artwork…';
    upload.disabled = true;
    try {
      const result = await request('/media', { method: 'POST', body: new Uint8Array(await file.arrayBuffer()), raw: true });
      form.querySelector('[name="artPath"]').value = result.path;
      status.textContent = 'Artwork uploaded. Save the card to attach it.';
    } catch (error) {
      status.textContent = error.message;
    } finally { upload.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('.form-status');
    const button = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    const body = {
      name: values.get('name'), type: values.get('type'), element: values.get('element'), cost: values.get('cost'),
      workflowStatus: values.get('workflowStatus'), tags: parseTags(values.get('tags')), ruleText: values.get('ruleText'),
      flavourText: values.get('flavourText'), artPath: values.get('artPath') || null
    };
    if (form.dataset.create === 'true') {
      body.category = values.get('category');
      body.ownerId = values.get('ownerId') || null;
    }
    if (form.dataset.create === 'true' && form.querySelector('[data-class-picker]')?.dataset.required === 'true' && !body.ownerId) {
      status.textContent = 'Select a class before saving.';
      return;
    }
    button.disabled = true;
    status.textContent = form.dataset.create === 'true' ? 'Creating…' : 'Saving…';
    try {
      const params = currentParams();
      const path = form.dataset.create === 'true' ? '/catalog/cards' : recordPath('cards', params.id);
      const saved = await request(path, { method: form.dataset.create === 'true' ? 'POST' : 'PATCH', body, version: form.dataset.version || undefined });
      location.assign(href(route(params, { id: saved.item.id, create: '', edit: '', saved: form.dataset.create === 'true' ? '' : '1', created: form.dataset.create === 'true' ? '1' : '' })));
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 409 ? 'This card changed in another session. Copy your text, then reload before saving.' : error.message;
      button.disabled = false;
    }
  });
}
