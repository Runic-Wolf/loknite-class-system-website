export const sceneLayerPaths = {
  back: 'sceneBackPath',
  smoke: 'sceneSmokePath',
  mid: 'sceneMidPath',
  front: 'sceneFrontPath',
};

export const sceneLayerBounds = {
  x: [-50, 50],
  y: [-50, 50],
  zoom: [50, 200],
  opacity: [0, 100],
  depth: [-500, 500],
};

const depths = { back: 0, smoke: 75, mid: 160, front: 340 };

export function defaultSceneLayer(layer) {
  return { x: 0, y: 0, zoom: 100, opacity: 100, depth: depths[layer], visible: true };
}

export function validSceneSettings(settings) {
  if (settings == null) return true;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  return Object.entries(settings).every(([layer, values]) => {
    if (!Object.hasOwn(sceneLayerPaths, layer) || !values || typeof values !== 'object' || Array.isArray(values)) return false;
    if (typeof values.visible !== 'boolean' || Object.keys(values).length !== 6) return false;
    return Object.entries(sceneLayerBounds).every(([key, [min, max]]) =>
      Number.isInteger(values[key]) && values[key] >= min && values[key] <= max);
  });
}
