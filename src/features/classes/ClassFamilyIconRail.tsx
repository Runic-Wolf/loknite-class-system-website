import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { ClassLineageRoot } from './types';
import styles from './ClassFamilyIconRail.module.css';

export function ClassFamilyIconRail({ items, activeSlot, sectionLabel, navLabel, heading, instruction, linkLabel, hrefForRoot, appearance = 'panel' }: {
  items: ClassLineageRoot[];
  activeSlot: string | null;
  sectionLabel: string;
  navLabel: string;
  heading: string;
  instruction: string;
  linkLabel: (root: ClassLineageRoot) => string;
  hrefForRoot: (root: ClassLineageRoot) => string;
  appearance?: 'panel' | 'embedded';
}) {
  const roots = [...items].sort((a, b) => a.position !== undefined && b.position !== undefined
    ? a.position - b.position
    : a.slot.localeCompare(b.slot, undefined, { numeric: true }));
  const baseWidth = roots.length * 54 + Math.max(0, roots.length - 1) * 7;

  return <section className={styles.rail} data-appearance={appearance} aria-label={sectionLabel}>
    <header className={styles.heading}>
      <div><span className="eyebrow">CLASS FAMILIES</span><strong>{heading}</strong></div>
      <span>{instruction}</span>
    </header>
    <nav className={styles.track} aria-label={navLabel} style={{ '--family-base-width': `${baseWidth}px` } as CSSProperties}>
      {roots.map(root => {
        const active = root.slot === activeSlot;
        const name = root.name || 'Name in progress';
        return <Link
          className={styles.choice}
          data-active={active ? 'true' : undefined}
          aria-current={active ? 'page' : undefined}
          aria-label={linkLabel(root)}
          title={name}
          to={hrefForRoot(root)}
          key={root.id}
        >
          <span className={styles.choiceContent} aria-hidden="true">
            <span className={styles.icon}>{root.icon ? <img src={root.icon} alt="" width="38" height="38" loading="lazy" /> : <span>◇</span>}</span>
            <span className={styles.copy}><strong>{name}</strong></span>
          </span>
        </Link>;
      })}
    </nav>
  </section>;
}
