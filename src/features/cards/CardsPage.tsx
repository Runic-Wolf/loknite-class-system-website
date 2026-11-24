import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { hrefWithParams, withoutRecordParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { getClassLineage, getClassOptions, getOverview } from '../classes/api';
import { buildClassProgression } from '../classes/progression';
import type { ClassLineageRoot, ClassRow } from '../classes/types';
import { CardEditor } from './CardEditor';
import { createCard, deleteCard, getCard, getCardList, moveCard as moveCardApi, setCardConfirmation, updateCard } from './api';
import type { CardRecord, CardWrite } from './types';
import styles from './cards.module.css';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';
import { CardCollection } from './CardCollection';
import { CardFilterBar } from './CardFilterBar';
import { cardListParams, categoryOptions, filtersFromParams } from './filters';
import type { CardFilters } from './filters';
import { CollectionClassRail } from './CollectionClassRail';
import { CollectionGroupRail } from './CollectionGroupRail';
import { CardMoveControl } from './CardMoveControl';
import { getGalleryGroups } from './api';
import type { CardCategory } from './types';

function useWideInspector() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1720px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1720px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return wide;
}

function mediaUrl(path: string | null): string | null {
  return path ? `/media/${path.split('/').map(encodeURIComponent).join('/')}` : null;
}

export function CardsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const comparisonIds = [...new Set(params.getAll('compareClass'))];
  const listParams = cardListParams(params);
  if (comparisonIds.length) for (const key of ['family', 'classId', 'origin']) listParams.delete(key);
  const queryString = listParams.toString();
  const filterStateParams = cardListParams(params);
  for (const key of ['origin', 'family', 'classId', 'compareClass', 'group', 'after', 'owner']) filterStateParams.delete(key);
  const filterStateKey = filterStateParams.toString();
  const appliedQuery = params.get('q') ?? '';
  const [filters, setFilters] = useState<CardFilters>(() => filtersFromParams(params));
  const id = params.get('id');
  const creating = params.get('create') === '1' && !id;
  const familySlot = params.get('family');
  const exactClassId = params.get('classId');
  const categoryValue = params.get('category') ?? '';
  const appliedCategory = categoryOptions.find(([value]) => value === categoryValue)?.[0] || 'class';
  const groupCategory = categoryOptions.find(([value]) => value && value !== 'class' && value === categoryValue)?.[0] as Exclude<CardCategory, 'class'> | undefined;
  const groupSlot = params.get('group');
  const [density, setDensity] = useState<'compact' | 'normal' | 'large'>(() => {
    try {
      const saved = localStorage.getItem('lcs-card-density');
      return saved === 'compact' || saved === 'large' ? saved : 'normal';
    } catch { return 'normal'; }
  });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorRequest, setInspectorRequest] = useState(0);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectorToggleRef = useRef<HTMLButtonElement | null>(null);
  const wideInspector = useWideInspector();
  const showInspector = wideInspector || inspectorOpen || creating;
  const list = useQuery({
    queryKey: ['catalog', 'cards', 'list', queryString],
    queryFn: ({ signal }) => getCardList(new URLSearchParams(queryString), signal),
    placeholderData: previous => previous,
  });
  const detail = useQuery({
    queryKey: ['catalog', 'cards', 'record', id],
    queryFn: ({ signal }) => getCard(id ?? '', signal),
    enabled: Boolean(id),
  });
  const overview = useQuery({ queryKey: ['catalog', 'overview'], queryFn: ({ signal }) => getOverview(signal) });
  const groupData = useQuery({
    queryKey: ['catalog', 'gallery-groups', groupCategory],
    queryFn: ({ signal }) => getGalleryGroups(groupCategory!, signal),
    enabled: Boolean(groupCategory),
  });
  const lineage = useQuery({
    queryKey: ['catalog', 'classes', 'lineage', familySlot],
    queryFn: ({ signal }) => getClassLineage(familySlot ?? '', signal),
    enabled: params.get('category') === 'class' && Boolean(familySlot),
  });
  const comparison = useQuery({
    queryKey: ['catalog', 'classes', 'options', comparisonIds],
    queryFn: ({ signal }) => getClassOptions(comparisonIds, signal),
    enabled: comparisonIds.length > 0,
  });
  const progression = lineage.data ? buildClassProgression(lineage.data) : null;
  const classOptions = progression ? [
    progression.root,
    ...progression.branches.flatMap(branch => [branch.item, ...branch.classes.flatMap(path => [path.item, ...path.specializations])]),
  ] : [];
  const lineages = overview.data?.lineages ?? [];
  const activeRoot = lineages.find(item => item.slot === familySlot);
  const initialOwnerId = comparisonIds.length ? null : exactClassId ?? (activeRoot && params.get('classId') === null && params.has('family') ? activeRoot.id : null);

  useEffect(() => setFilters(filtersFromParams(new URLSearchParams(filterStateKey))), [filterStateKey]);
  useEffect(() => {
    const query = filters.q.trim();
    if (query === appliedQuery) return;
    const timer = window.setTimeout(() => setParams(current => {
      const next = new URLSearchParams(current);
      if (query) next.set('q', query); else next.delete('q');
      for (const key of ['after', 'id', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(key);
      return next;
    }, { replace: true }), 260);
    return () => window.clearTimeout(timer);
  }, [filters.q, appliedQuery, setParams]);
  useEffect(() => {
    try { localStorage.setItem('lcs-card-density', density); } catch { /* Density remains active for this page session. */ }
  }, [density]);
  useEffect(() => {
    if (creating) {
      setInspectorOpen(true);
      setInspectorRequest(value => value + 1);
    }
    else if (!id) setInspectorOpen(false);
  }, [creating, id]);
  useEffect(() => {
    if (!inspectorRequest) return;
    const frame = requestAnimationFrame(() => {
      const panel = inspectorRef.current;
      if (!panel) return;
      if (!wideInspector) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
      panel.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [inspectorRequest, wideInspector]);

  function revealInspector() {
    setInspectorOpen(true);
    setInspectorRequest(value => value + 1);
  }

  function closeInspector() {
    setInspectorOpen(false);
    requestAnimationFrame(() => inspectorToggleRef.current?.focus());
  }

  function applyFilters(nextFilters: CardFilters, immediate = true) {
    setFilters(nextFilters);
    if (!immediate) return;
    setParams(current => {
      const next = new URLSearchParams(current);
      const previousCategory = next.get('category') ?? '';
      if (previousCategory !== nextFilters.category) {
        for (const key of ['family', 'classId', 'origin', 'compareClass', 'group']) next.delete(key);
        if (nextFilters.category && nextFilters.category !== 'class') next.set('group', '0');
      }
      for (const key of ['q', 'category', 'status'] as const) {
        const value = nextFilters[key].trim();
        if (value) next.set(key, value); else next.delete(key);
      }
      for (const [key, values, options] of [
        ['type', nextFilters.types, ['Class Mechanic', 'Power', 'Attack', 'Skill', 'Other']],
        ['cost', nextFilters.costs, ['X', '0', '1', '2', '3', '4', '5']],
        ['element', nextFilters.elements, ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy']],
      ] as const) {
        next.delete(key);
        for (const value of options) if (values.includes(value as never)) next.append(key, value);
      }
      next.delete('tag');
      for (const tag of nextFilters.tags) next.append('tag', tag);
      next.delete('tier');
      if (nextFilters.category === 'class') for (const tier of nextFilters.tiers) next.append('tier', tier);
      next.set('view', 'cards');
      if (!nextFilters.category || nextFilters.category === 'class') next.delete('group');
      if (nextFilters.category !== 'class') for (const key of ['family', 'classId', 'origin', 'compareClass']) next.delete(key);
      for (const key of ['after', 'id', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(key);
      return next;
    }, { replace: true });
  }

  function clearFilters() {
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const key of ['q', 'status', 'tag', 'type', 'cost', 'element', 'tier', 'origin', 'after', 'id', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(key);
      next.set('view', 'cards');
      return next;
    }, { replace: true });
  }

  function removeFilter(key: string, value?: string) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value === undefined) next.delete(key);
      else {
        const values = next.getAll(key).filter(item => item !== value);
        next.delete(key);
        for (const item of values) next.append(key, item);
      }
      for (const stateKey of ['after', 'id', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(stateKey);
      return next;
    }, { replace: true });
  }

  function toggleComparedClass(classId: string) {
    setParams(current => {
      const next = new URLSearchParams(current);
      const selected = [...new Set(current.getAll('compareClass'))];
      const values = selected.includes(classId) ? selected.filter(idValue => idValue !== classId) : [...selected, classId];
      next.delete('compareClass');
      for (const value of values) next.append('compareClass', value);
      if (values.length) next.delete('origin');
      for (const stateKey of ['after', 'id', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(stateKey);
      next.set('view', 'cards');
      return next;
    }, { replace: true });
  }

  function openNewCard() {
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set('view', 'cards'); next.set('create', '1');
      for (const key of ['id', 'focus', 'edit', 'saved', 'error']) next.delete(key);
      return next;
    });
  }

  const filtered = ['q', 'status', 'tag', 'type', 'cost', 'element', 'tier', 'origin'].some(key => params.has(key));
  const originLabel = params.get('origin') ? lineages.find(root => root.slot === params.get('origin'))?.name ?? params.get('origin') : null;
  const appliedFilters = [
    ...(params.get('q') ? [{ key: 'q', value: undefined, label: `Search “${params.get('q')}”` }] : []),
    ...params.getAll('type').map(value => ({ key: 'type', value, label: value })),
    ...params.getAll('cost').map(value => ({ key: 'cost', value, label: `Cost ${value}` })),
    ...params.getAll('element').map(value => ({ key: 'element', value, label: value })),
    ...(params.get('status') ? [{ key: 'status', value: undefined, label: params.get('status') === 'CONFIRMADO' ? 'Confirmed' : 'Draft' }] : []),
    ...params.getAll('tag').map(value => ({ key: 'tag', value, label: `Tag ${value}` })),
    ...params.getAll('tier').map(value => ({ key: 'tier', value, label: `C-Tier ${value}` })),
    ...(originLabel ? [{ key: 'origin', value: undefined, label: `Legacy cards · ${originLabel}` }] : []),
  ];
  const comparedClassOptions = comparison.data?.items ?? [];
  const comparedClassesById = new Map(comparedClassOptions.map(item => [item.id, item]));
  const scopeLabel = activeRoot ? `${activeRoot.name} · ${exactClassId ? 'exact class' : 'full family'}` : familySlot ?? null;
  return <section className={styles.page}>
    <header className={styles.pageHeading}>
      <div><span className="eyebrow">CARD GALLERY <span aria-hidden="true">/</span> LOK’NITE</span><h1>Card collection</h1><p>Filter instantly, compare a class family or combine classes from your party.</p></div>
      <button className="button button-primary" type="button" onClick={openNewCard}>New card</button>
    </header>
    <CardFilterBar values={filters} active={filtered} busy={list.isFetching} onChange={applyFilters} onClear={clearFilters} />
    <div className={styles.appliedFilters} aria-live="polite">
      <span className="eyebrow">ACTIVE</span>
      {appliedFilters.map(filter => <button className={styles.appliedFilterRemove} type="button" key={`${filter.key}-${filter.value ?? 'single'}`} aria-label={`Remove ${filter.label} filter`} onClick={() => removeFilter(filter.key, filter.value)}><span>{filter.label}</span><span aria-hidden="true">×</span></button>)}
      {comparisonIds.map(classId => {
        const item = comparedClassesById.get(classId);
        const label = item ? `${item.tier} · ${item.name || 'Unnamed class'}` : 'Selected class';
        return <button className={styles.appliedFilterRemove} type="button" key={`compare-${classId}`} aria-label={`Remove ${label} from class comparison`} onClick={() => removeFilter('compareClass', classId)}><span>{label}</span><span aria-hidden="true">×</span></button>;
      })}
      {!appliedFilters.length && !comparisonIds.length && <span className={styles.mutedCopy}>No refinements</span>}
      {comparisonIds.length > 0 && <span className={styles.appliedFilter}>{comparisonIds.length} classes compared</span>}
      {scopeLabel && !comparisonIds.length && <span className={styles.appliedFilter}>{scopeLabel}</span>}
      {comparisonIds.length > 0 && comparison.isPending && <span className={styles.mutedCopy}>Loading class names…</span>}
    </div>
    {params.get('category') === 'class' && <CollectionClassRail
      roots={lineages}
      activeSlot={familySlot}
      exactClassId={exactClassId}
      progression={progression}
      loading={lineage.isPending}
      error={lineage.isError ? lineage.error : undefined}
      params={params}
      comparisonIds={comparisonIds}
      onRetry={() => void lineage.refetch()}
      onToggleComparison={toggleComparedClass}
    />}
    {groupCategory && <CollectionGroupRail category={groupCategory} categoryLabel={categoryOptions.find(([value]) => value === groupCategory)?.[1] ?? groupCategory} activeSlot={groupSlot} params={params} />}
    <div className={styles.galleryToolbar}>
      <div className={styles.galleryContext}><span className="eyebrow">{comparisonIds.length ? 'PARTY COMPARISON' : familySlot ? 'CLASS SCOPE' : groupCategory ? 'CATEGORY SCOPE' : 'COLLECTION'}</span><strong>{comparisonIds.length ? `${comparisonIds.length} selected classes` : activeRoot ? `${activeRoot.name} · ${exactClassId ? 'exact class' : 'all classes'}` : groupCategory ? `${categoryOptions.find(([value]) => value === groupCategory)?.[1] ?? groupCategory}${groupSlot !== null ? ` · ${groupData.data?.items.find(group => String(group.slot) === groupSlot)?.name ?? `Group ${Number(groupSlot) + 1}`}` : ' · all 15 groups'}` : params.get('category') === 'class' ? 'Choose a class family' : 'All card categories'}</strong><small>{list.data?.items.length ?? '—'} cards on this page{list.isPlaceholderData ? ' · previous results while updating' : ''}</small></div>
      <div className={styles.galleryActions}>
        <label className={styles.densityField}><span>Density</span><select value={density} onChange={event => setDensity(event.currentTarget.value as typeof density)} aria-label="Card grid density"><option value="compact">Compact</option><option value="normal">Normal</option><option value="large">Large</option></select></label>
        {!wideInspector && id && <button ref={inspectorToggleRef} className="button button-quiet" type="button" aria-expanded={showInspector} aria-controls="card-inspector" onClick={() => showInspector ? setInspectorOpen(false) : revealInspector()}>{showInspector ? 'Hide Inspector' : 'Inspect card'}</button>}
      </div>
    </div>
    <div className={styles.workspace} data-inspector={showInspector ? 'open' : 'closed'}>
      <div className={styles.collectionColumn}>
        <CardCollection
          rows={list.data?.items}
          next={list.data?.next}
          params={params}
          density={density}
          loading={list.isPending}
          busy={list.isFetching}
          error={list.isError ? apiErrorMessage(list.error) : undefined}
          onRetry={() => void list.refetch()}
          record={detail.data}
          classOptions={classOptions}
          onInspect={revealInspector}
        />
      </div>
      {showInspector && <aside ref={inspectorRef} className={styles.inspectorColumn} id="card-inspector" aria-label="Card inspector" tabIndex={-1}>
        <header className={styles.inspectorHeading}><div><span className="eyebrow">INSPECT</span><h2>{detail.data?.item.name || (creating ? 'New card' : 'Card details')}</h2></div>{!wideInspector && !creating && <button className="button button-quiet" type="button" onClick={closeInspector}>Close</button>}</header>
        <CardDetail
          id={id}
          creating={creating}
          record={detail.data}
          pending={detail.isPending}
          error={detail.isError ? apiErrorMessage(detail.error) : undefined}
          onRetry={() => void detail.refetch()}
          lineages={lineages}
          initialCategory={appliedCategory}
          initialOwnerId={initialOwnerId}
          initialSlot={groupCategory && groupSlot !== null && /^\d{1,2}$/.test(groupSlot) ? Number(groupSlot) : undefined}
          classOptions={classOptions}
          onSave={async (input, idempotencyKey, createAnother) => {
            let result: CardRecord & { revision: number };
            if (id && detail.data) result = await updateCard(id, detail.data.version, input);
            else if (idempotencyKey) result = await createCard(input, idempotencyKey);
            else throw new Error('The create attempt could not be identified. Try again.');
            queryClient.setQueryData(['catalog', 'cards', 'record', result.item.id], result);
            await list.refetch();
            setInspectorOpen(true);
            setParams(current => {
              const next = new URLSearchParams(current);
              next.set('view', 'cards'); next.set('saved', '1');
              if (createAnother) {
                next.set('create', '1');
                for (const key of ['id', 'focus', 'edit', 'error']) next.delete(key);
              } else {
                next.set('id', result.item.id);
                for (const key of ['create', 'focus', 'edit', 'error']) next.delete(key);
              }
              return next;
            });
            return result;
          }}
          onCancel={() => setParams(current => withoutRecordParams(current))}
          onMove={async (cardId, version, destinationClassId, destinationRootSlot, idempotencyKey) => {
            const moved = await moveCardApi(cardId, version, destinationClassId, idempotencyKey);
            queryClient.setQueryData(['catalog', 'cards', 'record', cardId], moved);
            await queryClient.invalidateQueries({ queryKey: ['catalog', 'cards', 'list'], refetchType: 'none' });
            setInspectorOpen(true);
            setParams(current => {
              const next = new URLSearchParams(current);
              next.set('view', 'cards'); next.set('category', 'class'); next.set('family', destinationRootSlot); next.set('classId', destinationClassId); next.set('id', cardId);
              for (const key of ['group', 'origin', 'owner', 'tier', 'after', 'focus', 'create', 'edit', 'saved', 'error']) next.delete(key);
              return next;
            });
            return moved;
          }}
          onRefresh={async () => { await detail.refetch(); await list.refetch(); }}
        />
      </aside>}
    </div>
  </section>;
}

function CardDetail({ id, creating, record, pending, error, onRetry, lineages, classOptions, initialCategory, initialOwnerId, initialSlot, onSave, onMove, onCancel, onRefresh }: {
  id: string | null;
  creating: boolean;
  record?: CardRecord | undefined;
  pending: boolean;
  error?: string | undefined;
  onRetry: () => void;
  lineages: ClassLineageRoot[];
  classOptions: ClassRow[];
  initialCategory: CardFilters['category'];
  initialOwnerId: string | null;
  initialSlot: number | undefined;
  onSave: (input: CardWrite, idempotencyKey?: string | undefined, createAnother?: boolean) => Promise<unknown>;
  onMove: (id: string, version: string, destinationClassId: string, destinationRootSlot: string, idempotencyKey: string) => Promise<unknown>;
  onCancel: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [params, setParams] = useSearchParams();
  const createAttempt = useIdempotencyKey();
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmationPrompt, setConfirmationPrompt] = useState<'confirm' | 'unconfirm' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmationDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const editing = params.get('edit') === '1';
  const item = record?.item;
  const editable = item?.status !== 'CONFIRMADO';
  const deletable = item?.status === 'RASCUNHO' && item.source.kind !== 'skill' && item.type !== 'Class Mechanic';

  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (!dialog) return;
    if (confirmationPrompt && !dialog.open) dialog.showModal();
    if (!confirmationPrompt && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [confirmationPrompt]);

  if (!id && !creating) return <section className={`${styles.detailPanel} ${styles.detailPlaceholder}`}><span className={styles.placeholderGlyph} aria-hidden="true">↖</span><h2>Choose a card</h2><p>Open a record to inspect its rules, artwork and confirmation status.</p></section>;
  if (id && pending) return <section className={styles.detailPanel} aria-busy="true"><p className="sr-only" role="status">Loading card</p><div className={styles.detailSkeleton} aria-hidden="true"><i /><b /><span /><span /><span /></div></section>;
  if (id && (error || !record)) return <section className={styles.detailPanel} role="alert"><h2>Card unavailable</h2><p>{error}</p><button className="button button-quiet" type="button" onClick={onRetry}>Retry card</button></section>;

  async function save(input: CardWrite, createAnother = false): Promise<boolean> {
    setSaving(true); setSaveError('');
    try {
      await onSave(input, id ? undefined : createAttempt.forPayload(input), createAnother);
      createAttempt.clear();
      return true;
    }
    catch (failure) { setSaveError(apiErrorMessage(failure)); return false; }
    finally { setSaving(false); }
  }

  async function mutateConfirmation(action: 'confirm' | 'unconfirm') {
    if (!id || !record) return;
    setActionError(''); setConfirming(true);
    try {
      await setCardConfirmation(id, record.version, action);
      await onRefresh();
      setConfirmationPrompt(null);
    } catch (failure) { setActionError(apiErrorMessage(failure)); }
    finally { setConfirming(false); }
  }

  async function remove() {
    if (!id || !record) return;
    setDeleting(true); setActionError('');
    try {
      await deleteCard(id, record.version);
      setParams(current => withoutRecordParams(current));
      await onRefresh();
    } catch (failure) { setActionError(apiErrorMessage(failure)); }
    finally { setDeleting(false); setDeletePrompt(false); }
  }

  const saved = params.get('saved') === '1';
  return <article className={styles.detailPanel} aria-labelledby="card-detail-title">
    <div className={styles.detailTopline}><Link className={styles.backLink} to={hrefWithParams(withoutRecordParams(params), { view: 'cards' })}><span aria-hidden="true">←</span><span>All cards</span></Link><span className={`${styles.statusBadge}${item?.status === 'CONFIRMADO' ? ` ${styles.confirmed}` : ''}`}>{item?.status === 'CONFIRMADO' ? 'Confirmed' : 'Draft'}</span></div>
    {creating || editing ? <>
      {saveError && <p className={styles.formError} role="alert">{saveError}</p>}
      {creating && saved && <p className={styles.successNotice} role="status">Draft created. Your category and collection slot are ready for the next card.</p>}
      {editing && !editable ? <div className={styles.collectionError} role="alert"><p>Reopen this confirmed card before editing gameplay fields.</p><button className="button button-quiet" type="button" onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('edit'); return next; })}>Return to card details</button></div>
        : <CardEditor item={editing ? item : undefined} lineages={lineages} classOptions={classOptions} initialCategory={initialCategory || 'class'} initialOwnerId={initialOwnerId} initialSlot={initialSlot} saving={saving} onSave={(input, next) => save(input, next === 'another')} onCancel={() => { if (creating) createAttempt.clear(); onCancel(); }} />}
    </> : item && record ? <>
      <div className={styles.cardHero}>
        <div className={styles.cardArtwork}>{mediaUrl(item.artPath) ? <img src={mediaUrl(item.artPath)!} alt="" /> : <span aria-hidden="true">◇</span>}</div>
        <div className={styles.cardTitle}><span className="eyebrow">{item.category} <i aria-hidden="true">·</i> {item.type || (item.noteOwnerId ? 'Free Note' : 'Unassigned')}</span><h2 id="card-detail-title">{item.name || '?'}</h2><p>{item.element || 'Unassigned element'} <i aria-hidden="true">·</i> Cost {item.cost || 'Unassigned'}</p></div>
        <div className={styles.detailActions}>
          {editable && <button className="button button-primary" type="button" onClick={() => { setSaveError(''); setParams(current => { const next = new URLSearchParams(current); next.set('edit', '1'); next.delete('saved'); return next; }); }}>Edit card</button>}
          {editable ? <button className="button button-quiet" type="button" aria-haspopup="dialog" onClick={() => { setActionError(''); setConfirmationPrompt('confirm'); }}>Confirm</button> : <button className="button button-quiet" type="button" aria-haspopup="dialog" onClick={() => { setActionError(''); setConfirmationPrompt('unconfirm'); }}>Reopen</button>}
        </div>
      </div>
      {saved && <p className={styles.successNotice} role="status">Card saved. The current version is up to date.</p>}
      {actionError && !confirmationPrompt && <p className={styles.formError} role="alert">{actionError}</p>}
      {!editable && <p className={styles.inlineWarning}>Reopen this card before editing gameplay fields.</p>}
      {item.source.kind === 'skill' && <p className={styles.inlineWarning}>This card is linked to a skill. Its name and tags follow the skill record.</p>}
      {confirmationPrompt && <dialog ref={confirmationDialog} className={styles.confirmDialog} aria-labelledby="card-confirmation-title"
        aria-describedby="card-confirmation-description"
        onClose={() => setConfirmationPrompt(null)}
        onClick={event => { if (event.target === event.currentTarget && !confirming) setConfirmationPrompt(null); }}>
        <div className={styles.confirmDialogBody}>
          <span className="eyebrow">CARD · {confirmationPrompt === 'confirm' ? 'APPROVAL SNAPSHOT' : 'RETURN TO DRAFT'}</span>
          <h2 id="card-confirmation-title">{confirmationPrompt === 'confirm' ? 'Confirm this version?' : 'Reopen this card?'}</h2>
          <p id="card-confirmation-description">{confirmationPrompt === 'confirm'
            ? 'The server will approve the current gameplay fields and record this version. Confirmed cards stay protected until reopened.'
            : 'This clears the approval snapshot and returns the card to Draft so it can be edited again.'}</p>
          <section className={styles.confirmSnapshot} aria-label="Card version under review">
            <strong>{item.name || 'Untitled card'}</strong><span>{item.type || 'Free Note'} · {item.element || 'Unassigned element'} · Cost {item.cost || 'Unassigned'}</span>
            <p>{item.ruleText || 'No rule text yet.'}</p><small>Version {record.version.slice(0, 12)}</small>
          </section>
          {confirmationPrompt === 'confirm' && !item.ruleText.trim() && <p className={styles.inlineWarning}>Add rule text before confirming. The server will enforce this requirement.</p>}
          {actionError && <p className={styles.formError} role="alert">{actionError}</p>}
          <div className={styles.confirmActions}>
            <button className="button button-quiet" type="button" autoFocus disabled={confirming} onClick={() => setConfirmationPrompt(null)}>Cancel</button>
            <button className="button button-primary" type="button" disabled={confirming || confirmationPrompt === 'confirm' && !item.ruleText.trim()} onClick={() => void mutateConfirmation(confirmationPrompt)}>{confirming ? 'Saving…' : confirmationPrompt === 'confirm' ? 'Confirm version' : 'Reopen as draft'}</button>
          </div>
        </div>
      </dialog>}
      <DetailCopy label="RULE TEXT" text={item.ruleText} fallback="No rule text yet." />
      <DetailCopy label="FLAVOUR TEXT" text={item.flavourText} fallback="No flavour text yet." />
      <div className={styles.tags} aria-label="Card tags">{item.tags.length ? item.tags.map(tag => <span className={styles.tag} key={tag}>{tag}</span>) : <span className={styles.mutedCopy}>No tags assigned</span>}</div>
      <CardMoveControl item={item} version={record.version} roots={lineages} onMove={(destination, rootSlot, idempotencyKey) => onMove(id!, record.version, destination, rootSlot, idempotencyKey)} />
      <section className={styles.cardMeta}><span>Category</span><strong>{item.category}</strong><span>Slot</span><strong>{item.slot}</strong><span>Workflow</span><strong>{item.workflowStatus || 'Draft'}</strong><span>Version</span><strong>{record.version.slice(0, 12)}</strong></section>
      {deletable && <div className={styles.deleteArea}>{deletePrompt ? <div className={styles.discardNotice} role="alert"><p>Delete “{item.name || '?'}”? This cannot be undone.</p><button className="button button-quiet" type="button" onClick={() => setDeletePrompt(false)}>Keep card</button><button className="button button-danger" type="button" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete card'}</button></div> : <button className="button button-quiet" type="button" onClick={() => setDeletePrompt(true)}>Delete draft card</button>}</div>}
    </> : null}
  </article>;
}

function DetailCopy({ label, text, fallback }: { label: string; text: string; fallback: string }) {
  return <section className={styles.detailCopy}><span className={styles.fieldCaption}>{label}</span><p>{text || fallback}</p></section>;
}
