import { applyChanges } from '../app/workspace-changes.js';
import { createVaultService, VaultError } from './vault-domain.js';
import { handleCatalog } from './catalog-api.js';
import { createRepository } from './repository.js';
import { createMedia } from './media.js';
import { HttpError, json, readBytes, readJson, revisionFor } from './http.js';
import catalog from './catalog.generated.json';
import { writeAudit } from './audit.js';

const mediaLimit = 12 * 1024 * 1024;
const mutationRoutes = new Set(['cards/confirm', 'cards/unconfirm', 'cards/delete', 'skills/delete', 'backups/restore', 'import/legacy']);

function requireAdmin(identity) {
  if (!identity.admin) throw new HttpError(403, 'Esta operação é reservada à administração do Vault.');
}

function parseId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value)) throw new HttpError(422, 'Identificador inválido.');
  return value;
}

export async function handleApi({ request, env, data, params }) {
  const route = params.path?.join('/') ?? '';
  const { method } = request;
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (!['GET', 'HEAD'].includes(method) && ((origin && origin !== url.origin) ||
      (site && !['same-origin', 'none'].includes(site)) || (!origin && !request.headers.has('X-LCS-Client')))) {
    return json({ error: 'Origem da solicitação inválida.' }, 403);
  }

  try {
    if (params.path?.[0] === 'catalog') {
      return await handleCatalog({ request, storage: env.storage, identity: data.identity, path: params.path.slice(1) });
    }
    const versioned = (route === 'workspace' && method === 'PATCH') || (method === 'POST' && mutationRoutes.has(route));
    const media = createMedia(env, catalog.metadata);
    const repository = createRepository(env, data.identity.email, method + ' ' + route, versioned ? revisionFor(request) : undefined);
    const service = createVaultService({ repository, media });

    if (method === 'GET') {
      switch (route) {
        case 'health': {
          const migration = await env.DB.prepare('SELECT MAX(version) AS version FROM schema_migrations').first();
          if (!migration?.version) throw new HttpError(503, 'O banco ainda não está pronto.');
          return json({ status: 'ok', database: 'ready', schemaVersion: migration.version });
        }
        case 'session':
          return json(data.identity);
        case 'assets':
          return json(catalog.palette);
        case 'workspace': {
          const snapshot = await service.load();
          if (snapshot.state === 'empty') throw new HttpError(409, 'O Vault ainda não foi importado.');
          return json(snapshot);
        }
        case 'backups':
          requireAdmin(data.identity);
          return json(await repository.backups());
        case 'exports':
        case 'exports/vault':
        case 'exports/cardvault': {
          const pair = await repository.read();
          if (!pair) throw new HttpError(404, 'Vault indisponível.');
          const type = route.split('/')[1];
          const response = json(type ? pair[type] : pair);
          env.storage.transactionSync(() => writeAudit(env.storage.sql, {
            revision: pair.vault.revision, actor: data.identity.email, action: 'export', resource: type ?? 'workspace',
            resourceName: type ? `Export ${type}` : 'Workspace export',
            details: { format: type ?? 'pair' }
          }));
          response.headers.set('Content-Disposition', 'attachment; filename="' + (type ?? 'loknite-export') + '.json"');
          return response;
        }
      }
    }

    if (method === 'PATCH' && route === 'workspace') {
      const patch = await readJson(request);
      const current = await service.load();
      if (current.state !== 'ready') throw new HttpError(409, 'Importe o Vault antes de editar.');
      let legacy;
      try {
        legacy = applyChanges(current.legacy, patch);
      } catch (error) {
        throw new HttpError(422, error.message);
      }
      if (!Array.isArray(legacy?.classes) || !Array.isArray(legacy?.skills) || legacy.skills.length > 5000) {
        throw new HttpError(422, 'Estrutura de classes e skills inválida.');
      }
      return json(await service.saveLegacy(legacy));
    }

    if (method === 'PUT' && route.startsWith('import/media/')) {
      requireAdmin(data.identity);
      if (await env.DB.prepare('SELECT id FROM workspace WHERE id = 1').first()) {
        throw new HttpError(409, 'O Vault já foi importado.');
      }
      return json(await media.put(await readBytes(request, mediaLimit), params.path.slice(2).join('/')), 201);
    }

    if (method === 'POST') {
      switch (route) {
        case 'import/legacy':
          requireAdmin(data.identity);
          return json(await service.saveLegacy(await readJson(request)));
        case 'import/workspace': {
          requireAdmin(data.identity);
          const pair = await readJson(request);
          return json(await service.importPair(pair?.vault, pair?.cardvault), 201);
        }
        case 'media':
          return json(await service.importMedia(await readBytes(request, mediaLimit)), 201);
        case 'cards/confirm':
        case 'cards/unconfirm': {
          const { id } = await readJson(request, 4096);
          return json(await (route === 'cards/confirm' ? service.confirm(parseId(id)) : service.unconfirm(parseId(id))));
        }
        case 'cards/delete': {
          const { ids } = await readJson(request, 65536);
          if (!Array.isArray(ids) || !ids.length || ids.length > 315) throw new HttpError(422, 'Selecione até 315 cartas.');
          return json(await service.deleteCards(ids.map(parseId)));
        }
        case 'skills/delete': {
          const { id, disposition } = await readJson(request, 4096);
          if (!['keep-card', 'delete-card'].includes(disposition)) throw new HttpError(422, 'Escolha o destino da carta vinculada.');
          return json(await service.deleteSkill(parseId(id), disposition));
        }
        case 'backups':
          requireAdmin(data.identity);
          return json(await service.exportBackup(), 201);
        case 'backups/restore': {
          requireAdmin(data.identity);
          const { id } = await readJson(request, 4096);
          return json(await service.recover(parseId(id)));
        }
      }
    }
    return json({ error: 'Rota desconhecida.' }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
    if (error instanceof VaultError) {
      const status = ['REVISION_CONFLICT', 'VAULT_EXISTS'].includes(error.code) ? 409 : 422;
      return json({ error: error.message, code: error.code }, status);
    }
    console.error('LCS API failed', method, route, error?.stack ?? error);
    return json({ error: 'O servidor não conseguiu concluir a operação.' }, 500);
  }
}
