import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../app/api';
import { getOverview } from '../classes/api';
import type { Session } from '../classes/types';
import { apiErrorMessage } from '../../ui/feedback';
import styles from './maintenance.module.css';

type Backup = { id: string; revision: number; createdAt: string; valid: number };
type CreatedBackup = { id: string; revision: number; createdAt: string };

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function MaintenancePage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const overview = useQuery({ queryKey: ['catalog', 'overview'], queryFn: ({ signal }) => getOverview(signal) });
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: ({ signal }) => apiRequest<Backup[]>('/backups', { signal }),
    enabled: session.admin,
  });
  const createBackup = useMutation({
    mutationFn: () => apiRequest<CreatedBackup>('/backups', { method: 'POST', body: {} }),
    onSuccess: async backup => {
      setError(''); setFeedback(`Backup created from revision ${backup.revision}.`);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['backups'] }), queryClient.invalidateQueries({ queryKey: ['catalog', 'audit'] })]);
    },
    onError: failure => { setFeedback(''); setError(apiErrorMessage(failure)); },
  });
  const restoreBackup = useMutation({
    mutationFn: async (backup: Backup) => {
      if (!overview.data) throw new Error('Workspace revision is still loading.');
      return apiRequest('/backups/restore', { method: 'POST', body: { id: backup.id }, version: `"${overview.data.head.revision}"` });
    },
    onSuccess: async (_result, backup) => {
      setSelectedBackup(null); setError(''); setFeedback(`Restored backup revision ${backup.revision}. The recovered workspace is now a new revision.`);
      await queryClient.invalidateQueries();
    },
    onError: failure => { setFeedback(''); setError(apiErrorMessage(failure)); },
  });

  return <section className={styles.page}>
    <header className={styles.pageHeading}><div><span className="eyebrow">WORKSPACE <span aria-hidden="true">/</span> MAINTENANCE</span><h1>Data & access</h1><p>Export content, make an admin backup, or review the account used for this session.</p></div></header>
    {feedback && <p className={styles.successNotice} role="status">{feedback}</p>}
    {error && <p className={styles.errorNotice} role="alert">{error}</p>}
    <section className={styles.panel} aria-labelledby="session-title"><header><div><span className="eyebrow">CURRENT SESSION</span><h2 id="session-title">Team access</h2></div><span className={styles.roleBadge}>{session.admin ? 'Administrator' : 'Team member'}</span></header><div className={styles.sessionInfo}><span className={styles.avatar} aria-hidden="true">{session.email.slice(0, 1).toUpperCase()}</span><div><strong>{session.email}</strong><small>{session.local ? 'Local development session' : 'Authenticated team session'}</small></div>{!session.local && <form action="/auth/logout" method="post"><button className="button button-quiet" type="submit">Sign out</button></form>}</div></section>
    <section className={styles.panel} aria-labelledby="exports-title"><header><div><span className="eyebrow">PORTABLE FILES</span><h2 id="exports-title">Export workspace data</h2></div></header><p className={styles.panelDescription}>Download the JSON pair used by the desktop tool. These exports are recorded in Activity.</p><div className={styles.exportLinks}><a className={styles.exportCard} href="/api/v1/exports"><span><strong>Complete pair</strong><small>Vault + Cardvault JSON</small></span><b aria-hidden="true">↓</b></a><a className={styles.exportCard} href="/api/v1/exports/vault"><span><strong>Vault</strong><small>Classes, skills, links and settings</small></span><b aria-hidden="true">↓</b></a><a className={styles.exportCard} href="/api/v1/exports/cardvault"><span><strong>Cardvault</strong><small>Cards and keyword definitions</small></span><b aria-hidden="true">↓</b></a></div></section>
    <section className={styles.panel} aria-labelledby="backups-title"><header><div><span className="eyebrow">ADMIN ONLY</span><h2 id="backups-title">Backups</h2></div>{session.admin && <button className="button button-primary" type="button" disabled={createBackup.isPending} onClick={() => { setFeedback(''); setError(''); createBackup.mutate(); }}>{createBackup.isPending ? 'Creating…' : 'Create backup'}</button>}</header>{!session.admin ? <p className={styles.panelDescription}>Backups and restore are available to administrators. You can still download workspace exports above.</p> : backups.isPending ? <BackupSkeleton /> : backups.isError ? <div className={styles.backupError} role="alert"><p>{apiErrorMessage(backups.error)}</p><button className="button button-quiet" type="button" onClick={() => void backups.refetch()}>Retry backup list</button></div> : backups.data?.length ? <ul className={styles.backupList}>{backups.data.map(backup => <li key={backup.id}><div><strong>Revision {backup.revision}</strong><small>{dateLabel(backup.createdAt)} <i aria-hidden="true">·</i> {backup.valid ? 'Available to restore' : 'Unavailable'}</small></div><button className="button button-quiet" type="button" disabled={!backup.valid || restoreBackup.isPending} onClick={() => { setError(''); setFeedback(''); setSelectedBackup(backup); }}>Restore…</button></li>)}</ul> : <div className={styles.emptyState}><strong>No backups yet</strong><p>Create a snapshot before a large import or data restore.</p></div>}</section>
    {selectedBackup && <RestoreDialog backup={selectedBackup} pending={restoreBackup.isPending || !overview.data} onCancel={() => setSelectedBackup(null)} onConfirm={() => restoreBackup.mutate(selectedBackup)} />}
    <p className={styles.revisionNote}>{overview.data ? `Workspace revision ${overview.data.head.revision} · ${overview.data.counts.classes} classes · ${overview.data.counts.cards} cards` : 'Loading current workspace revision…'}{overview.isError ? ` · ${apiErrorMessage(overview.error)}` : ''}</p>
  </section>;
}

function BackupSkeleton() {
  return <div className={styles.backupSkeleton} aria-busy="true"><p className="sr-only" role="status">Loading backups</p>{Array.from({ length: 3 }, (_, index) => <span key={index}><i /><b /><small /></span>)}</div>;
}

function RestoreDialog({ backup, pending, onCancel, onConfirm }: { backup: Backup; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, []);
  return <dialog ref={dialog} className={styles.confirmDialog} aria-labelledby="restore-title" aria-describedby="restore-description" onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }} onClick={event => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <span className="eyebrow">ADMIN RESTORE</span><h2 id="restore-title">Replace the current workspace?</h2><p id="restore-description">This restores the backup from {dateLabel(backup.createdAt)} (revision {backup.revision}). Current classes, cards, skills and keywords will be replaced. Create a backup first if you may need the current state.</p><div><button className="button button-quiet" type="button" autoFocus disabled={pending} onClick={onCancel}>Cancel</button><button className="button button-danger" type="button" disabled={pending} onClick={onConfirm}>{pending ? 'Restoring…' : 'Restore backup'}</button></div>
  </dialog>;
}
