import { queryPath, request } from '../lib/api.js';
import { esc } from '../lib/dom.js';

export function classPicker({ selectedId = '', selectedName = '', required = false, fieldName = 'classId', label = 'Class' } = {}) {
  return `<div class="class-picker" data-class-picker data-required="${required}">
    <label class="form-field"><span>${esc(label)} ${required ? '<i aria-hidden="true">· required</i>' : '<i aria-hidden="true">· optional</i>'}</span>
      <input type="search" data-class-search value="${esc(selectedName)}" placeholder="Type a class name…" autocomplete="off" aria-autocomplete="list" aria-controls="class-picker-results">
      <input type="hidden" name="${esc(fieldName)}" data-class-id value="${esc(selectedId)}">
      <small data-class-selection>${selectedName ? `Selected: ${esc(selectedName)}` : 'Choose a class to link this record.'}</small>
    </label><div class="class-picker-results" id="class-picker-results" role="listbox" hidden></div><p class="class-picker-status" role="status" aria-live="polite"></p>
  </div>`;
}

export function wireClassPicker(root = document) {
  for (const picker of root.querySelectorAll('[data-class-picker]')) {
    const input = picker.querySelector('[data-class-search]');
    const hidden = picker.querySelector('[data-class-id]');
    const results = picker.querySelector('.class-picker-results');
    const status = picker.querySelector('.class-picker-status');
    const selection = picker.querySelector('[data-class-selection]');
    let timer;
    let controller;

    input.addEventListener('input', () => {
      hidden.value = '';
      selection.textContent = picker.dataset.required === 'true' ? 'Select a class to continue.' : 'No class selected.';
      results.hidden = true;
      results.replaceChildren();
      clearTimeout(timer);
      controller?.abort();
      const term = input.value.trim();
      if (term.length < 2) { status.textContent = term ? 'Type at least two characters.' : ''; return; }
      timer = setTimeout(async () => {
        controller = new AbortController();
        status.textContent = 'Searching classes…';
        try {
          const payload = await request(queryPath('classes', { q: term, limit: 8 }), { signal: controller.signal });
          if (input.value.trim() !== term) return;
          if (!payload.items.length) {
            status.textContent = 'No matching classes.';
            return;
          }
          results.innerHTML = payload.items.map(item => `<button type="button" class="class-picker-result" role="option" aria-selected="false" data-class-option="${esc(item.id)}" data-class-name="${esc(item.name)}"><strong>${esc(item.name || '?')}</strong><small>${esc(item.tier)} · ${esc(item.slot)}</small></button>`).join('');
          results.hidden = false;
          status.textContent = `${payload.items.length} matching classes.`;
        } catch (error) {
          if (error.name !== 'AbortError') status.textContent = error.message;
        }
      }, 180);
    });

    results.addEventListener('click', event => {
      const option = event.target.closest('[data-class-option]');
      if (!option) return;
      hidden.value = option.dataset.classOption;
      input.value = option.dataset.className;
      selection.textContent = `Selected: ${option.dataset.className}`;
      results.hidden = true;
      status.textContent = '';
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { results.hidden = true; status.textContent = ''; }
      if (event.key === 'ArrowDown' && !results.hidden) { event.preventDefault(); results.querySelector('button')?.focus(); }
    });
    results.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); results.hidden = true; input.focus(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        const options = [...results.querySelectorAll('button')];
        const current = options.indexOf(document.activeElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(0, Math.min(options.length - 1, current + step));
        event.preventDefault();
        options[next]?.focus();
      }
    });
  }
}
