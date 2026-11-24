import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassQuery } from '../../../shared/class-query.js';
import { apiErrorMessage } from '../../ui/feedback';
import { createSavedQuery, deleteSavedQuery, getSavedQueries } from './api';
import styles from './saved-queries.module.css';

const queryKey = ['catalog', 'presets'] as const;

function hasEnabledRules(query: ClassQuery): boolean {
  return query.rules.some(rule => rule.enabled) || Boolean(query.scope && hasEnabledRules(query.scope));
}

export function SavedQueries({ query, onApply }: { query: ClassQuery; onApply: (query: ClassQuery) => void }) {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey, queryFn: ({ signal }) => getSavedQueries(signal) });
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const createAttempt = useRef<{ signature: string; id: string } | null>(null);
  const create = useMutation({ mutationFn: createSavedQuery });
  const remove = useMutation({ mutationFn: ({ id, version }: { id: string; version: string }) => deleteSavedQuery(id, version) });
  const selected = saved.data?.items.find(item => item.id === selectedId);
  const canSave = hasEnabledRules(query) && Boolean(name.trim()) && !create.isPending;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName || !hasEnabledRules(query)) return;
    const signature = JSON.stringify({ name: normalizedName, query });
    if (createAttempt.current?.signature !== signature) {
      createAttempt.current = { signature, id: `preset-${crypto.randomUUID()}` };
    }
    try {
      const result = await create.mutateAsync({ id: createAttempt.current.id, name: normalizedName, query });
      createAttempt.current = null;
      setName('');
      setSelectedId(result.item.id);
      await queryClient.invalidateQueries({ queryKey });
    } catch {}
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete the shared query “${selected.name}”?`)) return;
    try {
      await remove.mutateAsync({ id: selected.id, version: selected.version });
      setSelectedId('');
      await queryClient.invalidateQueries({ queryKey });
    } catch {}
  }

  return <section className={styles.panel} aria-label="Shared saved queries">
    <header className={styles.heading}><div><span className="eyebrow">TEAM WORKSPACE</span><h2>Saved queries</h2></div><span>{saved.data?.items.length ?? '—'} / 35</span></header>
    <div className={styles.applyRow} aria-busy={saved.isPending}>
      <label><span className="sr-only">Apply a saved query</span><select aria-label="Apply a saved query" value={selectedId} disabled={saved.isPending || saved.isError} onChange={event => {
        const id = event.currentTarget.value;
        setSelectedId(id);
        const item = saved.data?.items.find(candidate => candidate.id === id);
        if (item?.query) onApply(item.query);
      }}>
        <option value="">Choose a saved team query</option>
        {saved.data?.items.map(item => <option value={item.id} key={item.id} disabled={!item.query}>{item.name}{item.query ? '' : ' · unavailable'}</option>)}
      </select></label>
      <button className="button button-quiet" type="button" disabled={!selected || remove.isPending} onClick={() => void deleteSelected()}>{remove.isPending ? 'Deleting…' : 'Delete selected'}</button>
    </div>
    {saved.isPending && <p className={styles.status} role="status">Loading shared queries…</p>}
    {saved.isError && <p className={styles.error} role="alert">{apiErrorMessage(saved.error)} <button className="button button-quiet" type="button" onClick={() => void saved.refetch()}>Retry</button></p>}
    {selected?.query && JSON.stringify(selected.query) !== JSON.stringify(query) && <p className={styles.status}>The selected preset has been edited in this session.</p>}
    {selected && !selected.query && <p className={styles.error} role="status">This preset uses a rule the web query builder cannot read. You can remove it after review.</p>}
    <form className={styles.saveRow} onSubmit={event => void save(event)}>
      <label><span>Save current query for the team</span><input value={name} onChange={event => setName(event.currentTarget.value)} maxLength={45} placeholder="Name this query" /></label>
      <button className="button button-quiet" type="submit" disabled={!canSave}>{create.isPending ? 'Saving…' : 'Save query'}</button>
    </form>
    {create.isError && <p className={styles.error} role="alert">{apiErrorMessage(create.error)} Your query is still here; retry to save it.</p>}
    {remove.isError && <p className={styles.error} role="alert">{apiErrorMessage(remove.error)} The saved query was not removed.</p>}
    {!hasEnabledRules(query) && <p className={styles.status}>Add at least one active rule before saving a preset.</p>}
  </section>;
}
