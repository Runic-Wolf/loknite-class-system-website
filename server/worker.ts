import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { z } from 'zod';
import gateway from './gateway';
import type { Identity, LcsBindings } from './bindings';
import { handleApi } from './api.js';
import { handleMedia } from './serve-media.js';
import { createDatabase, createObjectStore, migrate } from './sqlite.js';
import { readJson } from './http.js';
import { writeAudit } from './audit.js';

type VaultServices = {
  storage: DurableObjectStorage;
  DB: ReturnType<typeof createDatabase>;
  OBJECTS: ReturnType<typeof createObjectStore>;
};

const identitySchema = z.object({
  email: z.string().email(),
  admin: z.boolean(),
  local: z.boolean(),
  provider: z.literal('team').optional(),
});

function createVaultRouter(services: VaultServices) {
  const app = new Hono();
  const identityFor = (request: Request): Identity | null => {
    let rawIdentity: unknown;
    try {
      rawIdentity = JSON.parse(request.headers.get('X-LCS-Identity') ?? 'null');
    } catch {
      rawIdentity = null;
    }
    const parsedIdentity = identitySchema.safeParse(rawIdentity);
    return parsedIdentity.success ? parsedIdentity.data : null;
  };

  app.post('/audit/session', async context => {
    const identity = identityFor(context.req.raw);
    if (!identity) return context.text('Acesso negado.', 403);
    if (context.req.header('Content-Type')?.split(';')[0] !== 'application/json') {
      return context.body(null, 415);
    }
    const body = await readJson(context.req.raw, 1024);
    if (!body || typeof body !== 'object' || !['login', 'logout'].includes(body.action)) {
      return context.body(null, 422);
    }
    services.storage.transactionSync(() => writeAudit(services.storage.sql, {
      actor: identity.email,
      action: body.action,
      resource: 'session',
      resourceName: 'Team session',
      details: {},
      createdAt: new Date().toISOString(),
    }));
    return context.json({ recorded: true }, 200, { 'Cache-Control': 'no-store' });
  });

  app.on(['GET', 'HEAD'], '/media/*', async context => {
    if (!identityFor(context.req.raw)) return context.text('Acesso negado.', 403);
    try {
      const segments = new URL(context.req.url).pathname.slice(1).split('/').map(decodeURIComponent);
      return handleMedia({ env: services, params: { path: segments.slice(1) } });
    } catch (error) {
      if (error instanceof URIError) return context.text('URL inválida.', 400);
      throw error;
    }
  });

  app.all('/api/v1/*', async context => {
    const identity = identityFor(context.req.raw);
    if (!identity) return context.text('Acesso negado.', 403);
    const pathname = new URL(context.req.url).pathname;
    try {
      const path = pathname.slice('/api/v1/'.length).split('/').map(decodeURIComponent);
      return handleApi({
        request: context.req.raw,
        env: services,
        data: { identity },
        params: { path },
      });
    } catch (error) {
      if (error instanceof URIError) return context.text('URL inválida.', 400);
      throw error;
    }
  });

  app.notFound(context => context.text('Página indisponível.', 404));
  app.onError(error => {
    console.error('LCS Vault request failed.', error);
    return new Response('O Vault não conseguiu concluir a solicitação.', { status: 500 });
  });
  return app;
}

export default {
  async fetch(request: Request, env: LcsBindings, executionCtx: ExecutionContext): Promise<Response> {
    return await gateway.fetch(request, env, executionCtx);
  },
};

export class LokniteVault extends DurableObject<LcsBindings> {
  private readonly router: ReturnType<typeof createVaultRouter>;

  constructor(ctx: DurableObjectState, env: LcsBindings) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrate(ctx.storage));
    const services: VaultServices = {
      storage: ctx.storage,
      DB: createDatabase(ctx.storage),
      OBJECTS: createObjectStore(ctx.storage),
    };
    this.router = createVaultRouter(services);
  }

  async fetch(request: Request): Promise<Response> {
    return await this.router.fetch(request, {});
  }
}
