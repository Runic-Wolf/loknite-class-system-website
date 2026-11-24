export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function tagsText(tags) {
  return (tags ?? []).join(', ');
}

export function parseTags(value) {
  return [...new Set(String(value ?? '').split(',').map(tag => tag.trim()).filter(Boolean))];
}

export function href(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  }
  return `/?${query}`;
}

export function htmlAttr(value) {
  return esc(value).replace(/\n/g, '&#10;');
}

export function field(label, name, value, { multiline = false, max = 4000, hint = '' } = {}) {
  const control = multiline
    ? `<textarea id="field-${esc(name)}" name="${esc(name)}" maxlength="${max}" rows="${name === 'notes' ? 7 : 3}">${esc(value)}</textarea>`
    : `<input id="field-${esc(name)}" name="${esc(name)}" maxlength="${max}" value="${htmlAttr(value)}">`;
  return `<label class="form-field" for="field-${esc(name)}"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}

export function selectField(label, name, value, options, { hint = '' } = {}) {
  return `<label class="form-field" for="field-${esc(name)}"><span>${esc(label)}</span><select id="field-${esc(name)}" name="${esc(name)}">${options.map(option => {
    const [optionValue, title] = Array.isArray(option) ? option : [option.value, option.label];
    return `<option value="${esc(optionValue)}" ${value === optionValue ? 'selected' : ''}>${esc(title)}</option>`;
  }).join('')}</select>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}

export function notice(message, kind = 'info') {
  return message ? `<p class="notice notice-${esc(kind)}" role="${kind === 'error' ? 'alert' : 'status'}">${esc(message)}</p>` : '';
}

export function currentParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}
