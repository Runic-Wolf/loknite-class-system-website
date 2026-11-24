import { ApiError, queryPath, recordPath, request } from '../lib/api.js';
import { currentParams, esc, field, href, notice } from '../lib/dom.js';
import { renderDatabaseTabs } from '../catalog/database-tabs.js';

function route(params, extra = {}) { return { ...params, ...extra, view: 'database', entity: 'keywords' }; }
function rowHref(item, params) { return href(route(params, { id: item.id, edit: '', create: '' })); }

function renderList(page, params) {
  return `<section class="surface catalog-list"><div class="surface-heading"><div><span class="eyebrow">GLOSSARY RECORDS</span><h2>Results <span class="count-pill">${page.items.length}</span></h2></div><span class="surface-note">${page.items.length} shown</span></div>
    <div class="record-rows">${page.items.map(item => `<a class="record-row ${item.id === params.id ? 'is-selected' : ''}" href="${rowHref(item, params)}" ${item.id === params.id ? 'aria-current="true"' : ''}><span class="record-row-copy"><strong>${esc(item.name || '?')}</strong><small>${esc(item.effect || 'No definition yet.')}</small></span><span class="row-chevron" aria-hidden="true">›</span></a>`).join('') || '<div class="empty-state"><strong>No keywords match this search</strong><p>Add a term to the game glossary.</p></div>'}</div>
    ${page.next ? `<a class="next-page" href="${href(route(params, { after: page.next, id: '', edit: '' }))}">Next page <span aria-hidden="true">→</span></a>` : ''}</section>`;
}

function editor(record, params, error = '') {
  const item = record?.item ?? { name: '', effect: '' };
  const create = !record;
  return `<form class="record-form catalog-editor" data-keyword-form data-version="${esc(record?.version ?? '')}" data-create="${create}">
    <div class="editor-heading"><div><span class="eyebrow">${create ? 'NEW RECORD' : 'EDIT RECORD'}</span><h2>${create ? 'Add keyword' : 'Term fields'}</h2></div></div>
    ${field('Term', 'name', item.name, { max: 120 })}${field('Definition', 'effect', item.effect, { multiline: true, max: 12000 })}
    ${notice(error, 'error')}<div class="form-actions"><a class="button button-quiet" href="${href(route(params, { id: '', edit: '', create: '' }))}">Cancel</a><button class="button button-primary" type="submit">${create ? 'Create keyword' : 'Save changes'}</button><span class="form-status" role="status" aria-live="polite"></span></div>
  </form>`;
}

function detail(record, params) {
  const item = record.item;
  const refs = record.references ?? [];
  return `<article class="surface record-detail"><div class="detail-topline"><a class="back-link" href="${href(route(params, { id: '', edit: '', create: '' }))}"><span aria-hidden="true">←</span> Keywords</a><span class="record-state">${refs.length} references</span></div>
    <div class="record-heading"><span class="eyebrow">GAME GLOSSARY</span><h2>${esc(item.name || '?')}</h2></div>
    ${notice(params.saved === 'deleted' ? 'Keyword deleted.' : params.saved ? 'Keyword saved.' : params.created ? 'Keyword created.' : '', 'success')}
    <div class="detail-copy"><span class="field-caption">DEFINITION</span><p class="preserve-lines">${esc(item.effect || 'No definition yet.')}</p></div>
    <div class="relation-block"><span class="field-caption">MENTIONS IN THE CATALOG <span class="count-pill">${refs.length}</span></span>
      ${refs.length ? `<div class="relation-list">${refs.map(ref => `<a class="relation-link" href="${href(ref.table === 'classes' ? { view: 'classes', id: ref.id } : { view: 'cards', id: ref.id })}"><span>${esc(ref.name || '?')}</span><span>${ref.table === 'classes' ? 'CLASS' : 'CARD'}</span></a>`).join('')}</div>` : '<p class="muted-copy">No matching class or card text found.</p>'}</div>
    <div class="record-admin-actions"><a class="button button-primary" href="${href(route(params, { edit: '1', create: '' }))}">Edit keyword</a><details class="delete-disclosure"><summary class="button button-danger">Delete keyword</summary>
      <form class="delete-choice" data-delete-keyword-form data-id="${esc(item.id)}" data-version="${esc(record.version)}"><p>Remove this term from the shared glossary?</p><button class="button button-danger" type="submit">Confirm deletion</button><span class="form-status" role="status" aria-live="polite"></span></form></details></div>
  </article>`;
}

export async function renderKeywords(params) {
  const page = await request(queryPath('keywords', { q: params.q, after: params.after, limit: 24 }));
  const record = params.id ? await request(recordPath('keywords', params.id)) : null;
  const title = params.view === 'database' ? 'Database · Keywords' : 'Keyword List';
  const pane = record && params.edit === '1' ? editor(record, params, params.error ? 'The keyword could not be saved. Your entries are still in the form.' : '')
    : params.create ? editor(null, params, params.error ? 'The keyword could not be created. Your entries are still in the form.' : '')
      : record ? detail(record, params) : `<section class="surface detail-placeholder"><span class="placeholder-mark" aria-hidden="true">↖</span><h2>Choose a keyword</h2><p>Inspect its definition and mentions across classes and cards.</p></section>`;
  return `${params.view === 'database' ? renderDatabaseTabs(params) : ''}<section class="page-heading"><div><span class="eyebrow">GLOSSARY <span aria-hidden="true">/</span> LOK’NITE</span><h1>${title}</h1><p>Keep game language consistent and find where a term appears.</p></div><div class="heading-actions"><span class="stat-number">${page.items.length}</span><a class="button button-primary" href="${href(route(params, { create: '1', id: '', edit: '' }))}">New keyword</a></div></section>
    <form class="catalog-filter" action="/" method="get"><input type="hidden" name="view" value="database"><input type="hidden" name="entity" value="keywords"><label class="search-field"><span class="sr-only">Search keywords</span><span aria-hidden="true">⌕</span><input name="q" value="${esc(params.q ?? '')}" placeholder="Search terms and definitions…" autocomplete="off"><kbd>Enter</kbd></label><button class="button button-quiet" type="submit">Search</button>${params.q ? `<a class="button button-quiet" href="${href({ view: 'database', entity: 'keywords' })}">Clear</a>` : ''}</form>
    <div class="catalog-workspace ${record || params.create ? 'has-detail' : ''}">${renderList(page, params)}${pane}</div>`;
}

export function wireKeywords() {
  const form = document.querySelector('[data-keyword-form]');
  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form), status = form.querySelector('.form-status'), button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = form.dataset.create === 'true' ? 'Creating…' : 'Saving…';
    try {
      const params = currentParams();
      const saved = await request(form.dataset.create === 'true' ? '/catalog/keywords' : recordPath('keywords', params.id), {
        method: form.dataset.create === 'true' ? 'POST' : 'PATCH', body: { name: values.get('name'), effect: values.get('effect') }, version: form.dataset.version || undefined
      });
      location.assign(href(route(params, { id: saved.item.id, create: '', edit: '', saved: form.dataset.create === 'true' ? '' : '1', created: form.dataset.create === 'true' ? '1' : '' })));
    } catch (error) {
      status.textContent = error instanceof ApiError && error.status === 409 ? 'A keyword with that name already exists, or this record changed in another session.' : error.message;
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-delete-keyword-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]'), status = form.querySelector('.form-status');
    button.disabled = true;
    status.textContent = 'Deleting…';
    try {
      await request(recordPath('keywords', form.dataset.id), { method: 'DELETE', body: {}, version: form.dataset.version });
      location.assign(href({ view: 'database', entity: 'keywords', saved: 'deleted' }));
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  }));
}
