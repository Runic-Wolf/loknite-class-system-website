import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { getAuditEvents } from './api';
import type { AuditEvent } from './api';
import type { Session } from '../classes/types';
import { apiErrorMessage } from '../../ui/feedback';
import styles from './activity.module.css';

const actionLabels: Record<string, string> = {
  create: 'Created', update: 'Updated', delete: 'Deleted', confirm: 'Confirmed', unconfirm: 'Reopened',
  login: 'Signed in', logout: 'Signed out', export: 'Exported', backup: 'Created backup', restore: 'Restored backup', 'post import/workspace': 'Imported',
};

const fieldLabels: Record<string, string> = {
  name: 'name', concept: 'concept', notes: 'notes', ruleText: 'rule text', flavourText: 'flavour text',
  tags: 'tags', kind: 'skill kind', classId: 'class', category: 'category', cost: 'cost', element: 'element',
  effect: 'effect', imagePath: 'image', artPath: 'artwork', status: 'status', type: 'type', lcsNotes: 'studio notes',
  mobileNotes: 'mobile notes', cardId: 'linked card', source: 'source', slot: 'slot', official: 'official status',
};

export function ActivityPage({ session }: { session: Session }) {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const audit = useQuery({
    queryKey: ['catalog', 'audit', query],
    queryFn: ({ signal }) => getAuditEvents(new URLSearchParams(query), signal),
    placeholderData: previous => previous,
  });

  return <section className={styles.page}>
    <header className={styles.pageHeading}>
      <div><span className="eyebrow">WORKSPACE HISTORY <span aria-hidden="true">/</span> AUDIT</span><h1>Activity</h1><p>Changes and access events recorded for this workspace.</p></div>
      {session.admin && audit.data?.actors && audit.data.actors.length > 1 && <label className={styles.actorFilter}><span>Person</span><select aria-label="Filter by person" value={params.get('actor') ?? ''} onChange={event => setParams(current => {
        const next = new URLSearchParams(current);
        if (event.currentTarget.value) next.set('actor', event.currentTarget.value); else next.delete('actor');
        next.delete('after');
        return next;
      })}><option value="">Everyone</option>{audit.data.actors.map(actor => <option value={actor} key={actor}>{actor}</option>)}</select></label>}
    </header>
    {audit.isPending ? <ActivitySkeleton /> : audit.isError ? <section className={styles.errorState} role="alert"><h2>Activity unavailable</h2><p>{apiErrorMessage(audit.error)}</p><button className="button button-primary" type="button" onClick={() => void audit.refetch()}>Retry activity</button></section> : audit.data.items.length === 0 ? <section className={styles.emptyState}><span className="eyebrow">NO EVENTS YET</span><h2>Changes will appear here</h2><p>Edits, exports and sign-ins will be recorded with the person and time.</p></section> : <>
      <div className={styles.eventList} aria-label="Workspace activity" aria-busy={audit.isFetching}>
        {audit.data.items.map(event => <ActivityItem event={event} currentEmail={session.email} key={event.id} />)}
      </div>
      {audit.data.next && <Link className={styles.nextPage} to={`/?view=activity&${new URLSearchParams({ ...(params.get('actor') ? { actor: params.get('actor')! } : {}), after: audit.data.next })}`}>Older activity <span aria-hidden="true">→</span></Link>}
      <p className={styles.privacyNote}>{session.admin ? 'You can review the team history.' : 'You can review activity recorded for your account.'}</p>
    </>}
  </section>;
}

function ActivityItem({ event, currentEmail }: { event: AuditEvent; currentEmail: string }) {
  const description = event.resourceName || event.resourceId || event.resource || 'workspace';
  const action = actionLabels[event.action.toLowerCase()] ?? event.action;
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.createdAt));
  return <article className={styles.event}>
    <span className={styles.eventMark} aria-hidden="true">{event.resource === 'session' ? '◉' : event.action === 'delete' ? '−' : event.action === 'export' ? '↓' : '✦'}</span>
    <div className={styles.eventCopy}>
      <header><p><strong>{event.actor === currentEmail ? 'You' : event.actor}</strong> {action.toLowerCase()} <strong>{description}</strong></p><time dateTime={event.createdAt}>{date}</time></header>
      <div className={styles.eventMeta}>
        {event.resource && event.resource !== 'session' && <span>{event.resource}</span>}
        {event.revision !== null && <span>Revision {event.revision}</span>}
        {event.changedFields.length > 0 && <span>{event.changedFields.map(field => fieldLabels[field] ?? field).join(', ')}</span>}
        {typeof event.details.format === 'string' && <span>{event.details.format} export</span>}
        {Array.isArray(event.details.related) && event.details.related.length > 0 && <span>{event.details.related.length} linked change{event.details.related.length === 1 ? '' : 's'}</span>}
      </div>
      {event.resourceId && <small className={styles.eventId}>{event.resourceId}</small>}
    </div>
  </article>;
}

function ActivitySkeleton() {
  return <section className={styles.eventList} aria-busy="true"><p className="sr-only" role="status">Loading recent activity</p><div className={styles.skeletonList} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <div className={styles.skeletonEvent} key={index}><i /><span><b /><small /><small /></span></div>)}</div></section>;
}
