const collections = ['classes', 'skills', 'galleryCards', 'keywords', 'links', 'presets'];
const reserved = new Set([...collections, 'schemaVersion']);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createChanges(previous, next) {
  const changes = {};
  for (const name of collections) {
    const before = previous[name] ?? [];
    const after = next[name] ?? [];
    const old = new Map(before.map(record => [record.id, record]));
    const put = [];
    for (const record of after) {
      if (!same(old.get(record.id), record)) put.push(record);
      old.delete(record.id);
    }
    const remove = [...old.keys()];
    const beforeOrder = before.map(record => record.id);
    const afterOrder = after.map(record => record.id);
    if (put.length || remove.length || !same(beforeOrder, afterOrder)) {
      changes[name] = { put, remove };
      if (!same(beforeOrder, afterOrder)) changes[name].order = afterOrder;
    }
  }
  const settings = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
    !reserved.has(key) && !same(previous[key], value)));
  return { changes, settings };
}

export function applyChanges(previous, patch) {
  if (!patch || Array.isArray(patch) || typeof patch.changes !== 'object' || patch.changes === null ||
      typeof patch.settings !== 'object' || patch.settings === null || Array.isArray(patch.settings)) {
    throw new TypeError('Envie alterações organizadas por coleção.');
  }
  const next = { ...previous };
  for (const [name, change] of Object.entries(patch.changes)) {
    if (!collections.includes(name) || !change || !Array.isArray(change.put) || !Array.isArray(change.remove)) {
      throw new TypeError('Coleção inválida.');
    }
    const records = new Map((next[name] ?? []).map(record => [record.id, record]));
    for (const id of change.remove) {
      if (typeof id !== 'string') throw new TypeError('ID inválido.');
      records.delete(id);
    }
    for (const record of change.put) {
      if (typeof record?.id !== 'string') throw new TypeError('Cada registro precisa de um ID.');
      records.set(record.id, record);
    }
    if (change.order !== undefined) {
      if (!Array.isArray(change.order) || new Set(change.order).size !== records.size ||
          change.order.length !== records.size || change.order.some(id => !records.has(id))) {
        throw new TypeError('Ordem da coleção inválida.');
      }
      next[name] = change.order.map(id => records.get(id));
    } else {
      next[name] = [...records.values()];
    }
  }
  for (const [key, value] of Object.entries(patch.settings)) {
    if (reserved.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('Configuração inválida.');
    next[key] = value;
  }
  return next;
}
