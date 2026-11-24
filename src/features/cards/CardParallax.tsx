import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { defaultSceneLayer } from '../../../shared/card-scene.js';
import { sceneLayers, type SceneLayer, type SceneSettings } from './card-scene';
import styles from './card-parallax.module.css';

export function CardParallax({ back, mid, front, smoke, settings, selectedLayer, motionPreview = false, preview = false }: {
  back: string;
  mid: string;
  front: string;
  smoke: string | null;
  preview?: boolean;
  motionPreview?: boolean;
  settings?: SceneSettings | null | undefined;
  selectedLayer?: SceneLayer | null | undefined;
}) {
  const [ready, setReady] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = stage.current;
    const card = element?.closest<HTMLElement>('[data-layout]');
    if (!element || !card) return;
    const surface = element;
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (any-pointer: fine)');
    let frame = 0;
    let revision = 0;

    async function prepare() {
      const attempt = ++revision;
      reset();
      setReady(false);
      if (!preview && !motion.matches) return;
      try {
        await Promise.all([back, mid, front, smoke].filter(Boolean).map(async url => {
          const image = new Image();
          image.src = url!;
          await image.decode();
        }));
        if (attempt === revision) setReady(true);
      } catch {
        // The static poster stays visible when any layer is unavailable.
      }
    }
    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      surface.style.removeProperty('--scene-x');
      surface.style.removeProperty('--scene-y');
    }
    function point(event: PointerEvent) {
      if ((preview && !motionPreview) || !motion.matches || event.pointerType === 'touch' || !card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = card.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const normalize = (position: number, start: number, size: number) => Math.min(1, Math.max(-1, (position - start) / size * 2 - 1));
        surface.style.setProperty('--scene-x', String(normalize(event.clientX, bounds.left, bounds.width)));
        surface.style.setProperty('--scene-y', String(normalize(event.clientY, bounds.top, bounds.height)));
      });
    }
    void prepare();
    motion.addEventListener('change', prepare);
    card.addEventListener('pointermove', point, { passive: true });
    card.addEventListener('pointerleave', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      revision += 1;
      reset();
      motion.removeEventListener('change', prepare);
      card.removeEventListener('pointermove', point);
      card.removeEventListener('pointerleave', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [back, mid, front, smoke, preview, motionPreview]);

  const sources = { back, smoke, mid, front };
  return <div className={styles.stage} ref={stage} data-parallax data-ready={ready} aria-hidden="true">
    {ready && sceneLayers.map(({ id }) => {
      const layer = settings?.[id] ?? defaultSceneLayer(id);
      const source = sources[id];
      if (!source || !layer.visible) return null;
      const style = {
        '--layer-x': `${layer.x}%`,
        '--layer-y': `${layer.y}%`,
        '--layer-scale': layer.zoom / 100,
        '--travel-x': `${layer.depth / 100}%`,
        '--travel-y': `${layer.depth / 200}%`,
        opacity: layer.opacity / 100,
      } as CSSProperties;
      return <img key={id} data-scene-layer={id} data-selected-layer={selectedLayer === id} style={style} src={source} alt="" />;
    })}
  </div>;
}
