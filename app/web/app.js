import { request } from './lib/api.js';
import { currentParams, esc, href, notice } from './lib/dom.js';
import { renderClasses, wireClassEditor } from './catalog/classes.js';
import { renderShell, wireShellMenu, navigation } from './shell.js';
import { activityQuery, renderActivityPage } from './views/activity.js';
import { renderOverview } from './views/overview.js';
import { renderSettings, wireSettings } from './views/settings.js';
import { renderCards, wireCards } from './views/cards.js';
import { renderSkills, wireSkills } from './views/skills.js';
import { renderKeywords, wireKeywords } from './views/keywords.js';
import { renderDatabase } from './views/database.js';

function renderPlaceholder(view) {
  const item = navigation.find(entry => entry.view === view);
  const title = item?.name ?? 'Workspace';
  return `<section class="page-heading"><div><span class="eyebrow">LOK’NITE <span aria-hidden="true">/</span> WORKSPACE</span><h1>${esc(title)}</h1>
    <p>This module is being moved onto the new catalogue API.</p></div></section>
    <section class="surface module-handoff"><div class="handoff-mark" aria-hidden="true">↗</div><div><h2>Continue in the current workspace</h2><p>Your existing editing tools remain available while this module is rebuilt.</p><a class="button button-primary" href="/classic/">Open classic workspace</a></div></section>`;
}

function renderFatal(error) {
  return `<main class="fatal-state"><span class="eyebrow">WORKSPACE UNAVAILABLE</span><h1>We couldn’t open the catalogue</h1>
    ${notice(error?.message ?? 'Reload the page to try again.', 'error')}<a class="button button-primary" href="/">Reload workspace</a></main>`;
}

async function renderContent(view, params, session) {
  if (view === 'overview') {
    const [data, audit] = await Promise.all([
      request('/catalog/overview'), request(activityQuery({ limit: '6' }))
    ]);
    return renderOverview(data, audit);
  }
  if (view === 'classes') {
    const catalog = await request('/catalog/overview');
    return renderClasses(params, session, catalog);
  }
  if (view === 'activity') return renderActivityPage(await request(activityQuery(params)), params);
  if (view === 'settings') return renderSettings();
  if (view === 'cards') return renderCards(params, session);
  if (view === 'keywords') return renderKeywords(params);
  if (view === 'database') {
    if (params.entity === 'cards') return renderCards(params, session);
    if (params.entity === 'skills') return renderSkills(params);
    if (params.entity === 'keywords') return renderKeywords(params);
    if (params.entity === 'classes') return renderClasses({ ...params, view: 'classes' }, session, await request('/catalog/overview'));
    return renderDatabase(params);
  }
  return renderPlaceholder(view);
}

async function start() {
  const root = document.querySelector('#app');
  const params = currentParams();
  const view = params.view || 'overview';
  try {
    const session = await request('/session');
    const content = await renderContent(view, params, session);
    root.innerHTML = renderShell(session, view, content);
    wireShellMenu();
    root.setAttribute('aria-busy', 'false');
    wireClassEditor();
    wireSettings();
    wireCards();
    wireSkills();
    wireKeywords();
  } catch (error) {
    root.innerHTML = renderFatal(error);
    root.setAttribute('aria-busy', 'false');
  }
}

start();
