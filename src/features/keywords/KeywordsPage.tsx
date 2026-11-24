import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { hrefWithParams, withoutRecordParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { createKeyword, deleteKeyword, getKeyword, getKeywordList, updateKeyword } from './api';
import type { KeywordItem, KeywordRecord, KeywordReference, KeywordWrite } from './types';
import styles from './keywords.module.css';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';

const schema = z.object({ name: z.string().trim().min(1, 'Enter a keyword name.').max(120), effect: z.string().max(12000) });

export function KeywordsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const createAttempt = useIdempotencyKey();
  const queryString = params.toString();
  const id = params.get('id');
  const creating = params.get('create') === '1' && !id;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const list = useQuery({ queryKey: ['catalog', 'keywords', 'list', queryString], queryFn: ({ signal }) => getKeywordList(new URLSearchParams(queryString), signal), placeholderData: previous => previous });
  const detail = useQuery({ queryKey: ['catalog', 'keywords', 'record', id], queryFn: ({ signal }) => getKeyword(id ?? '', signal), enabled: Boolean(id) });
  useEffect(() => setSearch(params.get('q') ?? ''), [params.get('q')]);

  async function save(input: KeywordWrite): Promise<void> {
    let result;
    if (id && detail.data) result = await updateKeyword(id, detail.data.version, input);
    else {
      result = await createKeyword(input, createAttempt.forPayload(input));
      createAttempt.clear();
    }
    const full = await getKeyword(result.item.id);
    queryClient.setQueryData(['catalog', 'keywords', 'record', result.item.id], full);
    await queryClient.invalidateQueries({ queryKey: ['catalog', 'keywords', 'list'] });
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set('view', 'keywords'); next.set('id', full.item.id); next.set('saved', '1');
      next.delete('create'); next.delete('edit');
      return next;
    });
    await list.refetch();
  }

  async function remove(): Promise<void> {
    if (!id || !detail.data) return;
    await deleteKeyword(id, detail.data.version);
    await queryClient.removeQueries({ queryKey: ['catalog', 'keywords', 'record', id] });
    await queryClient.invalidateQueries({ queryKey: ['catalog', 'keywords', 'list'] });
    setParams(current => withoutRecordParams(current));
  }

  const filtered = Boolean(params.get('q'));
  return <section className={styles.page}>
    <header className={styles.pageHeading}><div><span className="eyebrow">DATABASE <span aria-hidden="true">/</span> GAME GLOSSARY</span><h1>Keywords</h1><p>Maintain shared terms and inspect the class notes and cards that reference them.</p></div><button className="button button-primary" type="button" onClick={() => { createAttempt.clear(); setParams(current => { const next = new URLSearchParams(current); next.set('view', 'keywords'); next.set('create', '1'); next.delete('id'); next.delete('edit'); next.delete('saved'); return next; }); }}>New keyword</button></header>
    <form className={styles.filters} role="search" aria-label="Search keywords" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setParams(current => { const next = new URLSearchParams(current); if (search.trim()) next.set('q', search.trim()); else next.delete('q'); next.delete('after'); next.delete('id'); next.delete('create'); next.delete('edit'); return next; }); }}>
      <label className={styles.searchField}><span aria-hidden="true">⌕</span><span className="sr-only">Search keywords</span><input value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="Search names and definitions" autoComplete="off" /></label><button className="button button-primary" type="submit">Search</button>{filtered && <Link className="button button-quiet" to={hrefWithParams(params, { q: null, after: null, id: null, create: null, edit: null })}>Clear search</Link>}
    </form>
    <div className={styles.workspace} data-selected={Boolean(id || creating)}>
      <KeywordList rows={list.data?.items} next={list.data?.next} params={params} loading={list.isPending} error={list.isError ? apiErrorMessage(list.error) : undefined} retry={() => void list.refetch()} />
      <div className={styles.detailColumn}><KeywordDetail id={id} creating={creating} record={detail.data} pending={detail.isPending} error={detail.isError ? apiErrorMessage(detail.error) : undefined} retry={() => void detail.refetch()} onSave={save} onDelete={remove} onCancel={() => { createAttempt.clear(); setParams(current => withoutRecordParams(current)); }} /></div>
    </div>
  </section>;
}

function KeywordList({ rows, next, params, loading, error, retry }: { rows?: Array<{ id: string; name: string; effect: string }> | undefined; next?: string | null | undefined; params: URLSearchParams; loading: boolean; error?: string | undefined; retry: () => void }) {
  if (loading) return <section className={styles.listPanel} aria-busy="true"><p className="sr-only" role="status">Loading keywords</p><div className={styles.skeletonRows} aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className={styles.skeletonRow} key={index}><b /><span><i /><small /></span></div>)}</div></section>;
  return <section className={styles.listPanel} aria-label="Keyword results"><header className={styles.panelHeading}><div><span className="eyebrow">GLOSSARY RECORDS</span><h2>Results <span className={styles.count}>{rows?.length ?? 0}</span></h2></div><span className={styles.panelNote}>24 per page</span></header>
    {error ? <div className={styles.errorState} role="alert"><p>{error}</p><button className="button button-quiet" type="button" onClick={retry}>Retry keywords</button></div> : <><div className={styles.rows}>{rows?.length ? rows.map(row => <Link className={styles.keywordRow} to={hrefWithParams(params, { view: 'keywords', id: row.id, create: null, edit: null, saved: null })} aria-current={params.get('id') === row.id ? 'true' : undefined} key={row.id}><span className={styles.keywordMark} aria-hidden="true">#</span><span className={styles.rowCopy}><strong>{row.name}</strong><small>{row.effect || 'No definition yet.'}</small></span><span className={styles.rowChevron} aria-hidden="true">›</span></Link>) : <div className={styles.emptyState}><strong>No keywords found</strong><p>Try another search or add a shared game term.</p></div>}</div>{next && <Link className={styles.nextPage} to={hrefWithParams(params, { after: next, id: null, create: null, edit: null })}>Next page <span aria-hidden="true">→</span></Link>}</>}
  </section>;
}

function KeywordDetail(props: { id: string | null; creating: boolean; record?: KeywordRecord | undefined; pending: boolean; error?: string | undefined; retry: () => void; onSave: (input: KeywordWrite) => Promise<void>; onDelete: () => Promise<void>; onCancel: () => void }) {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(false);
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { id, creating, record } = props;
  const item = record?.item;
  useEffect(() => { setEditing(false); setDeletePrompt(false); setActionError(''); }, [id, creating]);
  if (!id && !creating) return <section className={`${styles.detailPanel} ${styles.placeholder}`}><span aria-hidden="true">#</span><h2>Choose a keyword</h2><p>Inspect where a shared term appears before changing its definition.</p></section>;
  if (id && props.pending) return <section className={styles.detailPanel} aria-busy="true"><p className="sr-only" role="status">Loading keyword</p><div className={styles.detailSkeleton} aria-hidden="true"><i /><b /><span /><span /></div></section>;
  if (id && (props.error || !record)) return <section className={styles.detailPanel} role="alert"><h2>Keyword unavailable</h2><p>{props.error}</p><button className="button button-quiet" type="button" onClick={props.retry}>Retry keyword</button></section>;
  async function deleteRecord() { setDeleting(true); setActionError(''); try { await props.onDelete(); } catch (error) { setActionError(apiErrorMessage(error)); } finally { setDeleting(false); setDeletePrompt(false); } }
  if (creating || editing) return <section className={styles.detailPanel}><div className={styles.detailTopline}><button className={styles.backLink} type="button" onClick={props.onCancel}>← <span>All keywords</span></button><span className="eyebrow">{creating ? 'NEW ENTRY' : 'EDITING'}</span></div>{actionError && <p className={styles.errorNotice} role="alert">{actionError}</p>}<KeywordEditor item={editing ? item : undefined} onSave={async input => { await props.onSave(input); setEditing(false); }} onCancel={() => { setEditing(false); props.onCancel(); }} /></section>;
  const saved = params.get('saved') === '1';
  return <article className={styles.detailPanel} aria-labelledby="keyword-detail-title"><div className={styles.detailTopline}><Link className={styles.backLink} to={hrefWithParams(withoutRecordParams(params), { view: 'keywords' })}>← <span>All keywords</span></Link><span className="eyebrow">REFERENCE TERM</span></div>{saved && <p className={styles.successNotice} role="status">Keyword saved. Its reference list is current.</p>}<header className={styles.keywordHero}><span aria-hidden="true">#</span><div><h2 id="keyword-detail-title">{item?.name}</h2><small>{record?.references.length ?? 0} references found</small></div><button className="button button-primary" type="button" onClick={() => setEditing(true)}>Edit keyword</button></header><section className={styles.definition}><span className={styles.fieldCaption}>DEFINITION</span><p>{item?.effect || 'No definition yet.'}</p></section><section className={styles.references}><header><div><span className="eyebrow">BACKLINKS</span><h3>Used in</h3></div><span className={styles.count}>{record?.references.length ?? 0}</span></header>{record?.references.length ? <ul>{record.references.map(reference => <ReferenceLink reference={reference} key={`${reference.table}:${reference.id}`} />)}</ul> : <p className={styles.noReferences}>No matching class notes or card text found. Deleting this keyword will remove only the glossary entry, not rewrite game content.</p>}</section>{record?.references.length ? <p className={styles.referenceNote}>Backlinks help locate matching text. Removing this glossary record does not alter classes or cards.</p> : null}{actionError && <p className={styles.errorNotice} role="alert">{actionError}</p>}{deletePrompt ? <section className={styles.deletePrompt} role="alert"><h3>Delete “{item?.name}” from the glossary?</h3><p>Referenced class notes and cards will keep their current text.</p><button className="button button-quiet" type="button" disabled={deleting} onClick={() => setDeletePrompt(false)}>Keep keyword</button><button className="button button-danger" type="button" disabled={deleting} onClick={() => void deleteRecord()}>{deleting ? 'Deleting…' : 'Delete glossary entry'}</button></section> : <div className={styles.deleteArea}><button className="button button-quiet" type="button" onClick={() => setDeletePrompt(true)}>Delete glossary entry</button></div>}</article>;
}

function ReferenceLink({ reference }: { reference: KeywordReference }) {
  const route = reference.table === 'classes' ? 'classes' : 'cards';
  const label = reference.table === 'classes' ? 'Class' : 'Card';
  return <li><Link to={`/?view=${route}&id=${encodeURIComponent(reference.id)}`}><span><strong>{reference.name || '(unnamed record)'}</strong><small>{label}</small></span><span aria-hidden="true">↗</span></Link></li>;
}

function KeywordEditor({ item, onSave, onCancel }: { item?: KeywordItem | undefined; onSave: (input: KeywordWrite) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [effect, setEffect] = useState(item?.effect ?? '');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = name !== (item?.name ?? '') || effect !== (item?.effect ?? '');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const result = schema.safeParse({ name, effect });
    if (!result.success) { setFieldError(result.error.issues[0]?.message ?? 'Check the keyword fields.'); return; }
    setSaving(true); setError('');
    try { await onSave(result.data); } catch (failure) { setError(apiErrorMessage(failure)); } finally { setSaving(false); }
  }
  return <form className={styles.editor} onSubmit={submit}><header><div><span className="eyebrow">{item ? 'GLOSSARY ENTRY' : 'NEW KEYWORD'}</span><h3>{item ? 'Edit keyword' : 'Add a keyword'}</h3></div></header>{error && <p className={styles.errorNotice} role="alert">{error}</p>}<label className={styles.field}>Keyword name<input value={name} onChange={event => { setName(event.currentTarget.value); setFieldError(''); }} maxLength={120} autoFocus autoComplete="off" />{fieldError && <small role="alert">{fieldError}</small>}</label><label className={styles.field}>Definition<textarea value={effect} onChange={event => { setEffect(event.currentTarget.value); setFieldError(''); }} rows={8} maxLength={12000} /><small>Definitions are searched with cards and class notes.</small></label>{discard && <div className={styles.deletePrompt} role="alert"><p>Discard unsaved changes?</p><button className="button button-quiet" type="button" onClick={() => setDiscard(false)}>Continue editing</button><button className="button button-danger" type="button" onClick={onCancel}>Discard</button></div>}<footer className={styles.formActions}><span>{dirty ? 'Unsaved changes' : 'Ready to save'}</span><button className="button button-quiet" type="button" onClick={() => dirty ? setDiscard(true) : onCancel()}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : item ? 'Save keyword' : 'Create keyword'}</button></footer></form>;
}
