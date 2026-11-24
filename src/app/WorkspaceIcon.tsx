import type { CSSProperties, ReactNode } from 'react';
import styles from './app.module.css';

type WorkspaceIconName = 'overview' | 'classes' | 'database' | 'cards' | 'keywords' | 'activity' | 'settings' | 'cloudSync' | 'menu' | 'close';

const iconAssets: Partial<Record<WorkspaceIconName, string>> = {
  overview: '/icons/dashboard-gap-consistente.svg',
  classes: '/icons/espada-flecha.svg',
  database: '/icons/database-svgrepo-com.svg',
  cards: '/icons/cardgame-three-monochrome.svg',
  keywords: '/icons/keyword-chave-unificada.svg',
  cloudSync: '/icons/cloud-sync.png',
};

const utilityShapes: Partial<Record<WorkspaceIconName, ReactNode>> = {
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1 1.5 1.2-1.5 2.6-1.8-.7a8 8 0 0 1-1.5.9l-.3 1.9h-3l-.4-1.9a8 8 0 0 1-1.5-.9l-1.8.7-1.5-2.6 1.5-1.2a8 8 0 0 1 0-1.8l-1.5-1.2 1.5-2.6 1.8.7a8 8 0 0 1 1.5-.9l.4-1.9h3l.3 1.9a8 8 0 0 1 1.5.9l1.8-.7 1.5 2.6-1.5 1.2a8 8 0 0 1-.1 1.7Z" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  const asset = iconAssets[name];
  if (asset) return <span className={styles.maskIcon} style={{ '--icon-mask-source': `url("${asset}")` } as CSSProperties} aria-hidden="true" />;
  return <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{utilityShapes[name] ?? null}</svg>;
}
