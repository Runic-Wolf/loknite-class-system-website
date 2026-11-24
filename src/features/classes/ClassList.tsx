import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { hrefWithParams } from '../../app/urls';
import { ClassListSkeleton } from './ClassSkeleton';
import type { ClassRow } from './types';
import styles from './classes.module.css';

const tierLabels: Record<ClassRow['tier'], string> = {
  C1: 'C1 · Bronze', C2: 'C2 · Silver', C3: 'C3 · Gold', SPEC: 'Specialization',
};

type Lineage = { slot: string; name: string };

type ClassListProps = {
  items?: ClassRow[] | undefined;
  next?: string | null | undefined;
  lineages: Lineage[];
  loading?: boolean;
  busy?: boolean;
  error?: string | undefined;
  onRetry?: () => void;
  filterDelay?: boolean;
};

export function ClassList({ items, next, lineages, loading = false, busy = false, error, onRetry, filterDelay = false }: ClassListProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(appliedQuery);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeFilterCount = Number(searchParams.has('tier')) + Number(searchParams.has('lineage'));

  useEffect(() => setQuery(appliedQuery), [appliedQuery]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'classes');
    const trimmed = query.trim();
    if (trimmed) nextParams.set('q', trimmed);
    else nextParams.delete('q');
    nextParams.delete('after');
    nextParams.delete('id');
    nextParams.delete('edit');
    nextParams.delete('saved');
    setSearchParams(nextParams);
  }

  if (loading) return <ClassListSkeleton />;

  return <>
    <form className={styles.filters} onSubmit={applyFilters} role="search" aria-label="Filter classes">
      <label className={styles.searchField}>
        <span aria-hidden="true">⌕</span><span className="sr-only">Search classes</span>
        <input value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Name, concept or notes" autoComplete="off" />
      </label>
      <div className={styles.filterDisclosure}>
        <button className={styles.filterToggle} type="button" aria-expanded={filtersExpanded} aria-controls="class-filter-options" onClick={() => setFiltersExpanded(value => !value)}>
          <span>Filters{activeFilterCount > 0 && <span className={styles.activeFilterCount}> {activeFilterCount}</span>}</span>
          <span aria-hidden="true">{filtersExpanded ? '⌃' : '⌄'}</span>
        </button>
        <div className={styles.filterOptions} id="class-filter-options" data-expanded={filtersExpanded}>
          <label className={styles.selectField}>
            <span className="sr-only">Filter by tier</span>
            <select value={searchParams.get('tier') ?? ''} onChange={event => {
              const value = event.currentTarget.value;
              const nextParams = new URLSearchParams(searchParams);
              if (value) nextParams.set('tier', value); else nextParams.delete('tier');
              nextParams.delete('after'); nextParams.delete('id');
              setSearchParams(nextParams);
            }}>
              <option value="">All tiers</option>
              {Object.entries(tierLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className="sr-only">Filter by lineage</span>
            <select value={searchParams.get('lineage') ?? ''} onChange={event => {
              const value = event.currentTarget.value;
              const nextParams = new URLSearchParams(searchParams);
              if (value) nextParams.set('lineage', value); else nextParams.delete('lineage');
              nextParams.delete('after'); nextParams.delete('id');
              setSearchParams(nextParams);
            }}>
              <option value="">All lineages</option>
              {lineages.map(lineage => <option value={lineage.slot} key={lineage.slot}>{lineage.name || '?'} · {lineage.slot}</option>)}
            </select>
          </label>
        </div>
      </div>
      <button className="button button-primary" type="submit">Search</button>
      {(searchParams.has('q') || searchParams.has('tier') || searchParams.has('lineage')) && <Link className="button button-quiet" to={hrefWithParams(searchParams, { q: null, tier: null, lineage: null, after: null, id: null, edit: null })}>Clear</Link>}
    </form>

    <section className={styles.listPanel} aria-label="Class results" aria-busy={busy || filterDelay}>
      <header className={styles.panelHeading}>
        <div><span className="eyebrow">CLASS RECORDS</span><h2>Results <span className={styles.count}>{items?.length ?? 0}</span></h2></div>
        <span className={styles.panelNote}>{filterDelay ? 'Updating…' : 'Sorted by name'}</span>
      </header>
      {error ? <div className={styles.queryError} role="alert"><p>{error}</p><button className="button button-quiet" type="button" onClick={onRetry}>Retry class list</button></div> : <>
        <div className={styles.rows}>
          {items?.length ? items.map(item => <ClassRowLink key={item.id} item={item} selected={searchParams.get('id') === item.id} params={searchParams} />) : <div className={styles.emptyState}><span aria-hidden="true">⌕</span><strong>No classes found</strong><p>Try a broader search or clear one of the filters.</p></div>}
        </div>
        {next && <Link className={styles.nextPage} to={hrefWithParams(searchParams, { after: next, id: null, edit: null, saved: null })}>Next page <span aria-hidden="true">→</span></Link>}
      </>}
    </section>
  </>;
}

function ClassRowLink({ item, selected, params }: { item: ClassRow; selected: boolean; params: URLSearchParams }) {
  const target = hrefWithParams(params, {
    view: 'classes', lineage: item.slot.split('/')[0], id: item.id, edit: null, saved: null, after: null,
  });
  return <Link className={`${styles.classRow}${selected ? ` ${styles.selectedRow}` : ''}`} to={target} aria-current={selected ? 'true' : undefined}>
    <span className={styles.classIcon}>{item.icon ? <img src={item.icon} alt="" width="40" height="40" loading="lazy" /> : <i aria-hidden="true">◇</i>}</span>
    <span className={styles.rowCopy}><strong>{item.name || '?'}</strong><small>{item.tier} <i aria-hidden="true">·</i> {item.slot}</small></span>
    <span className={styles.rowChevron} aria-hidden="true">›</span>
  </Link>;
}
