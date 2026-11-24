import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { hrefWithParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { getGalleryGroups, renameGalleryGroup } from './api';
import type { CardCategory, GalleryGroup } from './types';
import styles from './cards.module.css';

type GroupCategory = Exclude<CardCategory, 'class'>;

export function CollectionGroupRail({ category, categoryLabel, activeSlot, params }: {
  category: GroupCategory;
  categoryLabel: string;
  activeSlot: string | null;
  params: URLSearchParams;
}) {
  const groups = useQuery({
    queryKey: ['catalog', 'gallery-groups', category],
    queryFn: ({ signal }) => getGalleryGroups(category, signal),
  });
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<GalleryGroup | null>(null);
  const [name, setName] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const renameButtons = useRef(new Map<number, HTMLButtonElement>());
  const returnSlot = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: (values: { group: GalleryGroup; name: string }) => renameGalleryGroup(category, values.group, values.name),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog', 'gallery-groups', category] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'overview'] }),
      ]);
    },
  });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (editing && !element.open) element.showModal();
    if (editing) requestAnimationFrame(() => input.current?.focus());
    if (!editing && element.open) element.close();
    if (!editing && returnSlot.current !== null) {
      const slot = returnSlot.current;
      returnSlot.current = null;
      requestAnimationFrame(() => renameButtons.current.get(slot)?.focus());
    }
    return () => { if (element.open) element.close(); };
  }, [editing]);

  function openRename(group: GalleryGroup) {
    returnSlot.current = group.slot;
    setName(group.name);
    mutation.reset();
    setEditing(group);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    try {
      const result = await mutation.mutateAsync({ group: editing, name });
      setName(result.name);
      setEditing(null);
    } catch { /* The form keeps its draft and shows the conflict or validation error. */ }
  }

  const allHref = hrefWithParams(params, {
    view: 'cards', group: null, family: null, classId: null, origin: null,
    after: null, id: null, focus: null, create: null, edit: null, saved: null, error: null,
  });

  return <>
    <section className={styles.collectionGroupRail} aria-label={`${categoryLabel} groups`}>
      <header className={styles.classRailHeading}>
        <div><span className="eyebrow">{categoryLabel.toUpperCase()} GROUPS</span><strong>Fifteen collection slots</strong></div>
        <span>Rename one group without affecting its neighbours</span>
      </header>
      <nav className={styles.groupRail} aria-label={`Choose ${categoryLabel.toLowerCase()} group`}>
        <Link className={styles.allGroupsChoice} to={allHref} aria-current={!activeSlot ? 'page' : undefined} data-active={!activeSlot ? 'true' : undefined}>
          <strong>All groups</strong><small>All {categoryLabel.toLowerCase()} cards</small>
        </Link>
        {groups.isPending ? <GroupRailSkeleton /> : groups.data?.items.map(group => {
          const active = activeSlot === String(group.slot);
          const href = hrefWithParams(params, {
            view: 'cards', category, group: String(group.slot), family: null, classId: null, origin: null,
            after: null, id: null, focus: null, create: null, edit: null, saved: null, error: null,
          });
          return <div className={styles.groupChoice} data-active={active ? 'true' : undefined} key={group.slot}>
            <Link to={href} aria-current={active ? 'page' : undefined} className={styles.groupChoiceLink}>
              <span className={styles.groupNumber}>{String(group.slot + 1).padStart(2, '0')}</span>
              <span className={styles.groupCopy}><strong>{group.name}</strong><small>{group.count} {group.count === 1 ? 'card' : 'cards'}</small></span>
            </Link>
            <button className={styles.renameGroup} type="button" aria-label={`Rename ${categoryLabel.toLowerCase()} group ${group.slot + 1}: ${group.name}`}
              ref={node => { if (node) renameButtons.current.set(group.slot, node); else renameButtons.current.delete(group.slot); }}
              onClick={() => openRename(group)}>Rename</button>
          </div>;
        })}
      </nav>
      {groups.isError && <div className={styles.collectionError} role="alert"><p>{apiErrorMessage(groups.error)}</p><button className="button button-quiet" type="button" onClick={() => void groups.refetch()}>Retry groups</button></div>}
    </section>
    <dialog ref={dialog} className={styles.renameDialog} aria-labelledby="rename-group-title"
      onCancel={event => { event.preventDefault(); if (!mutation.isPending) setEditing(null); }}
      onClick={event => { if (event.target === event.currentTarget && !mutation.isPending) setEditing(null); }}>
      <form className={styles.renameForm} onSubmit={event => void submit(event)}>
        <span className="eyebrow">{categoryLabel.toUpperCase()} · GROUP {editing ? String(editing.slot + 1).padStart(2, '0') : ''}</span>
        <h2 id="rename-group-title">Rename collection group</h2>
        <label className={styles.renameField}><span>Group name</span><input ref={input} value={name} onChange={event => setName(event.currentTarget.value)} maxLength={46} required autoComplete="off" /></label>
        <p className={styles.renameHint}>The label belongs to this category and slot only. Existing cards stay in the same group.</p>
        {mutation.isError && <p className={styles.formError} role="alert">{apiErrorMessage(mutation.error)}</p>}
        <div className={styles.renameActions}>
          <button className="button button-quiet" type="button" onClick={() => setEditing(null)} disabled={mutation.isPending}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={mutation.isPending || !name.trim()}>{mutation.isPending ? 'Saving…' : 'Save group name'}</button>
        </div>
      </form>
    </dialog>
  </>;
}

function GroupRailSkeleton() {
  return <div className={styles.groupRailSkeleton} aria-busy="true"><span className="sr-only" role="status">Loading collection groups</span>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>;
}
