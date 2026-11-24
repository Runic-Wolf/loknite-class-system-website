import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hrefWithParams, withoutRecordParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { getClass } from '../classes/api';
import { getCard } from '../cards/api';
import { SkillEditor } from './SkillEditor';
import { createSkill, deleteSkill, duplicateSkill, findClasses, getSkill, getSkillList, updateSkill } from './api';
import type { ClassOption, SkillItem, SkillKind, SkillRecord, SkillRow, SkillWrite } from './types';
import styles from './skills.module.css';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';

const kinds: SkillKind[] = ['Passive', 'Active', 'Signature', 'Ultimate'];

function classOption(item: { id: string; name: string; tier: ClassOption['tier']; slot: string }, icon: string | null): ClassOption {
  return { id: item.id, name: item.name, tier: item.tier, slot: item.slot, icon };
}

export function SkillsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const createAttempt = useIdempotencyKey();
  const duplicateAttempt = useIdempotencyKey();
  const queryString = params.toString();
  const id = params.get('id');
  const creating = params.get('create') === '1' && !id;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [classSearch, setClassSearch] = useState('');
  const [chosenClass, setChosenClass] = useState<ClassOption | undefined>();
  const deferredClassSearch = useDeferredValue(classSearch.trim());
  const list = useQuery({ queryKey: ['catalog', 'skills', 'list', queryString], queryFn: ({ signal }) => getSkillList(new URLSearchParams(queryString), signal), placeholderData: previous => previous });
  const detail = useQuery({ queryKey: ['catalog', 'skills', 'record', id], queryFn: ({ signal }) => getSkill(id ?? '', signal), enabled: Boolean(id) });
  const selectedClassId = detail.data?.item.classId ?? params.get('class') ?? '';
  const selectedClass = useQuery({ queryKey: ['catalog', 'classes', 'record', selectedClassId], queryFn: ({ signal }) => getClass(selectedClassId, signal), enabled: Boolean(selectedClassId) });
  const classCandidates = useQuery({
    queryKey: ['catalog', 'classes', 'picker', deferredClassSearch],
    queryFn: ({ signal }) => findClasses(deferredClassSearch, signal),
    enabled: deferredClassSearch.length >= 2,
    staleTime: 30_000,
  });
  const card = useQuery({ queryKey: ['catalog', 'cards', 'record', detail.data?.item.cardId], queryFn: ({ signal }) => getCard(detail.data!.item.cardId, signal), enabled: Boolean(detail.data?.item.cardId) });
  const selectedClassOption = chosenClass?.id === selectedClassId ? chosenClass : selectedClass.data ? classOption(selectedClass.data.item, selectedClass.data.icon) : undefined;
  useEffect(() => setSearch(params.get('q') ?? ''), [params.get('q')]);

  function updateParams(values: Record<string, string | null | undefined>) {
    setParams(current => hrefParams(current, values));
  }

  async function save(input: SkillWrite): Promise<void> {
    let saved;
    if (id && detail.data) saved = await updateSkill(id, detail.data.version, input);
    else {
      saved = await createSkill(input, createAttempt.forPayload(input));
      createAttempt.clear();
    }
    queryClient.setQueryData(['catalog', 'skills', 'record', saved.item.id], saved);
    await queryClient.invalidateQueries({ queryKey: ['catalog', 'skills', 'list'], refetchType: 'none' });
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set('view', 'database'); next.set('entity', 'skills'); next.set('id', saved.item.id); next.set('class', saved.item.classId); next.set('saved', '1');
      next.delete('create'); next.delete('edit');
      return next;
    });
  }

  async function remove(disposition: 'keep-card' | 'delete-card') {
    if (!id || !detail.data) return;
    await deleteSkill(id, detail.data.version, disposition);
    await queryClient.removeQueries({ queryKey: ['catalog', 'skills', 'record', id] });
    await list.refetch();
    setParams(current => withoutRecordParams(current));
  }

  async function duplicate() {
    if (!id || !detail.data) throw new Error('Open a skill before duplicating it.');
    const saved = await duplicateSkill(id, detail.data.version, duplicateAttempt.forPayload({ id, version: detail.data.version }));
    duplicateAttempt.clear();
    queryClient.setQueryData(['catalog', 'skills', 'record', saved.item.id], saved);
    await queryClient.invalidateQueries({ queryKey: ['catalog', 'skills', 'list'] });
    await list.refetch();
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set('view', 'database'); next.set('entity', 'skills'); next.set('id', saved.item.id); next.set('class', saved.item.classId); next.set('saved', '1');
      for (const key of ['create', 'edit', 'after', 'error']) next.delete(key);
      return next;
    });
  }

  const filtered = Boolean(params.get('q') || params.get('kind') || params.get('class'));
  return <section className={styles.page}>
    <header className={styles.pageHeading}>
      <div><span className="eyebrow">DATABASE <span aria-hidden="true">/</span> CLASS SKILLS</span><h1>Skills</h1><p>Skills stay linked to their class and generate a companion card record.</p></div>
      <button className="button button-primary" type="button" onClick={() => { createAttempt.clear(); updateParams({ view: 'database', entity: 'skills', create: '1', id: null, edit: null, saved: null }); }}>New skill</button>
    </header>
    <form className={styles.filters} role="search" aria-label="Filter skills" onSubmit={event => { event.preventDefault(); updateParams({ q: search.trim() || null, after: null, id: null, create: null, edit: null }); }}>
      <label className={styles.searchField}><span aria-hidden="true">⌕</span><span className="sr-only">Search skills</span><input value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="Search names and studio notes" autoComplete="off" /></label>
      <label className={styles.selectField}><span className="sr-only">Filter by kind</span><select aria-label="Filter by skill kind" value={params.get('kind') ?? ''} onChange={event => updateParams({ kind: event.currentTarget.value || null, after: null, id: null, create: null })}><option value="">All kinds</option>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <button className="button button-primary" type="submit">Search</button>
      {filtered && <Link className="button button-quiet" to={hrefWithParams(params, { q: null, kind: null, class: null, after: null, id: null, create: null, edit: null })}>Clear filters</Link>}
    </form>
    {params.get('class') && !creating && <div className={styles.classScope}><span>Class filter: <strong>{selectedClassOption?.name ?? (selectedClass.isPending ? 'Loading class…' : 'Selected class')}</strong></span><button className="button button-quiet" type="button" onClick={() => updateParams({ class: null, after: null, id: null })}>Clear class</button></div>}
    <div className={styles.workspace} data-selected={Boolean(id || creating)}>
      <SkillsList rows={list.data?.items} next={list.data?.next} params={params} loading={list.isPending} error={list.isError ? apiErrorMessage(list.error) : undefined} retry={() => void list.refetch()} onFilterClass={row => updateParams({ view: 'database', entity: 'skills', class: row.classId, after: null, id: null, create: null })} />
      <div className={styles.detailColumn}>
        <SkillDetail id={id} creating={creating} record={detail.data} pending={detail.isPending} error={detail.isError ? apiErrorMessage(detail.error) : undefined} retry={() => void detail.refetch()} cardStatus={card.data?.item.status} onSave={save} onRemove={remove} onDuplicate={duplicate} onCancel={() => { createAttempt.clear(); setParams(current => withoutRecordParams(current)); }} classOption={selectedClassOption} classSearch={classSearch} classCandidates={classCandidates.data?.items ?? []} searchingClasses={classCandidates.isFetching || Boolean(selectedClassId && selectedClass.isPending)} classError={classCandidates.isError ? apiErrorMessage(classCandidates.error) : undefined} onClassSearch={setClassSearch} onChooseClass={option => { setChosenClass(option); updateParams({ class: option?.id ?? null, after: null }); setClassSearch(''); }} />
      </div>
    </div>
  </section>;
}

function hrefParams(current: URLSearchParams, values: Record<string, string | null | undefined>): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(values)) { if (!value) next.delete(key); else next.set(key, value); }
  return next;
}

function SkillsList({ rows, next, params, loading, error, retry, onFilterClass }: { rows?: SkillRow[] | undefined; next?: string | null | undefined; params: URLSearchParams; loading: boolean; error?: string | undefined; retry: () => void; onFilterClass: (row: SkillRow) => void }) {
  if (loading) return <section className={styles.listPanel} aria-busy="true"><p className="sr-only" role="status">Loading skills</p><div className={styles.skeletonRows} aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className={styles.skeletonRow} key={index}><i /><span><b /><small /></span></div>)}</div></section>;
  return <section className={styles.listPanel} aria-label="Skill results">
    <header className={styles.panelHeading}><div><span className="eyebrow">SKILL RECORDS</span><h2>Results <span className={styles.count}>{rows?.length ?? 0}</span></h2></div><span className={styles.panelNote}>24 per page</span></header>
    {error ? <div className={styles.errorState} role="alert"><p>{error}</p><button className="button button-quiet" type="button" onClick={retry}>Retry skills</button></div> : <>
      <div className={styles.rows}>{rows?.length ? rows.map(row => <SkillRowLink row={row} params={params} key={row.id} onFilterClass={() => onFilterClass(row)} />) : <div className={styles.emptyState}><strong>No skills found</strong><p>Try another search or create a skill for a class.</p></div>}</div>
      {next && <Link className={styles.nextPage} to={hrefWithParams(params, { after: next, id: null, create: null, edit: null })}>Next page <span aria-hidden="true">→</span></Link>}
    </>}
  </section>;
}

function SkillRowLink({ row, params, onFilterClass }: { row: SkillRow; params: URLSearchParams; onFilterClass: () => void }) {
  return <div className={styles.skillRowWrap}>
    <Link className={styles.skillRow} to={hrefWithParams(params, { view: 'database', entity: 'skills', id: row.id, class: row.classId, create: null, edit: null, saved: null })} aria-current={params.get('id') === row.id ? 'true' : undefined}>
      <span className={styles.classIcon}>{row.icon ? <img src={row.icon} width="42" height="42" alt="" loading="lazy" /> : '◇'}</span>
      <span className={styles.rowCopy}><strong>{row.name || '(unnamed skill)'}</strong><small>{row.kind} <i aria-hidden="true">·</i> {row.className} <i aria-hidden="true">·</i> {row.slot}</small>{row.tags.length > 0 && <span>{row.tags.slice(0, 3).join(' · ')}</span>}</span>
      <span className={styles.rowChevron} aria-hidden="true">›</span>
    </Link>
    <button className={styles.filterClass} type="button" onClick={onFilterClass} aria-label={`Filter skills by ${row.className}`}>Filter class</button>
  </div>;
}

function SkillDetail(props: {
  id: string | null; creating: boolean; record?: SkillRecord | undefined; pending: boolean; error?: string | undefined; retry: () => void; cardStatus?: string | undefined;
  onSave: (input: SkillWrite) => Promise<void>; onRemove: (disposition: 'keep-card' | 'delete-card') => Promise<void>; onDuplicate: () => Promise<void>; onCancel: () => void;
  classOption?: ClassOption | undefined; classSearch: string; classCandidates: ClassOption[]; searchingClasses: boolean; classError?: string | undefined;
  onClassSearch: (query: string) => void; onChooseClass: (option: ClassOption | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const { id, creating, record } = props;
  const item = record?.item;

  useEffect(() => { setEditing(false); setDeletePrompt(false); setActionError(''); }, [id, creating]);
  if (!id && !creating) return <section className={`${styles.detailPanel} ${styles.detailPlaceholder}`}><span className={styles.placeholderGlyph} aria-hidden="true">↖</span><h2>Choose a skill</h2><p>Open a skill to inspect its class, notes and linked card.</p></section>;
  if (id && props.pending) return <section className={styles.detailPanel} aria-busy="true"><p className="sr-only" role="status">Loading skill</p><div className={styles.detailSkeleton} aria-hidden="true"><i /><b /><span /><span /><span /></div></section>;
  if (id && (props.error || !record)) return <section className={styles.detailPanel} role="alert"><h2>Skill unavailable</h2><p>{props.error}</p><button className="button button-quiet" type="button" onClick={props.retry}>Retry skill</button></section>;

  async function remove(disposition: 'keep-card' | 'delete-card') {
    setDeleting(true); setActionError('');
    try { await props.onRemove(disposition); }
    catch (error) { setActionError(apiErrorMessage(error)); }
    finally { setDeleting(false); setDeletePrompt(false); }
  }

  async function duplicate() {
    setDuplicating(true); setActionError('');
    try { await props.onDuplicate(); }
    catch (error) { setActionError(apiErrorMessage(error)); }
    finally { setDuplicating(false); }
  }

  if (creating || editing) return <section className={styles.detailPanel}>
    <div className={styles.detailTopline}><button className={styles.backLink} type="button" onClick={props.onCancel}>← <span>All skills</span></button><span className="eyebrow">{creating ? 'NEW RECORD' : 'EDITING'}</span></div>
    {actionError && <p className={styles.errorNotice} role="alert">{actionError}</p>}
    <SkillEditor item={editing ? item : undefined} classOption={props.classOption} classSearch={props.classSearch} classCandidates={props.classCandidates} searchingClasses={props.searchingClasses} classError={props.classError} onClassSearch={props.onClassSearch} onChooseClass={props.onChooseClass} onSave={async input => { await props.onSave(input); setEditing(false); }} onCancel={() => { setEditing(false); props.onCancel(); }} />
  </section>;

  const saved = new URLSearchParams(window.location.search).get('saved') === '1';
  return <article className={styles.detailPanel} aria-labelledby="skill-detail-title">
    <div className={styles.detailTopline}><Link className={styles.backLink} to={hrefWithParams(withoutRecordParams(new URLSearchParams(window.location.search)), { view: 'database', entity: 'skills' })}><span aria-hidden="true">←</span><span>All skills</span></Link><span className={styles.kindBadge}>{item?.kind}</span></div>
    {saved && <p className={styles.successNotice} role="status">Skill saved. Its linked card was updated in the same database transaction.</p>}
    <header className={styles.skillHero}><span className={styles.classIconLarge}>{props.classOption?.icon ? <img src={props.classOption.icon} alt="" /> : '◇'}</span><div><span className="eyebrow">{props.classOption?.slot} <i aria-hidden="true">·</i> {props.classOption?.name}</span><h2 id="skill-detail-title">{item?.name || '(unnamed skill)'}</h2><p>{item?.kind} skill</p></div><div className={styles.detailActions}><button className="button button-quiet" type="button" disabled={duplicating} onClick={() => void duplicate()}>{duplicating ? 'Duplicating…' : 'Duplicate skill'}</button><button className="button button-primary" type="button" onClick={() => setEditing(true)}>Edit skill</button></div></header>
    {actionError && <p className={styles.errorNotice} role="alert">{actionError}</p>}
    <DetailCopy label="STUDIO NOTES" text={item?.lcsNotes ?? ''} fallback="No studio notes yet." />
    <DetailCopy label="MOBILE NOTES" text={item?.mobileNotes ?? ''} fallback="No mobile notes yet." />
    <div className={styles.tags} aria-label="Skill tags">{item?.tags.length ? item.tags.map(tag => <span key={tag}>{tag}</span>) : <small>No tags assigned</small>}</div>
    <section className={styles.linkedCard}><div><span className="eyebrow">LINKED CARD</span><strong>{item?.name || '(unnamed skill)'}</strong><small>{props.cardStatus === 'CONFIRMADO' ? 'Confirmed' : props.cardStatus ? 'Draft' : 'Card status unavailable'}</small></div>{item?.cardId && <Link className="button button-quiet" to={`/?view=cards&id=${encodeURIComponent(item.cardId)}`}>Open card <span aria-hidden="true">↗</span></Link>}</section>
    {deletePrompt ? <section className={styles.deletePrompt} role="alert"><h3>Delete this skill?</h3><p>The linked card is {props.cardStatus === 'CONFIRMADO' ? 'confirmed and must be kept as an independent card.' : 'a draft. Choose whether to keep it.'}</p><button className="button button-quiet" type="button" disabled={deleting} onClick={() => setDeletePrompt(false)}>Cancel</button><button className="button button-quiet" type="button" disabled={deleting} onClick={() => void remove('keep-card')}>Keep linked card</button>{props.cardStatus !== 'CONFIRMADO' && <button className="button button-danger" type="button" disabled={deleting} onClick={() => void remove('delete-card')}>{deleting ? 'Deleting…' : 'Delete skill and draft card'}</button>}</section> : <div className={styles.deleteArea}><button className="button button-quiet" type="button" onClick={() => setDeletePrompt(true)}>Delete skill</button></div>}
  </article>;
}

function DetailCopy({ label, text, fallback }: { label: string; text: string; fallback: string }) {
  return <section className={styles.detailCopy}><span className={styles.fieldCaption}>{label}</span><p>{text || fallback}</p></section>;
}
