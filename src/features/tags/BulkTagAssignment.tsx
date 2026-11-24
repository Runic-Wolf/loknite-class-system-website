import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '../../ui/feedback';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';
import { changeTagsForSelection, getTagAssignments, getTagGroups, type TaggableResource } from './api';
import styles from './bulk-tag-assignment.module.css';

const tagGroupsQueryKey = ['catalog', 'tag-groups'] as const;

function recordNoun(resource: TaggableResource, count: number) {
  const nouns = { classes: ['class', 'classes'], cards: ['card', 'cards'], skills: ['skill', 'skills'] } as const;
  return nouns[resource][count === 1 ? 0 : 1];
}

export function BulkTagAssignment({ resource, selectedIds }: { resource: TaggableResource; selectedIds: ReadonlySet<string> }) {
  const queryClient = useQueryClient();
  const attempt = useIdempotencyKey();
  const ids = useMemo(() => [...selectedIds].sort(), [selectedIds]);
  const [tag, setTag] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const groups = useQuery({ queryKey: tagGroupsQueryKey, queryFn: ({ signal }) => getTagGroups(signal) });
  const assignments = useQuery({
    queryKey: ['catalog', 'tag-selection', resource, ids],
    queryFn: ({ signal }) => getTagAssignments(resource, ids, signal),
    enabled: ids.length > 0 && ids.length <= 500,
  });
  const update = useMutation({
    mutationFn: (input: { action: 'add' | 'remove'; tag: string }) => changeTagsForSelection(resource, {
      ids, action: input.action, tag: input.tag,
    }, attempt.forPayload({ resource, ids, ...input })),
  });

  const choices = (groups.data?.groups ?? [])
    .filter(group => !group.structural && !(resource !== 'classes' && group.id === 'elements'));
  const coverageLabel = resource === 'classes' ? 'Direct class tag' : 'Shared tag';
  const presentCount = tag
    ? ids.filter(id => assignments.data?.assignments[id]?.includes(tag)).length
    : 0;

  async function apply(action: 'add' | 'remove') {
    if (!tag || update.isPending) return;
    setError('');
    setNotice('');
    try {
      const result = await update.mutateAsync({ action, tag });
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      const affected = action === 'add' ? 'Added' : 'Removed';
      const skipped = result.unchangedCount
        ? ` ${result.unchangedCount} selected ${recordNoun(resource, result.unchangedCount)} ${action === 'add' ? 'already had' : 'did not have'} the tag.`
        : '';
      setNotice(result.changedCount
        ? `${affected} “${tag}” ${action === 'add' ? 'to' : 'from'} ${result.changedCount} ${recordNoun(resource, result.changedCount)}.${skipped}`
        : `No records changed. All selected ${resource} already matched this action.`);
      attempt.clear();
    } catch (failure) {
      setError(apiErrorMessage(failure));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (action?.value === 'add' || action?.value === 'remove') void apply(action.value);
  }

  if (ids.length > 500) return <section className={styles.panel} aria-label="Batch tag assignment">
    <h3>Batch tag assignment</h3>
    <p className={styles.error} role="alert">Batch tag changes support up to 500 records. Clear the selection or select a smaller set.</p>
  </section>;

  return <>
    <section className={styles.panel} aria-labelledby="bulk-tag-title" aria-busy={groups.isPending || assignments.isFetching || update.isPending}>
      <header><h3 id="bulk-tag-title">Batch tag assignment</h3><span id="bulk-tag-description">{resource === 'classes'
        ? 'Assign a direct tag to selected classes. Tags inherited from skills stay unchanged.'
        : `Apply one shared tag to selected ${resource}; existing tags stay in place.`}</span></header>
      {groups.isPending || assignments.isPending
        ? <p className={styles.status}>Loading tag coverage…</p>
        : groups.isError || assignments.isError
          ? <div className={styles.feedback} role="alert"><span>{apiErrorMessage(groups.error ?? assignments.error)}</span><button className="button button-quiet" type="button" onClick={() => { void groups.refetch(); void assignments.refetch(); }}>Retry</button></div>
          : <>
            <form className={styles.form} aria-label="Apply a tag to selected records" onSubmit={submit}>
              <label className={styles.select}><span>{coverageLabel}</span><select name="tag" required aria-describedby="bulk-tag-description" value={tag} onChange={event => { setTag(event.currentTarget.value); setNotice(''); setError(''); }}>
                <option value="">Choose a tag</option>
                {choices.map(group => <optgroup label={group.label} key={group.id}>{group.tags.map(choice => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</optgroup>)}
              </select></label>
              <div className={styles.actions}>
                <p>{!tag ? 'Choose a tag to see its coverage.' : `“${tag}” is assigned to ${presentCount} of ${ids.length} selected records.`}</p>
                <div>
                  <button className="button button-primary" type="submit" name="action" value="add" disabled={!tag || update.isPending || presentCount === ids.length}>
                    {update.isPending && update.variables?.action === 'add' ? 'Adding…' : `Add to ${Math.max(0, ids.length - presentCount)} missing`}
                  </button>
                  <button className="button button-quiet" type="submit" name="action" value="remove" disabled={!tag || update.isPending || presentCount === 0}>
                    {update.isPending && update.variables?.action === 'remove' ? 'Removing…' : `Remove from ${presentCount} with tag`}
                  </button>
                </div>
              </div>
            </form>
            {resource === 'classes'
              ? <p className={styles.hint}>Coverage counts direct class tags. Effective tags inherited from skills are not changed by this action.</p>
              : <p className={styles.hint}>Element stays tied to the gameplay Element field. Change it in the card or skill editor.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </>}
    </section>
    <p className={styles.status} role="status" aria-live="polite">{notice}</p>
  </>;
}
