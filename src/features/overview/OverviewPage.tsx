import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { classQueryDefaults, classQueryToSearchParams, readClassQuery, type ClassQuery } from '../../../shared/class-query.js';
import { apiErrorMessage } from '../../ui/feedback';
import { getOverview } from '../classes/api';
import type { CatalogOverview } from '../classes/types';
import { TagFilter } from '../tags/TagFilter';
import { ClassQueryBuilder } from '../database/ClassQueryBuilder';
import { SavedQueries } from '../database/SavedQueries';
import styles from './overview.module.css';

const tierOrder = ['C1', 'C2', 'C3', 'SPEC'] as const;
const tierColors = { C1: '#408baa', C2: '#8c72b8', C3: '#b69357', SPEC: '#4dba9a' } as const;

function readQuerySafely(params: URLSearchParams): { query: ClassQuery; valid: boolean } {
  try { return { query: readClassQuery(params), valid: true }; }
  catch { return { query: classQueryDefaults, valid: false }; }
}

function databaseFilterUrl(field: 'tag' | 'tier', value: string, query: ClassQuery, source: ClassQuery['source'], search: string): string {
  const params = new URLSearchParams({ view: 'database', type: 'classes' });
  const hasCurrentRules = query.rules.some(rule => rule.enabled) || query.scope;
  const drilldown: ClassQuery = {
    logic: 'AND', source,
    rules: [{ field, value, enabled: true, exclude: false }],
    ...(hasCurrentRules ? { scope: query } : {}),
  };
  params.set('where', JSON.stringify(drilldown));
  if (search) params.set('q', search);
  return `/?${params}`;
}

function databaseQueryUrl(query: ClassQuery, search: string): string {
  const params = new URLSearchParams({ view: 'database', type: 'classes' });
  if (query.rules.length || query.scope) params.set('where', JSON.stringify(query));
  if (search) params.set('q', search);
  return `/?${params}`;
}

function OverviewSkeleton() {
  return <section className={styles.overview} aria-busy="true">
    <p className="sr-only" role="status">Loading workspace overview</p>
    <div className={styles.heading}><span className="skeleton-bar" /><span className="skeleton-bar" /><span className="skeleton-bar" /></div>
    <div className={styles.querySkeleton}><i /><b /><div><i /><i /><i /></div></div>
    <div className={styles.stats} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div className={styles.statSkeleton} key={index}><i /><b /><i /></div>)}</div>
    <div className={styles.analyticsSkeleton}><div /><div /></div>
    <div className={styles.resultSkeleton} aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
  </section>;
}

function QueryControls({
  query, onQueryChange,
}: {
  query: ClassQuery;
  onQueryChange: (update: ClassQuery | ((current: ClassQuery) => ClassQuery)) => void;
}) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const selectedTags = query.rules.filter(rule => rule.field === 'tag').map(rule => rule.value);
  const activeRuleCount = query.rules.filter(rule => rule.enabled).length;
  return <section className={styles.queryPanel} aria-label="Dashboard query controls">
    <header><div><span className="eyebrow">DESIGN QUERY</span><h2>Choose which classes to measure</h2><p>Metrics, tier totals, and tag coverage all use this same set of class IDs.</p></div>
      {query.rules.length > 0 && <button className="button button-quiet" type="button" onClick={() => onQueryChange(current => ({ ...current, rules: [] }))}>Clear rules</button>}
    </header>
    <div className={styles.queryControls}>
      <TagFilter scope="classes" logic={query.logic} values={selectedTags} onChange={tags => onQueryChange(current => {
        const otherRules = current.rules.filter(rule => rule.field !== 'tag');
        const previous = new Map(current.rules.filter(rule => rule.field === 'tag').map(rule => [rule.value, rule]));
        const tagRules = tags.map(tag => previous.get(tag) ?? { field: 'tag' as const, value: tag, enabled: true, exclude: false });
        return { ...current, rules: [...otherRules, ...tagRules] };
      })} />
      <label className={styles.tagSource}><span>Class tag source</span><select aria-label="Dashboard class tag source" value={query.source} onChange={event => onQueryChange(current => ({ ...current, source: event.currentTarget.value as ClassQuery['source'] }))}>
        <option value="effective">Effective · class and available skills</option><option value="direct">Direct · tags on this class</option>
      </select></label>
      <details className={styles.ruleDisclosure}>
        <summary><span><strong>Advanced rules</strong><small>{activeRuleCount ? `${activeRuleCount} active · match ${query.logic === 'AND' ? 'all' : 'any'}` : query.scope ? 'Scoped to a previous query' : 'Optional'}</small></span><b aria-hidden="true">⌄</b></summary>
        <ClassQueryBuilder query={query} onChange={onQueryChange} />
      </details>
      <details className={styles.presetDisclosure} onToggle={event => setPresetsOpen(event.currentTarget.open)}>
        <summary><span><strong>Team queries</strong><small>Load or save shared filters</small></span><b aria-hidden="true">⌄</b></summary>
        {presetsOpen && <SavedQueries query={query} onApply={onQueryChange} />}
      </details>
    </div>
  </section>;
}

function TierDistribution({ data }: { data: CatalogOverview['dashboard'] }) {
  let position = 0;
  const stops = tierOrder.map(tier => {
    const start = position;
    position += data.total ? data.tierCounts[tier] / data.total * 100 : 0;
    return `${tierColors[tier]} ${start}% ${position}%`;
  });
  const gradient = data.total ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(var(--line) 0 100%)';
  const label = tierOrder.map(tier => `${tier}: ${data.tierCounts[tier]}`).join(', ');
  return <section className={styles.tierPanel} aria-labelledby="tier-title">
    <header><div><span className="eyebrow">PROGRESSION</span><h2 id="tier-title">Classes by tier</h2></div><span>{data.total.toLocaleString()} {data.total === 1 ? 'class' : 'classes'}</span></header>
    <div className={styles.tierContent}>
      <div className={styles.donut} style={{ background: gradient }} role="img" aria-label={`Distribution of ${data.total} classes. ${label}`}><strong>{data.total.toLocaleString()}</strong></div>
      <nav className={styles.tierLegend} aria-label="Filter classes by tier">
        {tierOrder.map(tier => <Link key={tier} to={databaseFilterUrl('tier', tier, data.query, data.query.source, data.search)} aria-label={`Filter classes by ${tier} (${data.tierCounts[tier]})`}>
          <i style={{ background: tierColors[tier] }} /><span>{tier}</span><strong>{data.tierCounts[tier].toLocaleString()}</strong><b aria-hidden="true">↗</b>
        </Link>)}
      </nav>
    </div>
  </section>;
}

function TagCoverage({ data }: { data: CatalogOverview['dashboard'] }) {
  return <section className={styles.tagPanel} aria-labelledby="coverage-title">
    <header><div><span className="eyebrow">EFFECTIVE TAGS</span><h2 id="coverage-title">Tag coverage</h2><p>Number of classes with access to each tag, including available skills.</p></div><span>Top {data.tagCoverage.length}</span></header>
    {data.tagCoverage.length === 0
      ? <p className={styles.chartEmpty}>No tags appear in this class set.</p>
      : <div className={styles.tagRows}>{data.tagCoverage.map(tag => <Link key={tag.tag} className={styles.tagRow} to={databaseFilterUrl('tag', tag.tag, data.query, 'effective', data.search)} aria-label={`Filter classes with effective tag ${tag.tag} (${tag.classes})`}>
        <span className={styles.tagName}>{tag.tag}</span><span className={styles.barTrack}><i style={{ width: `${data.total ? Math.max(2, tag.classes / data.total * 100) : 0}%` }} /></span><strong>{tag.classes.toLocaleString()}</strong><b aria-hidden="true">↗</b>
      </Link>)}</div>}
  </section>;
}

function ClassResults({ data }: { data: CatalogOverview['dashboard'] }) {
  return <section className={styles.classResults} aria-labelledby="results-title">
    <header><div><span className="eyebrow">CLASSES IN QUERY</span><h2 id="results-title">Matching classes <span>{data.total.toLocaleString()}</span></h2></div><Link className="button button-quiet" to={databaseQueryUrl(data.query, data.search)}>Open Database <span aria-hidden="true">↗</span></Link></header>
    {data.classes.length === 0
      ? <div className={styles.emptyResults}><strong>No classes match this query.</strong><p>Clear a rule or adjust the search to see the class set again.</p></div>
      : <div className={styles.classGrid}>{data.classes.map(item => <Link key={item.id} className={styles.classResult} to={`/?view=classes&id=${encodeURIComponent(item.id)}`}>
        <span className={styles.tierMark}>{item.tier}</span><span className={styles.classCopy}><strong>{item.name || '(unnamed class)'}</strong><small>{item.slot}</small></span><span className={styles.classTags}>{item.effectiveTagCount} tags</span><b aria-hidden="true">↗</b>
      </Link>)}</div>}
    {data.resultsTruncated && <p className={styles.truncated}>Showing the first {data.classes.length} of {data.total.toLocaleString()} matching classes. Use Database for the full result set.</p>}
  </section>;
}

function OverviewContent({ data, query, onQueryChange, search, onSearchDraftChange, onSearch }: {
  data: CatalogOverview;
  query: ClassQuery;
  onQueryChange: (update: ClassQuery | ((current: ClassQuery) => ClassQuery)) => void;
  search: string;
  onSearchDraftChange: (value: string) => void;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dashboard = data.dashboard;
  const totals = [
    { label: 'Classes', value: dashboard.counts.classes, note: 'distinct class records' },
    { label: 'C3', value: dashboard.counts.c3, note: 'classes in this result' },
    { label: 'Skills available', value: dashboard.counts.skills, note: 'distinct skill IDs, including inherited' },
    { label: 'Specializations', value: dashboard.counts.specializations, note: 'SPEC classes in this result' },
  ];

  return <section className={styles.overview}>
    <header className={styles.pageHeading}>
      <div><span className="eyebrow">PRIVATE DESIGN WORKSPACE <span aria-hidden="true">/</span> REVISION {data.head.revision}</span><h1>Lok’nite at a glance</h1><p>Measure the class set, find gaps, and open the exact records behind each number.</p></div>
      <a className="button button-quiet" href="/classic/">Current workspace <span aria-hidden="true">↗</span></a>
    </header>
    <QueryControls query={query} onQueryChange={onQueryChange} />
    <form className={styles.searchForm} role="search" aria-label="Search classes and tags" onSubmit={onSearch}>
      <label><span aria-hidden="true">⌕</span><span className="sr-only">Search classes, concepts, notes, and effective tags</span><input value={search} onChange={event => onSearchDraftChange(event.currentTarget.value)} placeholder="Search classes, concepts, notes, and effective tags" maxLength={120} /></label>
      <button className="button button-primary" type="submit">Search</button>
    </form>
    <div className={styles.stats} aria-label="Filtered class metrics">{totals.map((total, index) => <article className={styles.statCard} key={total.label}>
      <span>{total.label}</span><strong>{total.value.toLocaleString()}</strong><small>{total.note}</small><i aria-hidden="true">{['◇', '⌂', '✦', '↗'][index]}</i>
    </article>)}</div>
    <div className={styles.analyticsGrid}><TagCoverage data={dashboard} /><TierDistribution data={dashboard} /></div>
    <ClassResults data={dashboard} />
    <section className={styles.lineagePanel} aria-labelledby="lineage-title">
      <header><div><span className="eyebrow">PROGRESSION MAP</span><h2 id="lineage-title">Base lineages <span>{data.lineages.length}</span></h2></div><Link to="/?view=classes">Open Class Matrix <span aria-hidden="true">→</span></Link></header>
      <div className={styles.lineageGrid}>{data.lineages.map((lineage, index) => <Link to={`/?view=classes&lineage=${encodeURIComponent(lineage.slot)}`} key={lineage.id} className={styles.lineageCard}>
        <span className={styles.lineageIcon}>{lineage.icon ? <img src={lineage.icon} alt="" width="44" height="44" loading="lazy" /> : <i>{String(index + 1).padStart(2, '0')}</i>}</span>
        <span className={styles.lineageName}><strong>{lineage.name || '?'}</strong><small>{lineage.slot}</small></span><span className={styles.lineageArrow} aria-hidden="true">↗</span>
      </Link>)}</div>
    </section>
    <footer className={styles.dashboardFoot}><span className={styles.online} /><span>Workspace online</span><span aria-hidden="true">·</span><span>{data.counts.cards.toLocaleString()} cards</span><span aria-hidden="true">·</span><span>{data.counts.keywords.toLocaleString()} keywords</span><span className={styles.revisionTime}>Updated {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.head.updatedAt))}</span></footer>
  </section>;
}

export function OverviewPage() {
  const [params, setParams] = useSearchParams();
  const [draftSearch, setDraftSearch] = useState(params.get('q') ?? '');
  const search = params.get('q') ?? '';
  const parsed = readQuerySafely(params);
  const query = parsed.query;
  useEffect(() => setDraftSearch(search), [search]);

  const result = useQuery({
    queryKey: ['catalog', 'overview', search, query],
    queryFn: ({ signal }) => getOverview(signal, params),
    placeholderData: previous => previous,
  });

  function updateQuery(update: ClassQuery | ((current: ClassQuery) => ClassQuery)) {
    setParams(current => {
      const currentQuery = readQuerySafely(current).query;
      const nextQuery = typeof update === 'function' ? update(currentQuery) : update;
      const next = classQueryToSearchParams(nextQuery, current);
      next.set('view', 'overview');
      next.delete('entity');
      return next;
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams(current => {
      const next = new URLSearchParams(current);
      const value = draftSearch.trim();
      if (value) next.set('q', value); else next.delete('q');
      next.set('view', 'overview');
      next.delete('after');
      return next;
    });
  }

  if (result.isPending) return <OverviewSkeleton />;
  if (result.isError) return <section className={styles.overviewError} role="alert"><h1>Workspace overview unavailable</h1><p>{apiErrorMessage(result.error)}</p><button className="button button-primary" onClick={() => void result.refetch()}>Retry overview</button></section>;

  return <>
    {!parsed.valid && <p className={styles.invalidQuery} role="alert">This saved query is invalid. <button className="button button-quiet" type="button" onClick={() => updateQuery(classQueryDefaults)}>Reset query</button></p>}
    <div aria-busy={result.isFetching || undefined}>
      <OverviewContent data={result.data} query={query} onQueryChange={updateQuery} search={draftSearch} onSearchDraftChange={setDraftSearch} onSearch={submitSearch} />
      {result.isFetching && <span className={styles.refreshStatus} role="status">Updating dashboard metrics…</span>}
    </div>
  </>;
}
