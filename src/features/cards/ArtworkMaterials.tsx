import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './artwork-materials.module.css';

export function ArtworkMaterials({ gold, prism, reactive }: {
  gold: string | null;
  prism: string | null;
  reactive: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = surface.current;
    const face = element?.closest<HTMLElement>('[data-layout]');
    if (!element || !face || !reactive) return;
    const layers = element;
    const card = face;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let point = { x: .28, y: .22 };

    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        layers.style.setProperty('--light-x', `${(point.x * 100).toFixed(2)}%`);
        layers.style.setProperty('--light-y', `${(point.y * 100).toFixed(2)}%`);
        layers.style.setProperty('--light-angle', `${110 + (point.x - .5) * 110 + (point.y - .5) * 45}deg`);
      });
    }
    function move(event: PointerEvent) {
      if (reduced.matches || event.pointerType === 'touch') return;
      const { left, top, width, height } = card.getBoundingClientRect();
      if (!width || !height) return;
      point = { x: (event.clientX - left) / width, y: (event.clientY - top) / height };
      schedule();
    }
    function reset() {
      point = { x: .28, y: .22 };
      schedule();
    }
    card.addEventListener('pointermove', move, { passive: true });
    card.addEventListener('pointerleave', reset);
    reduced.addEventListener('change', reset);
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', reset);
      reduced.removeEventListener('change', reset);
    };
  }, [reactive]);

  return <div className={styles.surface} ref={surface} aria-hidden="true">
    {prism && <span className={styles.prism} style={{ '--material-mask': `url("${prism}")` } as CSSProperties} />}
    {gold && <span className={styles.gold} style={{ '--material-mask': `url("${gold}")` } as CSSProperties} />}
  </div>;
}
