import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiErrorMessage } from '../../ui/feedback';
import { ApiError } from '../../app/api';
import { createCustomTag, getTagGroups, type TagGroup, type TagGroupList } from './api';
import { tagGroups as staticGroups } from '../../../shared/tag-catalog.js';
import styles from './tag-picker.module.css';

const queryKey = ['catalog', 'tag-groups'] as const;
const staticFallback: TagGroup[] = staticGroups.map(group => ({
  id: group.id, label: group.label, structural: group.structural === true,
  custom: group.custom === true, tags: group.tags.map(value => ({ value, label: value })), version: '',
}));

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  cardElement?: string | undefined;
  disabled?: boolean | undefined;
  error?: string | undefined;
};

export function TagPickerField({ value, onChange, cardElement, disabled = false, error }: Props) {
  const queryClient = useQueryClient();
  const taxonomy = useQuery({ queryKey, queryFn: ({ signal }) => getTagGroups(signal) });
  const groups = taxonomy.data?.groups ?? staticFallback;
  const [draftTag, setDraftTag] = useState('');
  const [customGroupId, setCustomGroupId] = useState('traits');
  const addTag = useMutation({ mutationFn: ({ group, value: tag, version }: { group: string; value: string; version: string }) => createCustomTag(group, tag, version) });
  const busy = disabled || addTag.isPending;
  const knownValues = new Set(groups.flatMap(group => group.tags.map(tag => tag.value)));
  const structuralGroup = groups.find(group => group.structural);
  const structuralTags = value.filter(tag => structuralGroup?.tags.some(choice => choice.value === tag));
  const unknownTags = value.filter(tag => !knownValues.has(tag));
  const retryGroup = groups.find(group => group.id === customGroupId) ?? groups.find(group => group.custom);

  function toggle(tag: string) {
    if (value.includes(tag)) onChange(value.filter(item => item !== tag));
    else onChange([...value, tag]);
  }

  async function addCustomTag(group: TagGroup) {
    const name = draftTag.trim();
    if (!name || !group.custom || !group.version) return;
    setCustomGroupId(group.id);
    try {
      const created = await addTag.mutateAsync({ group: group.id, value: name, version: group.version });
      queryClient.setQueryData<TagGroupList>(queryKey, previous => previous && ({
        groups: previous.groups.map(item => item.id === created.group
          ? { ...item, tags: [...item.tags, created.tag], version: created.version }
          : item),
      }));
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'mentions'] });
      onChange([...new Set([...value, created.tag.value])]);
      setDraftTag('');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'TAG_GROUP_CHANGED') await taxonomy.refetch();
    }
  }

  return <fieldset className={styles.picker} disabled={busy} aria-describedby={error ? 'tag-picker-error' : 'tag-picker-hint'}>
    <legend>Tags</legend>
    <p className={styles.hint} id="tag-picker-hint">Choose tags that describe this record. Class tiers come from the progression tree.</p>
    {taxonomy.isPending && <div className={styles.loading} aria-busy="true"><span /><span /><span /><span /><small>Loading the shared tag groups…</small></div>}
    {taxonomy.isError && <div className={styles.error} role="alert"><span>{apiErrorMessage(taxonomy.error)} Built-in tags remain available; custom tags will appear after reconnecting.</span><button className="button button-quiet" type="button" onClick={() => void taxonomy.refetch()}>Retry</button></div>}
    <div className={styles.groups}>
      {groups.filter(group => !group.structural && !(group.id === 'elements' && cardElement !== undefined)).map(group => {
        const selectedCount = group.tags.filter(tag => value.includes(tag.value)).length;
        return <details className={styles.group} key={group.id}>
          <summary><span>{group.label}</span><small>{selectedCount ? `${selectedCount} selected` : 'Choose tags'}</small></summary>
          <div className={styles.options}>
            {group.tags.map(tag => {
              const selected = value.includes(tag.value);
              return <label className={styles.option} key={tag.value}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(tag.value)}
                />
                <span>{tag.label}</span>
              </label>;
            })}
          </div>
          {group.custom && <div className={styles.customCreator}>
            <label><span>Add to shared {group.label.toLowerCase()} vocabulary</span><input value={draftTag} onChange={event => setDraftTag(event.currentTarget.value)} maxLength={80} placeholder="New tag name" /></label>
            <button className="button button-quiet" type="button" disabled={!draftTag.trim() || !group.version} onClick={() => void addCustomTag(group)}>{addTag.isPending ? 'Adding…' : 'Add tag'}</button>
            <small>The new tag is saved for the team immediately, even if you later cancel this record.</small>
          </div>}
        </details>;
      })}
    </div>
    {cardElement !== undefined && <p className={styles.linkedElement}>Card element: <strong>{cardElement || 'Unassigned'}</strong>. Its matching tag follows the Element field above.</p>}
    {(structuralTags.length > 0 || unknownTags.length > 0) && <div className={styles.retained}>
      {structuralTags.length > 0 && <p><strong>Class tier</strong> is structural and cannot be edited as a tag: {structuralTags.join(', ')}.</p>}
      {unknownTags.length > 0 && <div><strong>Saved tags outside the current groups</strong><div className={styles.options}>{unknownTags.map(tag => <label className={styles.option} key={tag}><input type="checkbox" checked onChange={() => toggle(tag)} /><span>{tag}</span></label>)}</div></div>}
    </div>}
    {addTag.isError && <p className={styles.error} role="alert">{apiErrorMessage(addTag.error)} {retryGroup && <button type="button" className="button button-quiet" onClick={() => void addCustomTag(retryGroup)}>Try again</button>}</p>}
    {error && <p className={styles.error} id="tag-picker-error" role="alert">{error}</p>}
  </fieldset>;
}
