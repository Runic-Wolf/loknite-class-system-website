const prefix = '/api/v1';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function queryPath(table, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  }
  return `/catalog/${table}${query.size ? `?${query}` : ''}`;
}

export async function request(path, { method = 'GET', body, version, signal, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json';
  if (version) headers['If-Match'] = version;
  const response = await fetch(prefix + path, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal
  });
  if (response.redirected) throw new ApiError('Sua sessão expirou. Entre novamente para continuar.', 401);
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'Não foi possível concluir a solicitação.', response.status, payload?.code);
  }
  return payload;
}

export function recordPath(table, id) {
  return `/catalog/${table}/${encodeURIComponent(id)}`;
}
