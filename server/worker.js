import { DurableObject } from 'cloudflare:workers';
import gateway from './gateway.js';
import { handleApi } from './api.js';
import { handleMedia } from './serve-media.js';
import { createDatabase, createObjectStore, migrate } from './sqlite.js';

export default gateway;

export class LokniteVault extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrate(ctx.storage));
    this.services = { DB: createDatabase(ctx.storage), OBJECTS: createObjectStore(ctx.storage) };
  }

  async fetch(request) {
    const identity = JSON.parse(request.headers.get('X-LCS-Identity') ?? 'null');
    if (!identity) return new Response('Acesso negado.', { status: 403 });
    const pathname = new URL(request.url).pathname;
    const env = this.services;
    try {
      const segments = pathname.slice(1).split('/').map(decodeURIComponent);
      if (segments[0] === 'media' && ['GET', 'HEAD'].includes(request.method)) {
        return handleMedia({ env, params: { path: segments.slice(1) } });
      }
      if (segments[0] === 'api' && segments[1] === 'v1') {
        return handleApi({ request, env, data: { identity }, params: { path: segments.slice(2) } });
      }
    } catch (error) {
      if (error instanceof URIError) return new Response('URL inválida.', { status: 400 });
      throw error;
    }
    return new Response('Página indisponível.', { status: 404 });
  }
}
