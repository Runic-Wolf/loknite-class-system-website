import type { CardFilters } from './filters';
import { cardTypeOptions, categoryOptions, classTierOptions, costOptions, elementOptions, statusOptions } from './filters';
import type { CardElement, CardType } from './types';
import { TagFilter } from '../tags/TagFilter';
import styles from './cards.module.css';

type CardFilterBarProps = {
  values: CardFilters;
  active: boolean;
  busy: boolean;
  onChange: (values: CardFilters, immediate?: boolean) => void;
  onClear: () => void;
};

export function CardFilterBar({ values, active, busy, onChange, onClear }: CardFilterBarProps) {
  return <section className={styles.filters} role="search" aria-label="Filter card collection">
    <label className={styles.searchField}>
      <span aria-hidden="true">⌕</span><span className="sr-only">Search names, rules, flavour, type, element and tags</span>
      <input type="search" value={values.q} onChange={event => onChange({ ...values, q: event.currentTarget.value }, false)} placeholder="Search name, rules or tags" autoComplete="off" maxLength={120} />
    </label>
    <SingleFilter label="Category" value={values.category} options={categoryOptions} onChange={category => onChange({ ...values, category })} />
    <MultiFilter label="Type" values={values.types} options={cardTypeOptions} onChange={types => onChange({ ...values, types })} />
    <MultiFilter label="Cost" values={values.costs} options={costOptions} onChange={costs => onChange({ ...values, costs })} />
    <MultiFilter label="Element" values={values.elements} options={elementOptions} onChange={elements => onChange({ ...values, elements: elements as CardElement[] })} />
    {values.category === 'class' && <MultiFilter label="C-Tier" values={values.tiers} options={classTierOptions} onChange={tiers => onChange({ ...values, tiers })} />}
    <TagFilter values={values.tags} onChange={tags => onChange({ ...values, tags })} presentation="chips" placement="end" detailsGroup="card-gallery-filters" />
    <SingleFilter label="Status" value={values.status} options={statusOptions} onChange={status => onChange({ ...values, status })} />
    <div className={styles.filterActions}>
      {busy && <span className={styles.filterStatus} role="status">Updating results…</span>}
      {active && <button className="button button-quiet" type="button" onClick={onClear}>Clear refinements</button>}
    </div>
  </section>;
}

function SingleFilter<Value extends string>({ label, value, options, onChange }: {
  label: string;
  value: Value;
  options: Array<[Value, string]>;
  onChange: (value: Value) => void;
}) {
  const selected = options.find(([option]) => option === value)?.[1] ?? 'Any';
  return <details className={styles.multiFilter} name="card-gallery-filters">
    <summary><span>{label}</span><small>{selected}</small></summary>
    <div className={styles.filterChipPanel} role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      {options.map(([option, text]) => <button className={styles.filterChip} data-selected={String(option === value)} type="button" key={option || 'all'} aria-pressed={option === value} onClick={() => onChange(option)}>{text}</button>)}
    </div>
  </details>;
}

function MultiFilter<Value extends string>({ label, values, options, onChange }: {
  label: string;
  values: Value[];
  options: Value[];
  onChange: (values: Value[]) => void;
}) {
  function toggle(value: Value) {
    onChange(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  }

  return <details className={styles.multiFilter} name="card-gallery-filters">
    <summary><span>{label}</span><small>{values.length ? `${values.length} selected` : 'Any'}</small></summary>
    <div className={styles.filterChipPanel} role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      {options.map(value => <button className={styles.filterChip} data-selected={String(values.includes(value))} type="button" key={value || 'unassigned'} aria-pressed={values.includes(value)} onClick={() => toggle(value)}>{value || 'Unassigned'}</button>)}
    </div>
  </details>;
}
