import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api';
import { WorkspaceIcon as Icon } from './WorkspaceIcon';
import type { Session } from '../features/classes/types';
import styles from './app.module.css';

const ClassMatrixPage = lazy(() => import('../features/classes/ClassMatrixPage').then(module => ({ default: module.ClassMatrixPage })));
const OverviewPage = lazy(() => import('../features/overview/OverviewPage').then(module => ({ default: module.OverviewPage })));
const CardsPage = lazy(() => import('../features/cards/CardsPage').then(module => ({ default: module.CardsPage })));
const ActivityPage = lazy(() => import('../features/activity/ActivityPage').then(module => ({ default: module.ActivityPage })));
const SkillsPage = lazy(() => import('../features/skills/SkillsPage').then(module => ({ default: module.SkillsPage })));
const KeywordsPage = lazy(() => import('../features/keywords/KeywordsPage').then(module => ({ default: module.KeywordsPage })));
const DatabasePage = lazy(() => import('../features/database/DatabasePage').then(module => ({ default: module.DatabasePage })));
const MaintenancePage = lazy(() => import('../features/maintenance/MaintenancePage').then(module => ({ default: module.MaintenancePage })));

const navigation = [
  { view: 'overview', label: 'Dashboard', icon: 'overview' },
  { view: 'classes', label: 'Class Matrix', icon: 'classes' },
  { view: 'database', label: 'Database', icon: 'database' },
  { view: 'cards', label: 'Card Gallery', icon: 'cards' },
  { view: 'keywords', label: 'Keyword List', icon: 'keywords' },
  { view: 'activity', label: 'Activity', icon: 'activity' },
  { view: 'settings', label: 'Data & backups', icon: 'cloudSync' },
] as const;

const themeOptions = [
  { id: 'classic', label: 'Lok’nite navy' },
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'ember', label: 'Ember' },
] as const;

function routeFor(view: string): string {
  const params = new URLSearchParams();
  params.set('view', view);
  return `/?${params}`;
}

function LoadingWorkspace() {
  return <main className={styles.boot} role="status"><img src="/branding/runic-wolf-emblema-branco.svg" alt="" width="48" height="48" /><span>Opening the private workspace…</span></main>;
}

function LoadingPageChunk() {
  return <div className={styles.pageLoading} aria-busy="true"><p role="status">Opening this workspace section…</p><span /><span /><span /></div>;
}

function AccessFailure({ onRetry }: { onRetry: () => void }) {
  return <main className={styles.accessFailure}>
    <span className="eyebrow">LOK’NITE CLASS STUDIO</span>
    <h1>Workspace unavailable</h1>
    <p>Your session may have expired, or the service may be reconnecting.</p>
    <button className="button button-primary" type="button" onClick={onRetry}>Try again</button>
    <a href="/auth">Sign in</a>
  </main>;
}

function LegacyModule({ label }: { label: string }) {
  return <section className={styles.legacyModule}>
    <span className="eyebrow">MIGRATION IN PROGRESS</span>
    <h1>{label}</h1>
    <p>This module is still available in the current workspace while its React version is being rebuilt.</p>
    <a className="button button-primary" href="/classic/">Open current workspace <span aria-hidden="true">↗</span></a>
  </section>;
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('lcs-theme');
      return themeOptions.some(option => option.id === stored) ? stored! : 'classic';
    } catch {
      return 'classic';
    }
  });

  useEffect(() => {
    const selected = themeOptions.find(option => option.id === theme)?.id ?? 'classic';
    document.documentElement.dataset.theme = selected;
    const color = { classic: '#07131d', obsidian: '#111315', ember: '#17120f' }[selected] ?? '#07131d';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    try { localStorage.setItem('lcs-theme', selected); } catch { /* Theme still applies for this page session. */ }
  }, [theme]);

  return [theme, setTheme] as const;
}

function AppShell({ session }: { session: Session }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigationHovered, setNavigationHovered] = useState(false);
  const [navigationPinned, setNavigationPinned] = useState(false);
  const navigationExpanded = navigationHovered || navigationPinned;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [theme, setTheme] = useTheme();
  const view = searchParams.get('view') || 'overview';
  const accountEmail = typeof session.email === 'string' ? session.email : '';
  const displayName = accountEmail.split('@')[0] || 'Team member';
  const initial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [location.key]);

  function navigationLinks(mobile = false) {
    return navigation.map(item => <NavLink
      key={item.view}
      to={routeFor(item.view)}
      aria-label={mobile ? undefined : item.label}
      title={!mobile && !navigationExpanded ? item.label : undefined}
      aria-current={view === item.view ? 'page' : undefined}
      onClick={mobile ? () => setMenuOpen(false) : undefined}
      className={({ isActive }) => `${styles.navLink}${view === item.view && isActive ? ` ${styles.active}` : ''}`}
    >
      <span className={styles.navMark}><Icon name={item.icon} /></span>
      <span className={styles.navText} aria-hidden={mobile ? undefined : true}>{item.label}</span>
    </NavLink>);
  }

  const content = <Suspense fallback={<LoadingPageChunk />}>{view === 'overview'
    ? <OverviewPage />
    : view === 'classes'
      ? <ClassMatrixPage session={session} />
      : view === 'cards'
        ? <CardsPage />
      : view === 'activity'
        ? <ActivityPage session={session} />
      : view === 'database'
        ? searchParams.get('entity') === 'skills' ? <SkillsPage /> : <DatabasePage />
      : view === 'keywords'
        ? <KeywordsPage />
      : view === 'settings'
        ? <MaintenancePage session={session} />
      : <LegacyModule label={navigation.find(item => item.view === view)?.label ?? 'Workspace'} />}</Suspense>;

  return <div className={styles.shell} data-nav-expanded={navigationExpanded ? 'true' : 'false'}>
    <a className={styles.skipLink} href="#main">Skip to content</a>
    <aside
      id="desktop-workspace-sidebar"
      className={styles.sidebar}
      data-expanded={navigationExpanded ? 'true' : 'false'}
      aria-label="Main navigation"
      onPointerEnter={event => { if (event.pointerType !== 'touch') setNavigationHovered(true); }}
      onPointerLeave={event => {
        if (event.pointerType === 'touch') return;
        setNavigationHovered(false);
        if (!(document.activeElement instanceof HTMLElement && document.activeElement.matches(':focus-visible'))) setNavigationPinned(false);
      }}
      onFocusCapture={event => { if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) setNavigationPinned(true); }}
      onBlurCapture={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setNavigationPinned(false); }}
    >
      <Link className={styles.brand} to={routeFor('overview')}>
        <img src="/branding/runic-wolf-emblema-branco.svg" alt="" width="42" height="42" />
        <span className={styles.brandCopy}><strong>LOK’NITE</strong><small>CLASS STUDIO</small></span>
      </Link>
      <span className={styles.navCaption}>GAME DESIGN</span>
      <nav id="workspace-primary-navigation" className={styles.primaryNav} aria-label="Workspace">{navigationLinks()}</nav>
      <div className={styles.sidebarBottom}>
        <label className={styles.themeControl}>
          <span><Icon name="settings" />Appearance</span>
          <select aria-label="Color theme" value={theme} onChange={event => setTheme(event.currentTarget.value)}>
            {themeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <a className={styles.classicLink} href="/classic/">Current workspace <span aria-hidden="true">↗</span></a>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{initial}</span>
          <span className={styles.accountCopy}><strong>{displayName}</strong><small>{session.admin ? 'Administrator' : 'Team member'}</small></span>
          {!session.local && <form action="/auth/logout" method="post"><button className={styles.logout} aria-label="Sign out" title="Sign out" type="submit">↗</button></form>}
        </div>
        <button className={styles.sidebarToggle} type="button" aria-controls="workspace-primary-navigation" aria-expanded={navigationExpanded} aria-label={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'} title={navigationExpanded ? 'Collapse navigation' : 'Expand navigation'} onClick={() => setNavigationPinned(value => !value)}>
          <span className={styles.sidebarToggleMark}><Icon name="menu" /></span>
          <span className={styles.navText} aria-hidden="true">More</span>
        </button>
      </div>
    </aside>

    <div className={styles.mainColumn}>
      <header className={styles.mobileHeader}>
        <Link className={styles.brand} to={routeFor('overview')}>
          <img src="/branding/runic-wolf-emblema-branco.svg" alt="" width="36" height="36" />
          <span><strong>LOK’NITE</strong><small>CLASS STUDIO</small></span>
        </Link>
        <button className={styles.menuButton} type="button" aria-controls="mobile-workspace-menu" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(value => !value)}>
          <span className={styles.menuGlyph} aria-hidden="true"><i /><i /><i /></span>
        </button>
      </header>
      <dialog ref={dialogRef} id="mobile-workspace-menu" className={styles.mobileDialog} onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
        <div className={styles.mobileMenuHead}>
          <span className={styles.navCaption}>WORKSPACE</span>
          <button className={styles.closeButton} type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
        </div>
        <nav id="mobile-workspace-primary-navigation" className={styles.mobileNav} aria-label="Workspace">{navigationLinks(true)}</nav>
        <label className={styles.themeControl}>
          <span><Icon name="settings" />Appearance</span>
          <select aria-label="Color theme" value={theme} onChange={event => setTheme(event.currentTarget.value)}>
            {themeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <a className={styles.classicLink} href="/classic/">Current workspace <span aria-hidden="true">↗</span></a>
        {!session.local && <form action="/auth/logout" method="post"><button className={styles.mobileLogout} type="submit">Sign out <span aria-hidden="true">↗</span></button></form>}
        <p className={styles.mobileMember}>{accountEmail || 'Team member'} · {session.admin ? 'Administrator' : 'Team member'}</p>
      </dialog>

      <main id="main" className={styles.pageContent}>
        {content}
      </main>
      <footer className={styles.footer}><span>LOK’NITE CLASS STUDIO</span><i aria-hidden="true">·</i><span>Private design workspace</span></footer>
    </div>
  </div>;
}

export function App() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => apiRequest<Session>('/session', { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (session.isPending) return <LoadingWorkspace />;
  if (session.isError || !session.data) return <AccessFailure onRetry={() => void session.refetch()} />;
  return <AppShell session={session.data} />;
}
