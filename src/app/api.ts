export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  version?: string;
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
};

export type MediaUpload = {
  path: string;
  sha256: string;
  size: number;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.version) headers.set('If-Match', options.version);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);

  let response: Response;
  try {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;
    response = await fetch(`/api/v1${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Connection interrupted. Your current work is still here; try again.', 0, 'NETWORK');
  }

  if (response.redirected) {
    throw new ApiError('Your team session expired. Sign in again to continue.', 401, 'SESSION_EXPIRED');
  }

  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const data = typeof payload === 'object' && payload !== null ? payload as { error?: unknown; code?: unknown } : {};
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'The request could not be completed. Try again.',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }
  return payload as T;
}

export async function uploadMedia(file: File): Promise<MediaUpload> {
  const headers = new Headers({ Accept: 'application/json', 'X-LCS-Client': 'web' });
  if (file.type) headers.set('Content-Type', file.type);

  let response: Response;
  try {
    response = await fetch('/api/v1/media', {
      method: 'POST',
      headers,
      body: file,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Connection interrupted. The image was not confirmed as uploaded; check the vault before retrying.', 0, 'NETWORK');
  }

  if (response.redirected) {
    throw new ApiError('Your team session expired. Sign in again to continue.', 401, 'SESSION_EXPIRED');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const data = typeof payload === 'object' && payload !== null ? payload as { error?: unknown; code?: unknown } : {};
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'The image could not be uploaded. Try again.',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }
  return payload as MediaUpload;
}

export function catalogPath(table: string, params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) if (item !== '') search.append(key, item);
    } else if (value !== undefined && String(value) !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return `/catalog/${table}${query ? `?${query}` : ''}`;
}

export function recordPath(table: string, id: string): string {
  return `/catalog/${table}/${encodeURIComponent(id)}`;
}
