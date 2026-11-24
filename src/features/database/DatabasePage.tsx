import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, catalogPath } from '../../app/api';
import { hrefWithParams } from '../../app/urls';
import { getOverview } from '../classes/api';
import type { CatalogOverview } from '../classes/types';
import { classQueryDefaults, classQueryToSearchParams, readClassQuery, type ClassQuery } from '../../../shared/class-query.js';
import { apiErrorMessage } from '../../ui/feedback';
import { TagFilter } from '../tags/TagFilter';
import { ClassQueryBuilder } from './ClassQueryBuilder';
import { CatalogTable, ColumnSettings, columnsFor, recordResultUrl, type CatalogResult, type DatabaseResource, type ResultPage } from './DatabaseTable';
import { BulkTagAssignment } from './BulkTagAssignment';
import { ExportCsvButton } from './ExportCsvButton';
import { SavedQueries } from './SavedQueries';
import styles from './database.module.css';

type Resource = DatabaseResource | 'all';
const columnPreferenceKey = 'loknite.database.columns.v1';
const resourceLabels: Record<DatabaseResource, string> = { classes: 'Classes', cards: 'Cards', skills: 'Skills', keywords: 'Keywords' };

function readColumnPreferences(): Partial<Record<DatabaseResource, string[]>> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(columnPreferenceKey) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([resource, keys]) =>
      ['classes', 'cards', 'skills', 'keywords'].includes(resource) && Array.isArray(keys) && keys.every(key => typeof key === 'string'))
      .map(([resource, keys]) => [resource, [...new Set((keys as string[]).slice(0, 16))]])) as Partial<Record<DatabaseResource, string[]>>;
  } catch { return {}; }
}

function searchUrl(resource: Resource, query: string): string {
  const params = new URLSearchParams({ view: resource === 'keywords' ? 'keywords' : resource === 'skills' ? 'database' : resource, q: query });
  if (resource === 'skills') params.set('entity', 'skills');
  return `/?${params}`;
}

export function DatabasePage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') ?? '');
  const [columnPreferences, setColumnPreferences] = useState(readColumnPreferences);
  const [selection, setSelection] = useState<{ scope: string; ids: Set<string> }>({ scope: '', ids: new Set() });
  const q = params.get('q')?.trim() ?? '';
  const rawType = params.get('type') ?? 'all';
  const selected = (['classes', 'cards', 'skills', 'keywords'].includes(rawType) ? rawType : 'all') as Resource | 'all';
  const parsedQuery = readQuerySafely(params);
  const classQuery = parsedQuery.query;
  const selectedTags = classQuery.rules.filter(rule => rule.field === 'tag').map(rule => rule.value);
  const tagSource = classQuery.source;
  const searchQuery = q;
  const selectionScope = JSON.stringify({ resource: selected, query: searchQuery, classQuery: ['classes', 'skills'].includes(selected) ? classQuery : null });
  const selectedIds = selection.scope === selectionScope ? selection.ids : new Set<string>();
  const overview = useQuery({ queryKey: ['catalog', 'overview'], queryFn: ({ signal }) => getOverview(signal) });
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    try { localStorage.setItem(columnPreferenceKey, JSON.stringify(columnPreferences)); } catch { /* Table layout remains available for this session. */ }
  }, [columnPreferences]);

  function visibleColumns(resource: DatabaseResource): Set<string> {
    const allowed = new Set(columnsFor(resource).map(column => column.key));
    return new Set([...(columnPreferences[resource] ?? [...allowed]).filter(key => allowed.has(key)), 'name']);
  }

  function toggleColumn(resource: DatabaseResource, key: string, visible: boolean) {
    const allowed = new Set(columnsFor(resource).map(column => column.key));
    if (!allowed.has(key) || key === 'name') return;
    setColumnPreferences(current => {
      const next = new Set(current[resource] ?? [...allowed]);
      if (visible) next.add(key); else next.delete(key);
      next.add('name');
      return { ...current, [resource]: [...next] };
    });
  }

  function updateClassQuery(update: ClassQuery | ((current: ClassQuery) => ClassQuery)) {
    setParams(current => {
      const previous = readQuerySafely(current).query;
      const nextQuery = typeof update === 'function' ? update(previous) : update;
      const next = classQueryToSearchParams(nextQuery, current);
      next.set('view', 'database');
      next.delete('entity');
      return next;
    });
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(params);
    const value = draft.trim();
    if (value) next.set('q', value); else next.delete('q');
    next.set('view', 'database'); next.delete('entity'); next.delete('id'); next.delete('after');
    setParams(next);
  }

  return <section className={styles.page}>
    <header className={styles.pageHeading}><div><span className="eyebrow">WORKSPACE <span aria-hidden="true">/</span> DATABASE</span><h1>{selected === 'all' ? 'Find anything' : `${resourceLabels[selected]} database`}</h1><p>{selected === 'all' ? 'Search across class names and notes, card rules, skills, and glossary entries.' : `Browse and search the ${resourceLabels[selected].toLowerCase()} catalog. Open a record to continue in its workspace.`}</p></div></header>
    <form className={styles.searchPanel} role="search" aria-label="Search the catalog" onSubmit={search}>
      <label className={styles.searchField}><span aria-hidden="true">⌕</span><span className="sr-only">Search the catalog</span><input value={draft} onChange={event => setDraft(event.currentTarget.value)} placeholder="Search the catalog" autoComplete="off" autoFocus /></label>
      <label className={styles.typeSelect}><span className="sr-only">Search in resource type</span><select aria-label="Search in resource type" value={selected} onChange={event => { const type = event.currentTarget.value; setParams(current => { const next = new URLSearchParams(current); if (type === 'all') next.delete('type'); else next.set('type', type); for (const key of ['after', 'id', 'sort', 'dir']) next.delete(key); if (type !== 'classes' && type !== 'skills') { next.delete('tag'); next.delete('tagSource'); next.delete('where'); } return next; }); }}><option value="all">All records</option>{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <button className="button button-primary" type="submit">Search</button>
    </form>
    {(selected === 'classes' || selected === 'skills') && <div className={styles.classQuery}>
      {!parsedQuery.valid && <p className={styles.queryWarning} role="alert">This saved query is invalid. <button className="button button-quiet" type="button" onClick={() => updateClassQuery(classQueryDefaults)}>Reset query</button></p>}
      <TagFilter scope="classes" logic={classQuery.logic} values={selectedTags} onChange={tags => updateClassQuery(current => {
        const otherRules = current.rules.filter(rule => rule.field !== 'tag');
        const priorTags = new Map(current.rules.filter(rule => rule.field === 'tag').map(rule => [rule.value, rule]));
        const tagRules = tags.map(tag => priorTags.get(tag) ?? { field: 'tag' as const, value: tag, enabled: true, exclude: false });
        return { ...current, rules: [...otherRules, ...tagRules] };
      })} />
      <label className={styles.tagSource}><span>Class tag source</span><select aria-label="Class tag source" value={tagSource} onChange={event => { const source = event.currentTarget.value as ClassQuery['source']; updateClassQuery(current => ({ ...current, source })); }}><option value="effective">Effective · class and available skills</option><option value="direct">Direct · tags on this class</option></select></label>
      <div className={styles.queryBuilder}><ClassQueryBuilder query={classQuery} onChange={updateClassQuery} /></div>
      <div className={styles.savedQueries}><SavedQueries query={classQuery} onApply={updateClassQuery} /></div>
      {classQuery.rules.length > 0 && <button className="button button-quiet" type="button" onClick={() => updateClassQuery(current => ({ ...current, rules: [] }))}>Clear rules</button>}
    </div>}
    {selected !== 'all' || searchQuery.length > 0
      ? <SearchResults query={searchQuery} selected={selected} classQuery={classQuery} params={params} selectedIds={selectedIds} onSelectionChange={ids => setSelection({ scope: selectionScope, ids })} visibleColumnKeys={selected === 'all' ? undefined : visibleColumns(selected)} onToggleColumn={selected === 'all' ? undefined : (key, visible) => toggleColumn(selected, key, visible)} onSort={field => setParams(current => {
        const next = new URLSearchParams(current);
        const direction = current.get('sort') === field && current.get('dir') !== 'desc' ? 'desc' : 'asc';
        next.set('sort', field); next.set('dir', direction); next.delete('after');
        return next;
      })} />
      : <DatabaseOverview data={overview.data} loading={overview.isPending} error={overview.isError ? apiErrorMessage(overview.error) : undefined} />}
  </section>;
}

function DatabaseOverview({ data, loading, error }: { data?: CatalogOverview | undefined; loading: boolean; error?: string | undefined }) {
  if (loading) return <section className={styles.overviewGrid} aria-busy="true"><p className="sr-only" role="status">Loading database links</p>{Array.from({ length: 4 }, (_, index) => <div className={styles.overviewSkeleton} key={index}><i /><b /><small /></div>)}</section>;
  if (error || !data) return <section className={styles.errorState} role="alert"><h2>Database overview unavailable</h2><p>{error}</p><Link className="button button-quiet" to="/?view=overview">Open workspace overview</Link></section>;
  const counts = [
    { resource: 'classes' as const, value: data.counts.classes, hint: 'progression slots' },
    { resource: 'cards' as const, value: data.counts.cards, hint: 'game cards' },
    { resource: 'skills' as const, value: data.counts.skills, hint: 'class skills' },
    { resource: 'keywords' as const, value: data.counts.keywords, hint: 'glossary terms' },
  ];
  return <>
    <section className={styles.overviewGrid} aria-label="Database collections">{counts.map(item => <Link className={styles.collectionCard} key={item.resource} to={searchUrl(item.resource, '')}><span className="eyebrow">{resourceLabels[item.resource]}</span><strong>{item.value.toLocaleString()}</strong><small>{item.hint}</small><span aria-hidden="true">↗</span></Link>)}</section>
    <section className={styles.quickLinks}><header><span className="eyebrow">COMMON TASKS</span><h2>Open a workspace</h2></header><div><Link to="/?view=classes">Class Matrix <span>Browse lineages, notes, and tags</span><b aria-hidden="true">↗</b></Link><Link to="/?view=cards">Card Gallery <span>Review artwork, rules, and status</span><b aria-hidden="true">↗</b></Link><Link to="/?view=database&entity=skills">Skills <span>Create skills linked to class cards</span><b aria-hidden="true">↗</b></Link><Link to="/?view=keywords">Keyword List <span>Definitions and backlinks</span><b aria-hidden="true">↗</b></Link></div></section>
  </>;
}

function SearchResults({ query, selected, classQuery, params, selectedIds, onSelectionChange, visibleColumnKeys, onToggleColumn, onSort }: { query: string; selected: Resource; classQuery: ClassQuery; params: URLSearchParams; selectedIds: ReadonlySet<string>; onSelectionChange: (ids: Set<string>) => void; visibleColumnKeys?: ReadonlySet<string> | undefined; onToggleColumn?: ((key: string, visible: boolean) => void) | undefined; onSort: (field: string) => void }) {
  const resources: DatabaseResource[] = selected === 'all' ? ['classes', 'cards', 'skills', 'keywords'] : [selected];
  const activeRules = classQuery.rules.filter(rule => rule.enabled);
  const tags = activeRules.filter(rule => rule.field === 'tag').map(rule => rule.value);
  const after = selected !== 'all' ? params.get('after') ?? undefined : undefined;
  const sort = params.get('sort') ?? 'name';
  const direction = params.get('dir') === 'desc' ? 'desc' : 'asc';
  const results = useQuery({
    queryKey: ['catalog', 'database-search', query, selected, classQuery, after, sort, direction],
    queryFn: async ({ signal }) => {
      const entries = await Promise.all(resources.map(async resource => {
        const page = await apiRequest<ResultPage>(catalogPath(resource, {
          q: query || undefined,
          where: selected === resource && (resource === 'classes' || resource === 'skills') && (classQuery.rules.length || classQuery.scope) ? JSON.stringify(classQuery) : undefined,
          after: selected === resource ? after : undefined,
          sort: selected === resource ? sort : undefined,
          dir: selected === resource ? direction : undefined,
          limit: selected === 'all' ? 6 : 24,
        }), { signal });
        return [resource, page] as const;
      }));
      return Object.fromEntries(entries) as Partial<Record<Resource, ResultPage>>;
    },
  });
  if (results.isPending) return selected === 'all'
    ? <section className={styles.resultsGrid} aria-busy="true"><p className="sr-only" role="status">Searching catalog</p>{Array.from({ length: 4 }, (_, index) => <div className={styles.resultSkeleton} key={index}><i /><b /><small /><small /></div>)}</section>
    : <CatalogTable resource={selected} rows={[]} loading sort={sort} direction={direction} visibleColumnKeys={visibleColumnKeys} />;
  if (results.isError) return <section className={styles.errorState} role="alert"><h2>Search could not finish</h2><p>{apiErrorMessage(results.error)}</p><button className="button button-quiet" type="button" onClick={() => void results.refetch()}>Retry search</button></section>;
  const groups = resources.map(resource => ({ resource, items: results.data[resource]?.items ?? [] }));
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  if (selected !== 'all') {
    const page = results.data[selected] ?? { items: [], next: null };
    const heading = query ? `“${query}”` : activeRules.length ? `${activeRules.length} rule${activeRules.length === 1 ? '' : 's'} · ${classQuery.logic}` : `All ${resourceLabels[selected].toLowerCase()}`;
    return <section className={styles.resultsSection} aria-label={`${resourceLabels[selected]} records`}>
      <header className={styles.resultsHeading}><div><span className="eyebrow">{resourceLabels[selected].toUpperCase()} RECORDS</span><h2>{heading}</h2></div><span>{page.items.length} record{page.items.length === 1 ? '' : 's'} on this page</span></header>
      {page.items.length === 0
        ? <div className={styles.emptyState}><strong>{query || activeRules.length ? 'No records match these filters' : `No ${resourceLabels[selected].toLowerCase()} yet`}</strong><p>{query || activeRules.length ? 'Try a shorter term, a different spelling, or adjust the query rules.' : 'Records will appear here when they are available in the workspace.'}</p></div>
        : <>
          <div className={styles.tableToolbar}>
            <span>Use checkboxes, Shift, Ctrl/Cmd, or row arrow keys to select records.</span>
            <div className={styles.tableToolbarActions}>
              <ExportCsvButton resource={selected} params={params} columns={columnsFor(selected).filter(column => !visibleColumnKeys || visibleColumnKeys.has(column.key)).map(column => column.key)} />
              {visibleColumnKeys && onToggleColumn && <ColumnSettings resource={selected} visibleColumnKeys={visibleColumnKeys} onToggle={onToggleColumn} />}
            </div>
          </div>
          {selectedIds.size > 0 && <>
            <div className={styles.selectionSummary} role="status"><strong>{selectedIds.size} selected</strong><span>in this filtered {resourceLabels[selected].toLowerCase()} result; selection can include other pages.</span><button className="button button-quiet" type="button" onClick={() => onSelectionChange(new Set())}>Clear selection</button></div>
            {selected !== 'keywords' && <BulkTagAssignment resource={selected} selectedIds={selectedIds} />}
          </>}
          <CatalogTable resource={selected} rows={page.items} params={params} query={query} visibleColumnKeys={visibleColumnKeys} sort={sort} direction={direction} onSort={onSort} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
        </>}
      {(after || page.next) && <nav className={styles.pagination} aria-label={`${resourceLabels[selected]} pages`}>
        {after ? <Link className="button button-quiet" to={hrefWithParams(params, { after: null })}>First page</Link> : <span />}
        {page.next && <Link className="button button-quiet" to={hrefWithParams(params, { after: page.next })}>Next page <span aria-hidden="true">→</span></Link>}
      </nav>}
    </section>;
  }
  const heading = query ? `“${query}”` : `${tags.join(' + ')} · effective tags`;
  return <section className={styles.resultsSection} aria-label="Catalog search results"><header className={styles.resultsHeading}><div><span className="eyebrow">CATALOG MATCHES</span><h2>{heading}</h2></div><span>{total} result{total === 1 ? '' : 's'} on this page</span></header>{total === 0 ? <div className={styles.emptyState}><strong>No records match {query ? `“${query}”` : 'the selected tags'}</strong><p>Try a shorter term, a different spelling, or a different tag source.</p></div> : <div className={styles.resultsGrid}>{groups.filter(group => group.items.length).map(group => <ResultGroup key={group.resource} resource={group.resource} query={query} items={group.items} params={params} />)}</div>}</section>;
}

function ResultGroup({ resource, query, items, params }: { resource: DatabaseResource; query: string; items: CatalogResult[]; params: URLSearchParams }) {
  return <section className={styles.resultGroup}><header><div><span className="eyebrow">{resourceLabels[resource]}</span><h3>{items.length} matches</h3></div><Link to={searchUrl(resource, query)}>Open list <span aria-hidden="true">→</span></Link></header><ul>{items.map(item => <li key={item.id}><Link to={recordResultUrl(resource, item.id, query, params)}><span className={styles.resultMark} aria-hidden="true">{resource === 'classes' ? '◇' : resource === 'cards' ? '▤' : resource === 'skills' ? '✦' : '#'}</span><span className={styles.resultCopy}><strong>{item.name || '(unnamed record)'}</strong><small>{descriptionFor(resource, item)}</small></span><span aria-hidden="true">↗</span></Link></li>)}</ul></section>;
}

function descriptionFor(resource: Resource, item: CatalogResult): string {
  if (resource === 'classes') return [item.tier, item.slot, item.concept].filter(value => typeof value === 'string' && value).join(' · ') || 'Class record';
  if (resource === 'cards') return [item.category, item.type, item.ownerName].filter(value => typeof value === 'string' && value).join(' · ') || 'Card record';
  if (resource === 'skills') return [item.kind, item.className, item.slot].filter(value => typeof value === 'string' && value).join(' · ') || 'Skill record';
  return typeof item.effect === 'string' && item.effect ? item.effect : 'Glossary entry';
}

function readQuerySafely(params: URLSearchParams): { query: ClassQuery; valid: boolean } {
  try { return { query: readClassQuery(params), valid: true }; }
  catch { return { query: classQueryDefaults, valid: false }; }
}
