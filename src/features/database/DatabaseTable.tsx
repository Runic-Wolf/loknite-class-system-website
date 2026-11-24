import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import styles from './database.module.css';
import tableStyles from './table-preferences.module.css';

export type DatabaseResource = 'classes' | 'cards' | 'skills' | 'keywords';
export type CatalogResult = { id: string; name: string; [field: string]: unknown };
export type ResultPage = { items: CatalogResult[]; next: string | null };
export type ResultColumn = { key: string; label: string; value: (item: CatalogResult) => string; sortable: boolean };

export function columnsFor(resource: DatabaseResource): ResultColumn[] {
  const column = (key: string, label: string, sortable = true): ResultColumn => ({ key, label, sortable, value: item => textValue(item[key]) });
  if (resource === 'classes') return [column('name', 'Class'), column('tier', 'Tier'), column('slot', 'Slot'), column('concept', 'Concept'), column('tags', 'Direct tags', false)];
  if (resource === 'cards') return [column('name', 'Card'), column('category', 'Category'), column('type', 'Type'), column('element', 'Element'), column('cost', 'Cost'), column('status', 'Status'), column('ownerName', 'Class'), column('tags', 'Tags', false)];
  if (resource === 'skills') return [column('name', 'Skill'), column('kind', 'Kind'), column('className', 'Class'), column('slot', 'Slot'), column('tags', 'Tags', false)];
  return [column('name', 'Keyword'), column('effect', 'Definition')];
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string').join(', ');
  return '';
}

export function CatalogTable({
  resource, rows, loading = false, params, query = '', visibleColumnKeys, sort = 'name', direction = 'asc', onSort, selectedIds, onSelectionChange,
}: {
  resource: DatabaseResource;
  rows: CatalogResult[];
  loading?: boolean;
  params?: URLSearchParams;
  query?: string;
  visibleColumnKeys?: ReadonlySet<string> | undefined;
  sort?: string;
  direction?: 'asc' | 'desc';
  onSort?: ((field: string) => void) | undefined;
  selectedIds?: ReadonlySet<string> | undefined;
  onSelectionChange?: ((ids: Set<string>) => void) | undefined;
}) {
  const [focusedId, setFocusedId] = useState(rows[0]?.id ?? '');
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const selectionAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (!rows.some(item => item.id === focusedId)) setFocusedId(rows[0]?.id ?? '');
  }, [rows, focusedId]);

  const columns = columnsFor(resource).filter(column => !visibleColumnKeys || visibleColumnKeys.has(column.key));
  const selectable = Boolean(selectedIds && onSelectionChange) && !loading;
  const allSelected = rows.length > 0 && rows.every(item => selectedIds?.has(item.id));
  const someSelected = rows.some(item => selectedIds?.has(item.id));

  function updateSelection(id: string, checked: boolean, extendRange = false) {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    const currentIndex = rows.findIndex(item => item.id === id);
    const anchorIndex = rows.findIndex(item => item.id === selectionAnchor.current);
    if (extendRange && currentIndex >= 0 && anchorIndex >= 0) {
      const start = Math.min(currentIndex, anchorIndex);
      const end = Math.max(currentIndex, anchorIndex);
      for (const item of rows.slice(start, end + 1)) {
        if (checked) next.add(item.id); else next.delete(item.id);
      }
    } else if (checked) next.add(id);
    else next.delete(id);
    selectionAnchor.current = id;
    onSelectionChange(next);
  }

  function rowClick(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [role="button"]')) return;
    updateSelection(id, !selectedIds?.has(id), event.shiftKey);
  }

  function rowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, index: number, id: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      const nextId = rows[nextIndex]?.id;
      if (nextId) {
        setFocusedId(nextId);
        rowRefs.current.get(nextId)?.focus();
      }
    } else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      updateSelection(id, !selectedIds?.has(id));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      rowRefs.current.get(id)?.querySelector<HTMLAnchorElement>('a')?.click();
    }
  }

  return <div className={styles.tableViewport} role="region" aria-label={`${resource} records table`} tabIndex={0} aria-busy={loading || undefined}>
    {loading && <p className="sr-only" role="status">Loading {resource} records</p>}
    <table className={styles.recordTable} data-resource={resource}>
      <thead><tr>{columns.map((item, columnIndex) => <th scope="col" key={item.key} aria-label={item.label} aria-sort={item.sortable ? sort === item.key ? direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>
        <span className={columnIndex === 0 ? tableStyles.headerSelection : undefined}>
          {columnIndex === 0 && selectable && <input
            type="checkbox"
            checked={allSelected}
            aria-checked={someSelected && !allSelected ? 'mixed' : allSelected}
            aria-label={`Select all ${rows.length} visible ${resource}`}
            ref={element => { if (element) element.indeterminate = someSelected && !allSelected; }}
            onChange={event => {
              const next = new Set(selectedIds);
              for (const row of rows) {
                if (event.currentTarget.checked) next.add(row.id); else next.delete(row.id);
              }
              selectionAnchor.current = null;
              onSelectionChange?.(next);
            }}
          />}
          {item.sortable && onSort
            ? <button type="button" className={tableStyles.sortButton} aria-label={`Sort by ${item.label}`} onClick={() => onSort(item.key)}>{item.label}<span aria-hidden="true">{sort === item.key ? direction === 'asc' ? '↑' : '↓' : '↕'}</span></button>
            : item.label}
        </span>
      </th>)}</tr></thead>
      <tbody>{loading
        ? Array.from({ length: 8 }, (_, row) => <tr className={styles.tableSkeletonRow} key={row} aria-hidden="true">{columns.map(item => <td key={item.key}><span /></td>)}</tr>)
        : rows.map((item, index) => <tr
          key={item.id}
          ref={element => { if (element) rowRefs.current.set(item.id, element); else rowRefs.current.delete(item.id); }}
          tabIndex={focusedId === item.id ? 0 : -1}
          aria-selected={selectedIds?.has(item.id) || undefined}
          data-selected={selectedIds?.has(item.id) ? 'true' : undefined}
          onFocus={() => setFocusedId(item.id)}
          onClick={event => rowClick(event, item.id)}
          onKeyDown={event => rowKeyDown(event, index, item.id)}
        >{columns.map((col, columnIndex) => {
          const value = col.value(item) || '—';
          return <td key={col.key} title={value}>{columnIndex === 0
            ? <span className={tableStyles.recordCell}>{selectable && <input type="checkbox" checked={Boolean(selectedIds?.has(item.id))} aria-label={`Select ${item.name || item.id}`} onChange={event => updateSelection(item.id, event.currentTarget.checked, (event.nativeEvent as Event & { shiftKey?: boolean }).shiftKey === true)} />}<Link className={styles.recordLink} to={recordResultUrl(resource, item.id, query, params)}>{value}</Link></span>
            : <span>{value}</span>}</td>;
        })}</tr>)}</tbody>
    </table>
  </div>;
}

export function ColumnSettings({
  resource, visibleColumnKeys, onToggle,
}: {
  resource: DatabaseResource;
  visibleColumnKeys: ReadonlySet<string>;
  onToggle: (key: string, visible: boolean) => void;
}) {
  const columns = columnsFor(resource);
  return <details className={tableStyles.columnSettings}>
    <summary>Columns <span>{visibleColumnKeys.size} visible</span></summary>
    <fieldset>
      <legend>Choose the fields shown in this table</legend>
      {columns.map(column => <label key={column.key}>
        <input type="checkbox" checked={visibleColumnKeys.has(column.key)} disabled={column.key === 'name'} onChange={event => onToggle(column.key, event.currentTarget.checked)} />
        <span>{column.label}</span>
      </label>)}
      <p>The record name stays visible so each row can still be opened.</p>
    </fieldset>
  </details>;
}

export function recordResultUrl(resource: DatabaseResource, id: string, query: string, current?: URLSearchParams): string {
  const params = new URLSearchParams(current);
  params.set('view', resource === 'keywords' ? 'keywords' : resource === 'skills' ? 'database' : resource);
  params.set('id', id);
  if (resource === 'skills') params.set('entity', 'skills'); else params.delete('entity');
  if (query) params.set('q', query);
  for (const key of ['after', 'create', 'edit']) params.delete(key);
  return `/?${params}`;
}
