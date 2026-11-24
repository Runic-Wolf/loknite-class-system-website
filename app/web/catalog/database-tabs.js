import { href } from '../lib/dom.js';

const tabs = [
  { key: '', label: 'All records', href: { view: 'database' } },
  { key: 'classes', label: 'Classes', href: { view: 'classes' } },
  { key: 'cards', label: 'Cards', href: { view: 'database', entity: 'cards' } },
  { key: 'skills', label: 'Skills', href: { view: 'database', entity: 'skills' } },
  { key: 'keywords', label: 'Keywords', href: { view: 'database', entity: 'keywords' } }
];

export function renderDatabaseTabs(params) {
  const current = params.view === 'classes' ? 'classes' : params.entity ?? '';
  return `<nav class="database-tabs" aria-label="Database sections">${tabs.map(tab => `<a href="${href(tab.href)}" ${current === tab.key ? 'aria-current="page"' : ''}>${tab.label}</a>`).join('')}</nav>`;
}
