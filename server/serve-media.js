import { createMedia } from './media.js';
import catalog from './catalog.generated.json';

export async function handleMedia({ env, params }) {
  try {
    const path = params.path.join('/');
    return await createMedia(env, catalog.metadata).get(path) ?? new Response('Mídia não encontrada.', { status: 404 });
  } catch (error) {
    if (error.code === 'INVALID_MEDIA_PATH') return new Response('Mídia não encontrada.', { status: 404 });
    throw error;
  }
}
