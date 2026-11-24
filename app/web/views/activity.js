import { esc, href } from '../lib/dom.js';

const fieldNames = {
  name: 'Name', concept: 'Concept', notes: 'Notes', tags: 'Tags', imagePath: 'Image',
  type: 'Type', element: 'Element', cost: 'Cost', ruleText: 'Rule text', flavourText: 'Flavour text',
  workflowStatus: 'Workflow status', category: 'Category', status: 'Status', kind: 'Kind',
  classId: 'Class', effect: 'Definition', record: 'Record', revision: 'Revision'
};

function actionLabel(event) {
  const words = {
    'create:class': 'Created class', 'update:class': 'Edited class', 'delete:class': 'Removed class',
    'create:card': 'Created card', 'update:card': 'Edited card', 'delete:card': 'Removed card',
    'confirm:card': 'Confirmed card', 'unconfirm:card': 'Reopened card',
    'create:skill': 'Created skill', 'update:skill': 'Edited skill', 'delete:skill': 'Removed skill',
    'create:keyword': 'Created keyword', 'update:keyword': 'Edited keyword', 'delete:keyword': 'Removed keyword',
    'export:workspace': 'Exported workspace', 'export:vault': 'Exported Vault', 'export:cardvault': 'Exported Card Vault',
    'create:backup': 'Created backup', 'login:session': 'Signed in', 'logout:session': 'Signed out'
  };
  if (event.action?.includes('import')) return 'Imported workspace';
  if (event.action?.includes('workspace')) return 'Saved from classic workspace';
  return words[`${event.action}:${event.resource}`] ?? `${event.action} ${event.resource ?? 'workspace'}`;
}

function targetMarkup(target) {
  const verb = target.operation === 'created' ? 'Created' : target.operation === 'deleted' ? 'Removed' : 'Edited';
  const fields = (target.fields ?? []).map(field => fieldNames[field] ?? field).join(', ');
  return `<li><strong>${verb} ${esc(target.resource)}:</strong> ${esc(target.name || target.id)}${fields ? `<span>${esc(fields)}</span>` : ''}</li>`;
}

function auditDetails(event) {
  const targets = event.details?.targets;
  if (Array.isArray(targets) && targets.length) return `<ul class="audit-targets">${targets.slice(0, 4).map(targetMarkup).join('')}</ul>${event.details.truncated ? `<small class="audit-more">+ ${event.details.truncated} more records in this transaction</small>` : ''}`;
  const fields = (event.changedFields ?? []).map(field => fieldNames[field] ?? field);
  const related = event.details?.related ?? [];
  return `${fields.length ? `<p class="audit-fields">Changed: ${fields.map(esc).join(', ')}</p>` : event.details?.legacy ? '<p class="audit-fields">Historical entry; field details were not recorded at the time.</p>' : ''}${related.map(item => `<p class="audit-fields">Linked card ${esc(item.operation)}: ${esc(item.name)}</p>`).join('')}`;
}

function formatWhen(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Unknown time';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function renderAuditEvents(items, { compact = false } = {}) {
  if (compact) items = items.slice(0, 3);
  if (!items.length) return `<div class="audit-empty"><span class="muted-copy">No activity recorded yet.</span></div>`;
  return `<ol class="audit-list ${compact ? 'is-compact' : ''}">${items.map(event => `<li class="audit-entry">
    <span class="audit-marker" aria-hidden="true"></span><div class="audit-entry-body">
      <div class="audit-entry-heading"><strong>${esc(actionLabel(event))}${event.resourceName ? ` · ${esc(event.resourceName)}` : ''}</strong><time datetime="${esc(event.createdAt)}">${esc(formatWhen(event.createdAt))}</time></div>
      <div class="audit-entry-meta"><span>${esc(event.actor)}</span>${event.revision ? `<span>Revision ${esc(event.revision)}</span>` : ''}</div>
      ${compact && event.details?.targets?.length > 0 ? '<p class="audit-fields">Record details open in the audit log.</p>' : auditDetails(event)}
    </div></li>`).join('')}</ol>`;
}

export function renderActivityPage(audit, params) {
  const actors = audit.actors ?? [];
  const actor = params.actor ?? '';
  const nextHref = audit.next ? href({ view: 'activity', actor, after: audit.next }) : '';
  return `<section class="page-heading"><div><span class="eyebrow">WORKSPACE HISTORY</span><h1>Activity</h1><p>Who changed which records, when, and what kind of change was saved.</p></div></section>
    ${actors.length > 1 ? `<form class="activity-filter" action="/" method="get"><input type="hidden" name="view" value="activity"><label>Team member<select name="actor"><option value="">Everyone</option>${actors.map(email => `<option value="${esc(email)}" ${actor === email ? 'selected' : ''}>${esc(email)}</option>`).join('')}</select></label><button class="button button-quiet" type="submit">Filter</button></form>` : ''}
    <section class="surface activity-panel"><div class="surface-heading"><div><span class="eyebrow">AUDIT LOG</span><h2>Latest changes <span class="count-pill">${audit.items.length}</span></h2></div><span class="surface-note">Events are committed with the database change</span></div>
      ${renderAuditEvents(audit.items)}${audit.next ? `<a class="next-page" href="${nextHref}">Older activity <span aria-hidden="true">→</span></a>` : ''}</section>`;
}

export function activityQuery(params) {
  const query = new URLSearchParams({ limit: params.limit ?? (params.after ? '30' : '12') });
  if (params.after) query.set('after', params.after);
  if (params.actor) query.set('actor', params.actor);
  return `/catalog/audit?${query}`;
}
