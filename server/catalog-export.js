import { HttpError } from './http.js';
import { listRecords, settingsFor } from './catalog-read.js';

const maxExportRows = 10000;

const csvColumns = {
  classes: { name: 'Class', tier: 'Tier', slot: 'Slot', concept: 'Concept', tags: 'Direct tags' },
  cards: { name: 'Card', category: 'Category', type: 'Type', element: 'Element', cost: 'Cost', status: 'Status', ownerName: 'Class', tags: 'Tags' },
  skills: { name: 'Skill', kind: 'Kind', className: 'Class', slot: 'Slot', tags: 'Tags' },
  keywords: { name: 'Keyword', effect: 'Definition' },
};

const queryKeys = {
  classes: ['q', 'sort', 'dir', 'tier', 'parent', 'id', 'lineage', 'tag', 'tagSource', 'where'],
  cards: ['q', 'sort', 'dir', 'category', 'status', 'type', 'cost', 'element', 'owner', 'origin', 'family', 'classId', 'tier', 'group', 'tag', 'tagSource'],
  skills: ['q', 'sort', 'dir', 'kind', 'class', 'where', 'tag', 'tagSource'],
  keywords: ['q', 'sort', 'dir'],
};

export function catalogCsvColumns(table, requested) {
  const labels = csvColumns[table];
  if (!labels || !settingsFor(table)) throw new HttpError(404, 'Tipo de registro indisponível para exportação.');
  if (!requested.length) return Object.keys(labels);
  if (requested.length > Object.keys(labels).length
    || new Set(requested).size !== requested.length
    || requested.some(key => !Object.hasOwn(labels, key))) {
    throw new HttpError(422, 'As colunas selecionadas para o CSV são inválidas.');
  }
  if (!requested.includes('name')) throw new HttpError(422, 'A coluna de identificação precisa estar no CSV.');
  return requested;
}

export function serializeCatalogCsv(table, rows, columns) {
  const labels = csvColumns[table];
  if (!labels || !columns.length || columns.some(key => !Object.hasOwn(labels, key))) {
    throw new HttpError(422, 'As colunas selecionadas para o CSV são inválidas.');
  }
  const lines = [columns.map(key => csvCell(labels[key])).join(',')];
  for (const row of rows) {
    lines.push(columns.map(key => csvCell(row[key])).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function csvCell(value) {
  let text = Array.isArray(value)
    ? value.filter(entry => typeof entry === 'string').join('; ')
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
  if (/^[\u0000-\u0020\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function exportCatalogCsv(sql, table, sourceParams, { now = new Date() } = {}) {
  if (!settingsFor(table) || !csvColumns[table]) throw new HttpError(404, 'Tipo de registro indisponível para exportação.');
  const allowedKeys = new Set([...queryKeys[table], 'column', 'after', 'limit']);
  for (const key of sourceParams.keys()) {
    if (!allowedKeys.has(key)) throw new HttpError(422, `Filtro de exportação indisponível: ${key}.`);
  }

  const columns = catalogCsvColumns(table, sourceParams.getAll('column'));
  const query = new URLSearchParams(sourceParams);
  query.delete('column');
  query.delete('after');
  query.delete('limit');
  query.set('limit', String(maxExportRows));

  const result = listRecords(sql, table, query, { maxLimit: maxExportRows });
  if (result.next) throw new HttpError(413, `O CSV excede o limite de ${maxExportRows.toLocaleString('en-US')} registros. Aplique mais filtros e tente novamente.`, 'CSV_EXPORT_LIMIT');

  const date = now.toISOString().slice(0, 10);
  return new Response(serializeCatalogCsv(table, result.items, columns), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="loknite-${table}-${date}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
