import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiErrorMessage } from '../../ui/feedback';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';
import { getClassLineage } from '../classes/api';
import { buildClassProgression, classNodeLabel } from '../classes/progression';
import type { ClassLineageRoot } from '../classes/types';
import type { CardItem } from './types';
import styles from './cards.module.css';

type Props = {
  item: CardItem;
  version: string;
  roots: ClassLineageRoot[];
  onMove: (destinationClassId: string, destinationRootSlot: string, idempotencyKey: string) => Promise<unknown>;
};

function lockReason(item: CardItem): string | null {
  if (item.source.kind === 'skill' || item.source.skillId) return 'This card belongs to a skill. Its class follows the skill record.';
  if (item.noteOwnerId || item.noteTier) return 'Free Notes stay linked to their class tree.';
  if (item.type === 'Class Mechanic') return 'Class Mechanics stay with the class that defines them.';
  if (item.status === 'CONFIRMADO') return 'Reopen the confirmed card before changing its class.';
  return null;
}

export function CardMoveControl({ item, version, roots, onMove }: Props) {
  const rootForSlot = roots.find(root => root.slot === `C1_${item.slot}`);
  const [rootSlot, setRootSlot] = useState(rootForSlot?.slot ?? `C1_${item.slot}`);
  const [destinationClassId, setDestinationClassId] = useState(item.layoutClassId ?? rootForSlot?.id ?? `base_${item.slot}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useIdempotencyKey();
  const blocked = lockReason(item);
  const lineage = useQuery({
    queryKey: ['catalog', 'classes', 'lineage', rootSlot],
    queryFn: ({ signal }) => getClassLineage(rootSlot, signal),
    enabled: item.category === 'class' && Boolean(rootSlot) && !blocked,
  });
  const progression = lineage.data ? buildClassProgression(lineage.data) : null;
  const destinations = progression ? [
    progression.root,
    ...progression.branches.flatMap(branch => [branch.item, ...branch.classes.map(entry => entry.item)]),
  ] : [];
  const currentRoot = roots.find(root => root.slot === `C1_${item.slot}`);

  useEffect(() => {
    if (item.category !== 'class') return;
    const root = roots.find(entry => entry.slot === `C1_${item.slot}`);
    if (!root) return;
    setRootSlot(root.slot);
    setDestinationClassId(item.layoutClassId ?? root.id);
  }, [item.category, item.id, item.slot, item.layoutClassId, roots]);

  useEffect(() => {
    if (!lineage.data || !item.layoutClassId) return;
    const linked = lineage.data.find(entry => entry.id === item.layoutClassId);
    if (linked?.tier === 'SPEC' && linked.parentId) setDestinationClassId(linked.parentId);
  }, [lineage.data, item.layoutClassId]);

  function changeRoot(nextSlot: string) {
    const root = roots.find(entry => entry.slot === nextSlot);
    if (!root) return;
    setRootSlot(root.slot);
    setDestinationClassId(root.id);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || !destinationClassId || lineage.isPending) return;
    setBusy(true); setError('');
    try {
      await onMove(destinationClassId, rootSlot, attempt.forPayload({ id: item.id, version, destinationClassId }));
      attempt.clear();
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally { setBusy(false); }
  }

  if (item.category !== 'class') return null;
  const unavailableMessage = lineage.isError ? apiErrorMessage(lineage.error) : lineage.data && !progression ? 'The selected class tree is incomplete.' : '';

  return <form className={styles.movePanel} aria-labelledby="card-move-title" onSubmit={submit}>
    <header><div><span className="eyebrow">CLASS GALLERY</span><h3 id="card-move-title">Class placement</h3></div>{currentRoot && <small>{currentRoot.name || currentRoot.slot}</small>}</header>
    {blocked && <p className={styles.moveLocked}>{blocked}</p>}
    <div className={styles.moveFields}>
      <label htmlFor="card-move-root">C1 root</label>
      <select id="card-move-root" value={rootSlot} disabled={Boolean(blocked) || busy || !roots.length} onChange={event => changeRoot(event.currentTarget.value)}>
        {roots.map(root => <option key={root.id} value={root.slot}>{root.name || '(unnamed root)'} · {root.slot}</option>)}
      </select>
      <label htmlFor="card-move-destination">C1 / C2 / C3 destination</label>
      <select id="card-move-destination" value={destinationClassId} disabled={Boolean(blocked) || busy || lineage.isPending || !destinations.length} onChange={event => { setDestinationClassId(event.currentTarget.value); setError(''); }}>
        {!destinations.some(entry => entry.id === destinationClassId) && <option value="" disabled>{lineage.isPending ? 'Loading class slots…' : 'Choose a class destination'}</option>}
        {destinations.map(entry => <option key={entry.id} value={entry.id}>{entry.tier} · {classNodeLabel(entry)}</option>)}
      </select>
    </div>
    {lineage.isPending && <div className={styles.moveSkeleton} aria-hidden="true"><i /><i /></div>}
    {unavailableMessage && <div className={styles.moveError} role="alert"><p>{unavailableMessage}</p><button className="button button-quiet" type="button" onClick={() => void lineage.refetch()}>Retry class list</button></div>}
    {error && <p className={styles.moveErrorText} role="alert">{error}</p>}
    <footer><small>{blocked ? 'The server enforces the same placement rules.' : 'Choose a C1, then a C1/C2/C3 slot. Changing C1 moves the card to that class family.'}</small><button className="button button-quiet" type="submit" disabled={Boolean(blocked) || busy || lineage.isPending || !destinationClassId || destinationClassId === (item.layoutClassId ?? currentRoot?.id)}>{busy ? 'Moving…' : 'Move card'}</button></footer>
  </form>;
}
