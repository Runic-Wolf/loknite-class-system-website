import { ApiError } from '../../app/api';
import type { DatabaseResource } from './DatabaseTable';

export async function requestCatalogCsv(
  resource: DatabaseResource,
  params: URLSearchParams,
  columns: string[],
): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams(params);
  query.delete('after');
  query.delete('limit');
  query.delete('column');
  for (const key of ['view', 'type', 'entity', 'id', 'create', 'edit']) query.delete(key);
  for (const column of columns) query.append('column', column);

  let response: Response;
  try {
    response = await fetch(`/api/v1/catalog/${resource}/export.csv?${query}`, {
      headers: { Accept: 'text/csv' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Connection interrupted. The CSV was not downloaded; try again.', 0, 'NETWORK');
  }

  if (response.redirected) throw new ApiError('Your team session expired. Sign in again to continue.', 401, 'SESSION_EXPIRED');
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const data = typeof payload === 'object' && payload !== null ? payload as { error?: unknown; code?: unknown } : {};
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'The CSV could not be prepared. Try again.',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }

  const filename = /filename="([A-Za-z0-9._-]+)"/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
    ?? `loknite-${resource}.csv`;
  return { blob: await response.blob(), filename };
}
