import { Link } from 'react-router';
import { apiErrorMessage } from '../../ui/feedback';
import { classMentionHref } from './mention-routing';
import type { ClassNoteMention } from '../../../shared/class-mentions.js';
import type { ClassMentionCandidate, ClassMentionResolution } from './types';
import type { ReturnTypeOfClassNoteMentions } from './useClassNoteMentions';
import styles from './classes.module.css';

function candidateDescription(candidate: ClassMentionCandidate): string {
  return candidate.kind === 'tag' ? candidate.groupLabel : candidate.context;
}

function candidateAction(candidate: ClassMentionCandidate): string {
  if (candidate.kind === 'class') return `Open ${candidate.name} in Class Matrix`;
  if (candidate.kind === 'card') return `Open ${candidate.name} in Card Gallery`;
  if (candidate.kind === 'skill') return `Open ${candidate.name} in Skills`;
  return `Filter classes by ${candidate.name}`;
}

export function ClassMentionReferences({ lookup, onNavigate, onCreateDraft, createDraftPending, createDraftError }: {
  lookup: ReturnTypeOfClassNoteMentions;
  onNavigate: (href: string) => boolean;
  onCreateDraft: (mention: Pick<ClassNoteMention, 'line' | 'tier' | 'name'>) => void;
  createDraftPending: boolean;
  createDraftError: string | undefined;
}) {
  const { mentions, overflow, byLine, isDebouncing, query: lookups } = lookup;
  const validCount = mentions.filter(item => item.valid).length;

  if (!mentions.length) return null;

  const status = overflow ? 'Showing the first 40 references.'
    : isDebouncing ? 'Checking class references…'
      : lookups.isPending && validCount ? 'Checking class references…'
        : lookups.isError ? 'Reference lookup is unavailable. Your note is unchanged.'
          : `${mentions.length} class reference${mentions.length === 1 ? '' : 's'} in this note.`;

  function follow(href: string, event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!onNavigate(href)) event.preventDefault();
  }

  return <section className={styles.freeNoteReferences} aria-label="Class note references">
    <div className={styles.freeNoteReferencesHead}><strong>References</strong><small>Exact names · open a match</small></div>
    <p className={styles.freeNoteReferencesStatus} role="status" aria-live="polite">{status}</p>
    {createDraftError && <p className={styles.freeNoteCreateDraftError} role="alert">{createDraftError}</p>}
    {lookups.isError && !isDebouncing && <div className={styles.freeNoteLookupError}>
      <span>{apiErrorMessage(lookups.error)}</span>
      <button className="button button-quiet" type="button" onClick={() => void lookups.refetch()}>Retry lookup</button>
    </div>}
    <div className={styles.freeNoteReferenceList}>
      {mentions.map(mention => {
        const result: ClassMentionResolution | undefined = mention.valid && !isDebouncing ? byLine.get(mention.line) : undefined;
        const label = `@${mention.tier.slice(1)}${mention.name ? ` ${mention.name}` : ''}`;
        const state = !mention.valid ? (mention.name ? 'Use a name up to 100 characters.' : 'Add a name after the tier.')
          : isDebouncing || lookups.isPending ? 'Checking…'
            : lookups.isError ? 'Could not check this reference.'
              : result?.status === 'resolved' ? 'One exact match'
                : result?.status === 'ambiguous' ? `${result.candidates.length}${result.truncated ? '+' : ''} matches · choose one`
                  : 'No exact match yet';
        return <article className={styles.freeNoteReference} key={`${mention.line}-${mention.start}`}>
          <div className={styles.freeNoteReferenceLine}>
            <span className={styles.freeNoteReferenceNumber}>Line {mention.line + 1}</span>
            <code>{label}</code>
            <span className={styles.freeNoteReferenceState}>{state}</span>
          </div>
          {result?.candidates.length ? <div className={styles.freeNoteCandidates}>
            {result.candidates.map(candidate => <Link
              className={styles.freeNoteCandidate}
              key={candidate.kind === 'tag' ? `${candidate.group}:${candidate.value}` : `${candidate.kind}:${candidate.id}`}
              to={classMentionHref(candidate)}
              aria-label={`${candidateAction(candidate)}${candidateDescription(candidate) ? `, ${candidateDescription(candidate)}` : ''}`}
              onClick={event => follow(classMentionHref(candidate), event)}
            >
              <span>{candidate.name}</span><small>{candidateDescription(candidate)}</small><span aria-hidden="true">↗</span>
            </Link>)}
            {result.truncated && <small className={styles.freeNoteCandidateOverflow}>More matches exist. Add context to narrow the name.</small>}
          </div> : null}
          {result?.status === 'pending' && <button
            className={`button button-quiet ${styles.freeNoteCreateDraft}`}
            type="button"
            disabled={createDraftPending}
            onClick={() => onCreateDraft({ line: mention.line, tier: mention.tier, name: mention.name })}
          >{createDraftPending ? 'Creating draft card…' : `Create “${mention.name}” as a draft card`}</button>}
        </article>;
      })}
    </div>
  </section>;
}
