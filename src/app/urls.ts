export function hrefWithParams(current: URLSearchParams, values: Record<string, string | null | undefined>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/?${query}` : '/';
}

export function withoutRecordParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of ['id', 'focus', 'edit', 'saved', 'error']) next.delete(key);
  return next;
}
