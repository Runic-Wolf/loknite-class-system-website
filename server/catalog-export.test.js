import { describe, expect, it } from 'vitest';
import { catalogCsvColumns, exportCatalogCsv, serializeCatalogCsv } from './catalog-export.js';

describe('catalog CSV serialization', () => {
  it('quotes commas, quotes and newlines and neutralizes spreadsheet formulas', () => {
    const csv = serializeCatalogCsv('keywords', [
      { name: '=HYPERLINK("https://example.invalid")', effect: 'first line, "quoted"\r\nsecond line' },
      { name: '  @SUM(1,2)', effect: '+3' },
    ], ['name', 'effect']);

    expect(csv).toBe('\uFEFF"Keyword","Definition"\r\n"\'=HYPERLINK(""https://example.invalid"")","first line, ""quoted""\r\nsecond line"\r\n"\'  @SUM(1,2)","\'+3"\r\n');
  });

  it('keeps the record name and rejects duplicate or unknown columns', () => {
    expect(catalogCsvColumns('cards', [])).toEqual(['name', 'category', 'type', 'element', 'cost', 'status', 'ownerName', 'tags']);
    expect(() => catalogCsvColumns('cards', ['category'])).toThrow('identificação');
    expect(() => catalogCsvColumns('cards', ['name', 'name'])).toThrow('inválidas');
    expect(() => catalogCsvColumns('cards', ['name', 'id'])).toThrow('inválidas');
  });

  it('rejects an over-limit export rather than returning a partial file', () => {
    const sql = {
      exec(_statement, limit) {
        return { toArray: () => Array.from({ length: limit }, (_, index) => ({ id: `keyword-${index}`, name: `Keyword ${index}`, effect: 'Definition' })) };
      },
    };

    expect(() => exportCatalogCsv(sql, 'keywords', new URLSearchParams())).toThrow('O CSV excede o limite');
  });
});
