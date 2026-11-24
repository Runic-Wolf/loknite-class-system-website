import { esc, href } from './lib/dom.js';

export const navigation = [
  { view: 'overview', name: 'Dashboard' },
  { view: 'classes', name: 'Class Matrix' },
  { view: 'database', name: 'Database' },
  { view: 'cards', name: 'Card Gallery' },
  { view: 'keywords', name: 'Keyword List' },
  { view: 'activity', name: 'Activity' }
];

const icons = {
  overview: '<path d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-12h6V4h-6v4Z"/>',
  classes: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 6H15.5M6 8.5V16a2 2 0 0 0 2 2h7.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  cards: '<rect x="5" y="4" width="13" height="16" rx="2"/><path d="M8 2h10a2 2 0 0 1 2 2v13M8 9h7M8 13h7M8 17h4"/>',
  keywords: '<path d="M20.5 13.5 13 21l-10-10V3h8l9.5 9.5a.7.7 0 0 1 0 1Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1 1.5 1.2-1.5 2.6-1.8-.7a8 8 0 0 1-1.5.9l-.3 1.9h-3l-.4-1.9a8 8 0 0 1-1.5-.9l-1.8.7-1.5-2.6 1.5-1.2a8 8 0 0 1 0-1.8l-1.5-1.2 1.5-2.6 1.8.7a8 8 0 0 1 1.5-.9l.4-1.9h3l.3 1.9a8 8 0 0 1 1.5.9l1.8-.7 1.5 2.6-1.5 1.2a8 8 0 0 1-.1 1.7Z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
};

function icon(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function renderNavigation(view) {
  return navigation.map(item => `<a class="nav-link" href="${href({ view: item.view })}" ${view === item.view ? 'aria-current="page"' : ''}>
    <span class="nav-mark">${icon(item.view)}</span><span>${item.name}</span>
  </a>`).join('');
}

function logoutForm(session, label = 'Sign out', mobile = false) {
  if (session.local) return '';
  return mobile
    ? `<form action="/auth/logout" method="post"><button class="mobile-utility-link mobile-logout" type="submit">${icon('logout')}<span>${label}</span></button></form>`
    : '<form action="/auth/logout" method="post"><button class="account-exit" type="submit" aria-label="Sign out" title="Sign out">↗</button></form>';
}

export function renderShell(session, view, content, busy = false) {
  const initials = (session.email?.split('@')[0] || 'L').slice(0, 1).toUpperCase();
  const memberName = session.email?.split('@')[0] ?? 'Member';
  return `<aside class="sidebar" aria-label="Main navigation">
    <a class="brand" href="${href({ view: 'overview' })}"><img src="/branding/LCS.png" alt="" width="40" height="40"><span><strong>LOK’NITE</strong><small>CLASS STUDIO</small></span></a>
    <div class="sidebar-label">GAME DESIGN</div><nav class="primary-nav" aria-label="Workspace">${renderNavigation(view)}</nav>
    <div class="sidebar-bottom"><a class="settings-link" href="${href({ view: 'settings' })}" ${view === 'settings' ? 'aria-current="page"' : ''}><span class="nav-mark">${icon('settings')}</span>Appearance settings</a><a class="classic-link" href="/classic/">Classic workspace ${icon('external')}</a>
      <div class="account-card"><span class="account-avatar">${esc(initials)}</span><span class="account-copy"><strong>${esc(memberName)}</strong><small>${session.admin ? 'Administrator' : 'Team member'}</small></span>${logoutForm(session)}</div>
    </div>
  </aside>
  <div class="app-main"><header class="mobile-header"><a class="brand" href="${href({ view: 'overview' })}"><img src="/branding/LCS.png" alt="" width="34" height="34"><span><strong>LOK’NITE</strong><small>CLASS STUDIO</small></span></a><button class="menu-toggle" type="button" popovertarget="mobile-primary-navigation" popovertargetaction="toggle" aria-controls="mobile-primary-navigation" aria-expanded="false" aria-label="Open navigation" data-mobile-nav-trigger><span class="sr-only">Open navigation</span><span class="menu-toggle-icon" aria-hidden="true"><i></i><i></i><i></i></span></button>
    <nav id="mobile-primary-navigation" class="mobile-nav" aria-label="Main navigation" popover="auto">
      <div class="mobile-nav-account"><span class="account-avatar">${esc(initials)}</span><span><strong>${esc(memberName)}</strong><small>${session.admin ? 'Administrator' : 'Team member'}</small></span></div>
      <div class="mobile-nav-links">${renderNavigation(view)}</div>
      <div class="mobile-nav-utilities"><a class="mobile-utility-link" href="${href({ view: 'settings' })}" ${view === 'settings' ? 'aria-current="page"' : ''}>${icon('settings')}<span>Appearance settings</span></a><a class="mobile-utility-link" href="/classic/">${icon('external')}<span>Classic workspace</span></a>${logoutForm(session, 'Sign out', true)}</div>
    </nav></header>
    <main id="main" class="page-content" aria-busy="${busy}">${content}</main>
    <footer class="app-footer"><span>LOK’NITE CLASS STUDIO</span><span>PRIVATE WORKSPACE <i aria-hidden="true">·</i> ${session.local ? 'LOCAL QA' : 'TEAM ACCESS'}</span></footer>
  </div>`;
}

export function wireShellMenu() {
  const trigger = document.querySelector('[data-mobile-nav-trigger]');
  const menu = document.querySelector('#mobile-primary-navigation');
  if (!trigger || !menu) return;
  menu.addEventListener('toggle', () => {
    const expanded = menu.matches(':popover-open');
    trigger.setAttribute('aria-expanded', String(expanded));
    trigger.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
    trigger.querySelector('.sr-only').textContent = expanded ? 'Close navigation' : 'Open navigation';
  });
}
