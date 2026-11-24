import { mediaPath, sha256, sniffMedia } from './vault-domain.js';
import { HttpError } from './http.js';

const extensionMime = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'
};

export function createMedia({ DB: db, OBJECTS: objects }, official) {
  return {
    async metadata(paths) {
      const result = new Map();
      const missing = paths.filter(path => {
        if (!official[path]) return true;
        result.set(path, official[path]);
        return false;
      });
      if (missing.length) {
        const { results } = await db.prepare(`SELECT path, sha256, mime, size
          FROM media_objects WHERE path IN (SELECT value FROM json_each(?))`)
          .bind(JSON.stringify(missing)).all();
        for (const row of results) result.set(row.path, row);
      }
      return result;
    },

    async put(bytes, requestedPath) {
      const { mime, ext } = sniffMedia(bytes);
      const digest = sha256(bytes);
      const path = requestedPath ? mediaPath(requestedPath) : `media_vault/imported/${digest}.${ext}`;
      const wantedMime = extensionMime[path.split('.').at(-1).toLowerCase()];
      if (wantedMime !== mime) throw new HttpError(422, 'Extensão e conteúdo da mídia são diferentes.');
      if (official[path]) {
        if (official[path].sha256 !== digest) throw new HttpError(409, 'O arquivo difere da arte oficial empacotada.');
        return official[path];
      }

      const key = 'media/' + digest;
      await objects.put(key, bytes);
      await db.prepare(`INSERT INTO media_objects (path, sha256, mime, size)
        VALUES (?, ?, ?, ?) ON CONFLICT(path) DO NOTHING`).bind(path, digest, mime, bytes.length).run();
      const record = await db.prepare('SELECT sha256 FROM media_objects WHERE path = ?').bind(path).first();
      if (record.sha256 !== digest) throw new HttpError(409, 'Já existe outra mídia nesse caminho.');
      return { path, sha256: digest, size: bytes.length, mime };
    },

    async get(path) {
      const safe = mediaPath(path);
      if (!safe) return null;
      const metadata = await db.prepare('SELECT sha256, mime FROM media_objects WHERE path = ?').bind(safe).first();
      if (!metadata) return null;
      const object = await objects.get('media/' + metadata.sha256);
      if (!object) return null;
      return new Response(object.body, { headers: { 'Content-Type': metadata.mime, 'X-Content-Type-Options': 'nosniff' } });
    }
  };
}
