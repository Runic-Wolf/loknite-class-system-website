import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { getClass, getClassLineage, getClassList, getOverview } from './api';
import { ClassDetail } from './ClassDetail';
import { ClassList } from './ClassList';
import { ClassLineageSkeleton } from './ClassSkeleton';
import { ClassLineageRail } from './ClassLineageRail';
import { ClassNotesInline } from './ClassNotesInline';
import { ProgressionTree } from './ProgressionTree';
import { ChronicleMatrixPreview } from './ChronicleMatrixPreview';
import { BulkTagAssignment } from '../tags/BulkTagAssignment';
import { buildClassProgression } from './progression';
import { apiErrorMessage } from '../../ui/feedback';
import type { Session } from './types';
import type { ClassNoteCursor } from './types';
import { clearClassNoteHandoff, readClassNoteHandoff, writeClassNoteHandoff } from './note-drafts';
import styles from './classes.module.css';

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

export function ClassMatrixPage({ session }: { session: Session }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [returnHandoff] = useState(readClassNoteHandoff);
  const [restoreNoteId, setRestoreNoteId] = useState<string | null>(() => returnHandoff?.activeNoteId ?? null);
  const [restoreScrollY, setRestoreScrollY] = useState<number | null>(() => returnHandoff?.scrollY ?? null);
  const chroniclePreview = searchParams.get('design') === 'chronicle';
  const selectedId = chroniclePreview ? null : searchParams.get('id');
  const explicitRootSlot = searchParams.get('lineage');
  const wideInspector = useWideInspector();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<ReadonlySet<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(() => searchParams.has('q') || searchParams.has('tier'));
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() => returnHandoff?.drafts ?? {});
  const [openNoteIds, setOpenNoteIds] = useState<ReadonlySet<string>>(() => new Set(returnHandoff?.openIds ?? []));
  const pendingRootFocusId = useRef<string | null>(null);

  const overview = useQuery({
    queryKey: ['catalog', 'overview'],
    queryFn: ({ signal }) => getOverview(signal),
  });
  const defaultRoot = overview.data?.lineages[0];
  const provisionalRootSlot = explicitRootSlot ?? defaultRoot?.slot ?? null;
  const provisionalRoot = overview.data?.lineages.find(item => item.slot === provisionalRootSlot);
  const showInspector = !chroniclePreview && (wideInspector || inspectorOpen);
  const detailId = selectedId ?? (showInspector ? provisionalRoot?.id ?? null : null);
  const detail = useQuery({
    queryKey: ['catalog', 'class', detailId],
    queryFn: ({ signal }) => getClass(detailId ?? '', signal),
    enabled: Boolean(detailId),
  });

  const classRootSlot = detail.data?.lineage.find(part => part.tier === 'C1')?.slot ?? null;
  const selectedRootSlot = selectedId
    ? classRootSlot
    : explicitRootSlot ?? defaultRoot?.slot ?? null;
  const activeRoot = overview.data?.lineages.find(item => item.slot === selectedRootSlot);
  const selectedClassId = selectedId ?? activeRoot?.id ?? null;
  const lineage = useQuery({
    queryKey: ['catalog', 'classes', 'lineage', selectedRootSlot],
    queryFn: ({ signal }) => getClassLineage(selectedRootSlot ?? '', signal),
    enabled: Boolean(activeRoot),
  });
  const progression = lineage.data ? buildClassProgression(lineage.data) : null;

  useEffect(() => {
    const requestedId = pendingRootFocusId.current;
    if (!requestedId || progression?.root.id !== requestedId) return;
    pendingRootFocusId.current = null;
    if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const rootNode = [...document.querySelectorAll<HTMLElement>('[data-class-node="true"]')]
      .find(node => node.dataset.nodeId === requestedId);
    rootNode?.focus({ preventScroll: true });
  }, [progression?.root.id]);

  useEffect(() => {
    if (returnHandoff) clearClassNoteHandoff();
  }, [returnHandoff]);

  useEffect(() => {
    if (restoreScrollY === null || !lineage.data) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, restoreScrollY);
      setRestoreScrollY(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [restoreScrollY, lineage.data]);

  const listParams = new URLSearchParams();
  for (const key of ['q', 'tier', 'lineage', 'after']) {
    const value = searchParams.get(key);
    if (value) listParams.set(key, value);
  }
  const searchQuery = listParams.toString();
  const list = useQuery({
    queryKey: ['catalog', 'classes', 'search', searchQuery],
    queryFn: ({ signal }) => getClassList(new URLSearchParams(searchQuery), signal),
    enabled: searchOpen,
    placeholderData: previous => previous,
  });

  useEffect(() => {
    if (!selectedId) return;
    setInspectorOpen(true);
    setSearchOpen(false);
  }, [selectedId]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedClassIds(new Set());
  }, [selectedRootSlot]);

  function openSearch() {
    setSearchOpen(true);
  }

  function toggleInspector() {
    setInspectorOpen(value => !value);
  }

  function toggleSelectionMode() {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedClassIds(new Set());
      return;
    }
    setSelectionMode(true);
    setInspectorOpen(true);
    setSearchOpen(false);
  }

  function toggleChroniclePreview() {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (chroniclePreview) {
        next.delete('design');
      } else {
        next.set('view', 'classes');
        next.set('lineage', 'C1_0');
        next.set('design', 'chronicle');
        for (const key of ['id', 'edit', 'saved', 'error', 'after']) next.delete(key);
      }
      return next;
    }, { preventScrollReset: true });
    if (!chroniclePreview) {
      setInspectorOpen(false);
      setSearchOpen(false);
      setSelectionMode(false);
      setSelectedClassIds(new Set());
    }
  }

  function inspectClassFromChronicle(id: string) {
    if (!activeRoot) return;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('view', 'classes');
      next.set('lineage', activeRoot.slot);
      next.set('id', id);
      next.delete('design');
      for (const key of ['edit', 'saved', 'error', 'after']) next.delete(key);
      return next;
    }, { preventScrollReset: true });
    setInspectorOpen(true);
  }

  function toggleClassSelection(id: string) {
    setSelectedClassIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 500) next.add(id);
      return next;
    });
  }

  function selectClassFromKeyboard(id: string) {
    if (!activeRoot) return;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('view', 'classes');
      next.set('lineage', activeRoot.slot);
      next.set('id', id);
      for (const key of ['edit', 'saved', 'error', 'after']) next.delete(key);
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  function moveToAdjacentRoot(direction: -1 | 1) {
    const roots = overview.data?.lineages ?? [];
    const currentIndex = roots.findIndex(root => root.slot === activeRoot?.slot);
    if (currentIndex < 0 || roots.length < 2) return;
    const nextRoot = roots[(currentIndex + direction + roots.length) % roots.length];
    if (!nextRoot) return;
    pendingRootFocusId.current = nextRoot.id;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('view', 'classes');
      next.set('lineage', nextRoot.slot);
      next.set('id', nextRoot.id);
      for (const key of ['edit', 'saved', 'error', 'after']) next.delete(key);
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  function updateNoteDraft(id: string, value: string | undefined) {
    setNoteDrafts(current => {
      if (value === undefined) {
        if (!Object.hasOwn(current, id)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      return current[id] === value ? current : { ...current, [id]: value };
    });
  }

  function updateNoteOpen(id: string, open: boolean) {
    setOpenNoteIds(current => {
      const next = new Set(current);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }

  function prepareMentionNavigation(_href: string, context: { id: string; cursor: ClassNoteCursor }): boolean {
    const saved = writeClassNoteHandoff({
      drafts: noteDrafts,
      openIds: [...openNoteIds],
      activeNoteId: context.id,
      cursor: context.cursor,
      scrollY: window.scrollY,
    });
    if (!saved) return false;
    return true;
  }

  return <section className={styles.page} data-design={chroniclePreview ? 'chronicle' : undefined}>
    <header className={styles.pageHeading}>
      <div><span className="eyebrow">CLASS MATRIX <span aria-hidden="true">/</span> LOK’NITE</span><h1>Classes</h1><p>Follow a class family from its root through every specialization slot.</p></div>
      <div className={styles.headingCount}><strong>{overview.data?.counts.classes ?? '—'}</strong><span>fixed class slots</span></div>
    </header>

    {overview.isError && <div className={styles.queryError} role="alert"><p>Class families could not be loaded. {apiErrorMessage(overview.error)}</p><button className="button button-quiet" type="button" onClick={() => void overview.refetch()}>Retry class families</button></div>}
    {overview.isPending
      ? <div className={styles.lineageRailSkeleton} aria-busy="true" aria-label="Loading class families"><span className="sr-only" role="status">Loading class families</span>{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
      : overview.data && <ClassLineageRail items={overview.data.lineages} activeSlot={selectedRootSlot} params={searchParams} />}

    <div className={styles.matrixToolbar}>
      <div className={styles.matrixContext}>
        <span className="eyebrow">CURRENT LINEAGE</span>
        <strong>{activeRoot?.name || (selectedId && detail.isPending ? 'Resolving class path…' : 'Choose a class family')}</strong>
        {!activeRoot && <small>{overview.data?.lineages.length ?? 15} roots · {overview.data?.counts.classes ?? 315} fixed slots</small>}
        {selectionMode && <small className={styles.selectionStatus} role="status" aria-live="polite">{selectedClassIds.size} of 21 classes selected</small>}
      </div>
      <div className={styles.matrixActions}>
        {chroniclePreview
          ? <button className="button button-quiet" type="button" aria-pressed="true" onClick={toggleChroniclePreview}>Return to standard matrix</button>
          : <button className="button button-quiet" type="button" aria-pressed="false" onClick={toggleChroniclePreview}>Preview style</button>}
        {!chroniclePreview && !wideInspector && <button className="button button-quiet" type="button" aria-expanded={showInspector} aria-controls="class-inspector" onClick={toggleInspector}>
          {showInspector ? 'Hide Inspect' : 'Inspect ' + (detail.data?.item.name || activeRoot?.name || 'class')}
        </button>}
        {!chroniclePreview && <button className="button button-quiet" type="button" onClick={openSearch} aria-expanded={searchOpen} aria-controls="class-search-panel">Find class</button>}
        {!chroniclePreview && activeRoot && progression && <button className="button button-quiet" type="button" aria-pressed={selectionMode} onClick={toggleSelectionMode}>{selectionMode ? 'Done selecting' : 'Select classes'}</button>}
        {selectionMode && selectedClassIds.size > 0 && <button className="button button-quiet" type="button" onClick={() => setSelectedClassIds(new Set())}>Clear selection</button>}
      </div>
    </div>

    <div className={styles.matrixWorkspace} data-inspector={showInspector ? 'open' : 'closed'}>
      <div className={styles.matrixMain}>
        {!activeRoot && selectedId && detail.isError && <div className={styles.queryError} role="alert"><p>{apiErrorMessage(detail.error)}</p><button className="button button-quiet" type="button" onClick={() => void detail.refetch()}>Retry class path</button></div>}
        {!activeRoot && selectedId && detail.isPending && <ClassLineageSkeleton />}
        {!activeRoot && selectedId && detail.data && !classRootSlot && <div className={styles.queryError} role="alert"><p>The selected class has no valid root lineage. Choose a class family to continue.</p></div>}
        {!activeRoot && selectedId && detail.data && classRootSlot && overview.isPending && <ClassLineageSkeleton />}
        {!activeRoot && selectedId && detail.data && classRootSlot && overview.data && <div className={styles.queryError} role="alert"><p>The selected class points to a family that is not in the catalog. Choose a class family to continue.</p></div>}
        {!activeRoot && !selectedId && explicitRootSlot && overview.data && <div className={styles.queryError} role="alert"><p>This class family is unavailable. Choose one of the listed roots.</p></div>}
        {activeRoot && lineage.isPending && <ClassLineageSkeleton />}
        {activeRoot && lineage.isError && <div className={styles.queryError} role="alert"><p>{apiErrorMessage(lineage.error)}</p><button className="button button-quiet" type="button" onClick={() => void lineage.refetch()}>Retry class progression</button></div>}
        {activeRoot && lineage.data && !progression && <div className={styles.queryError} role="alert"><p>This lineage did not return the full set of 21 parent-linked slots, so it is not shown as a valid progression.</p><button className="button button-quiet" type="button" onClick={() => void lineage.refetch()}>Reload lineage</button></div>}
        {activeRoot && progression && chroniclePreview && <ChronicleMatrixPreview progression={progression} onInspectClass={inspectClassFromChronicle} />}
        {activeRoot && progression && !chroniclePreview && <ProgressionTree
          progression={progression}
          selectedId={selectedClassId ?? ''}
          params={searchParams}
          noteDrafts={noteDrafts}
          openNoteIds={openNoteIds}
          restoreNoteId={restoreNoteId}
          restoreCursor={returnHandoff?.cursor}
          selectionMode={selectionMode}
          selectedClassIds={selectedClassIds}
          onToggleClassSelection={toggleClassSelection}
          onSelectClass={selectClassFromKeyboard}
          onMoveRoot={moveToAdjacentRoot}
          onCursorRestored={() => setRestoreNoteId(null)}
          onNoteOpenChange={updateNoteOpen}
          onPrepareMentionNavigation={prepareMentionNavigation}
          onNoteDraftChange={updateNoteDraft}
        />}
        {!activeRoot && !selectedId && overview.isPending && <ClassLineageSkeleton />}
      </div>

      {showInspector && <aside className={styles.inspectorColumn} id="class-inspector" aria-label="Selected class inspector">
        <header className={styles.inspectorHeading}>
          <div><span className="eyebrow">{selectionMode ? 'BATCH SELECTION' : 'INSPECT'}</span><h2>{selectionMode ? `${selectedClassIds.size} ${selectedClassIds.size === 1 ? 'class' : 'classes'} selected` : detail.data?.item.name || activeRoot?.name || 'Selected class'}</h2></div>
          {!wideInspector && <button className="button button-quiet" type="button" onClick={() => setInspectorOpen(false)}>Close</button>}
        </header>
        {selectionMode
          ? selectedClassIds.size > 0
            ? <BulkTagAssignment resource="classes" selectedIds={selectedClassIds} />
            : <section className={styles.selectionEmpty}><h3>Choose classes</h3><p>Toggle any class in this progression to review and change direct tags for the selected set.</p></section>
          : <ClassDetail
            id={selectedClassId}
            record={detail.data}
            isPending={Boolean(detailId) && detail.isPending}
            isError={Boolean(detailId) && detail.isError}
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />}
      </aside>}
    </div>

    <details className={styles.classSearch} id="class-search-panel" open={searchOpen} onToggle={event => setSearchOpen(event.currentTarget.open)}>
      <summary><span><strong>Search class records</strong><small>Use the list when you know a name, concept or note</small></span><span className={styles.searchSummaryCount}>{overview.data?.counts.classes ?? '315'} records</span></summary>
      <div className={styles.classSearchBody}>
        <ClassList
          items={list.data?.items}
          next={list.data?.next}
          lineages={overview.data?.lineages.map(item => ({ slot: item.slot, name: item.name })) ?? []}
          loading={list.isPending}
          busy={list.isFetching}
          error={list.isError ? apiErrorMessage(list.error) : undefined}
          onRetry={() => void list.refetch()}
          filterDelay={list.isFetching && list.isPlaceholderData}
        />
      </div>
    </details>

    <span className="sr-only">Signed in as {session.email}</span>
  </section>;
}
