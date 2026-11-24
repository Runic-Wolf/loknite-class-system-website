import { defaultSceneLayer } from '../../../shared/card-scene.js';
import { uploadMedia } from '../../app/api';

export type SceneLayer = 'back' | 'smoke' | 'mid' | 'front';

export type SceneLayerSettings = {
  x: number;
  y: number;
  zoom: number;
  opacity: number;
  depth: number;
  visible: boolean;
};

export type SceneSettings = Partial<Record<SceneLayer, SceneLayerSettings>>;
export type SceneSources = Record<SceneLayer, string | null>;

export const sceneLayers = [
  { id: 'back', field: 'sceneBackPath', label: 'Background', hint: 'The complete background behind the other layers.' },
  { id: 'smoke', field: 'sceneSmokePath', label: 'Smoke and atmosphere', hint: 'Optional transparent layer behind the subjects.' },
  { id: 'mid', field: 'sceneMidPath', label: 'Subjects', hint: 'Characters and other midground elements.' },
  { id: 'front', field: 'sceneFrontPath', label: 'Foreground', hint: 'Elements closest to the viewer.' },
] as const;

export function sceneMediaUrl(path: string | null | undefined) {
  return path ? '/media/' + path.split('/').map(encodeURIComponent).join('/') : null;
}

export async function uploadScenePoster(sources: SceneSources, settings: SceneSettings) {
  const planes = await Promise.all(sceneLayers.map(async ({ id, label }) => {
    const source = sources[id];
    const layer = settings[id] ?? defaultSceneLayer(id);
    if (!source || !layer.visible || !layer.opacity) return null;
    const image = new Image();
    image.src = source;
    try {
      await image.decode();
    } catch {
      throw new Error(`Could not load the ${label.toLowerCase()} image. Check its path before saving.`);
    }
    return { image, layer };
  }));

  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize the scene poster.');
  for (const plane of planes) {
    if (!plane) continue;
    const { image, layer } = plane;
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * layer.zoom / 100;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.globalAlpha = layer.opacity / 100;
    ctx.drawImage(image, (canvas.width - width) / 2 + canvas.width * layer.x / 100,
      (canvas.height - height) / 2 + canvas.height * layer.y / 100, width, height);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not generate the scene poster.')), 'image/webp', 0.92);
  });
  const result = await uploadMedia(new File([blob], 'scene-poster.webp', { type: blob.type }));
  return result.path;
}
