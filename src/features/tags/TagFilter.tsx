import { useQuery } from '@tanstack/react-query';
import { apiErrorMessage } from '../../ui/feedback';
import { getTagGroups } from './api';
import { tagGroups as staticGroups } from '../../../shared/tag-catalog.js';
import styles from './tags.module.css';

const queryKey = ['catalog', 'tag-groups'] as const;

export function TagFilter({ values, onChange, scope = 'cards', logic = 'AND', presentation = 'checkboxes', placement = 'start', detailsGroup }: { values: string[]; onChange: (tags: string[]) => void; scope?: 'cards' | 'classes'; logic?: 'AND' | 'OR'; presentation?: 'checkboxes' | 'chips'; placement?: 'start' | 'end'; detailsGroup?: string }) {
  const taxonomy = useQuery({ queryKey, queryFn: ({ signal }) => getTagGroups(signal) });
  const groups = taxonomy.data?.groups ?? staticGroups.map(group => ({
    id: group.id, label: group.label, structural: group.structural === true, tags: group.tags.map(value => ({ value, label: value })), custom: group.custom === true,
  }));

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter(tag => tag !== value) : [...values, value]);
  }

  return <details className={`${styles.filter}${placement === 'end' ? ` ${styles.filterEnd}` : ''}`} name={detailsGroup}>
    <summary><span>Tags · match {logic === 'AND' ? 'all' : 'any'}</span><small>{values.length ? `${values.length} selected` : 'Any'}</small></summary>
    <div className={styles.filterPanel} aria-label="Filter by tags">
      <p>{scope === 'classes'
        ? logic === 'AND'
          ? 'Classes must match every selected tag and every other enabled rule. The chosen source determines where class tags come from; this only filters results.'
          : 'Classes must match at least one selected tag or another enabled rule. The chosen source determines where class tags come from; this only filters results.'
        : 'Cards must include every selected tag. This only filters the collection.'}</p>
      {taxonomy.isError && <p className={styles.filterWarning} role="alert">{apiErrorMessage(taxonomy.error)} Built-in tags are still available.</p>}
      {groups.filter(group => group.tags.length > 0 && (scope === 'classes' ? !group.structural : group.id !== 'elements')).map(group => <fieldset className={styles.filterGroup} key={group.id}>
        <legend>{group.label}</legend>
        <div className={presentation === 'chips' ? styles.filterChipList : undefined}>
          {group.tags.map(tag => presentation === 'chips'
            ? <button className={styles.filterChip} data-selected={String(values.includes(tag.value))} type="button" key={tag.value} aria-pressed={values.includes(tag.value)} onClick={() => toggle(tag.value)}>{tag.label}</button>
            : <label key={tag.value}><input type="checkbox" checked={values.includes(tag.value)} onChange={() => toggle(tag.value)} /><span>{tag.label}</span></label>)}
        </div>
      </fieldset>)}
    </div>
  </details>;
}
