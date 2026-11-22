export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function readBytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413, 'Arquivo acima do limite.');
  if (!request.body) throw new HttpError(400, 'Envie o conteúdo da solicitação.');
  const reader = request.body.getReader();
  let size = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'Arquivo acima do limite.');
    }
    parts.push(value);
  }
  return Buffer.concat(parts, size);
}

export async function readJson(request, limit = 24 * 1024 * 1024) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'Envie application/json.');
  }
  const bytes = await readBytes(request, limit);
  try {
    return JSON.parse(bytes.toString('utf8'), (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('unsafe key');
      return value;
    });
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function revisionFor(request) {
  const value = request.headers.get('If-Match');
  const match = /^"(\d+)"$/.exec(value ?? '');
  const revision = Number(match?.[1]);
  if (!Number.isSafeInteger(revision)) throw new HttpError(428, 'Informe a revisão de origem em If-Match.');
  return revision;
}
