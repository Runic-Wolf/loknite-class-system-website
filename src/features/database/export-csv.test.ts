import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestCatalogCsv } from './export-csv';

afterEach(() => vi.unstubAllGlobals());

describe('database CSV request', () => {
  it('preserves the filtered sort, exports visible columns and ignores the current page cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('"Card"\r\n"A card"\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="loknite-cards-2026-11-23.csv"' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const params = new URLSearchParams('view=database&type=cards&q=fire&sort=name&dir=desc&after=page-two&limit=24');
    const result = await requestCatalogCsv('cards', params, ['name', 'type']);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestQuery = new URL(url, 'https://loknite.invalid').searchParams;
    expect(url).toContain('/api/v1/catalog/cards/export.csv?');
    expect(requestQuery.get('q')).toBe('fire');
    expect(requestQuery.get('sort')).toBe('name');
    expect(requestQuery.get('dir')).toBe('desc');
    expect(requestQuery.getAll('column')).toEqual(['name', 'type']);
    expect(requestQuery.has('after')).toBe(false);
    expect(requestQuery.has('limit')).toBe(false);
    expect(requestQuery.has('view')).toBe(false);
    expect(requestQuery.has('entity')).toBe(false);
    expect(requestQuery.get('type')).toBeNull();
    expect(init.credentials).toBe('same-origin');
    expect(result.filename).toBe('loknite-cards-2026-11-23.csv');
    expect(await result.blob.text()).toContain('"A card"');
  });
});
