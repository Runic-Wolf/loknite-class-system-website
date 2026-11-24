import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../app/api';
import { apiErrorMessage } from '../../ui/feedback';
import { useIdempotencyKey } from '../../ui/useIdempotencyKey';
import { createClassNoteDraft, getClass, updateClassNotes } from './api';
import type { ClassNoteCursor, ClassRecord, ClassRow } from './types';
import type { ClassNoteMention } from '../../../shared/class-mentions.js';
import { ClassMentionReferences } from './ClassMentionReferences';
import { useClassNoteMentions } from './useClassNoteMentions';
import styles from './classes.module.css';

export function ClassNotesInline({ item, draft, onDraftChange, open, onOpenChange, restoreCursor, cursor, onCursorRestored, onPrepareMentionNavigation }: {
  item: Pick<ClassRow, 'id' | 'name' | 'notesLength' | 'notesPreview'>;
  draft: string | undefined;
  onDraftChange: (value: string | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreCursor: boolean;
  cursor: ClassNoteCursor | undefined;
  onCursorRestored: () => void;
  onPrepareMentionNavigation: (href: string, context: { id: string; cursor: ClassNoteCursor }) => boolean;
}) {
  const [latestLoaded, setLatestLoaded] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const [draftCreatedMessage, setDraftCreatedMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createAttempt = useIdempotencyKey();
  const queryClient = useQueryClient();
  const record = useQuery({
    queryKey: ['catalog', 'class', item.id],
    queryFn: ({ signal }) => getClass(item.id, signal),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (notes: string) => {
      if (!record.data) throw new Error('Load the saved class note before saving.');
      return updateClassNotes(item.id, record.data.version, notes);
    },
    onSuccess: async result => {
      queryClient.setQueryData<ClassRecord>(['catalog', 'class', item.id], current => current
        ? { ...current, item: result.item, version: result.version, position: result.position }
        : current);
      onDraftChange(undefined);
      setLatestLoaded(false);
      await queryClient.invalidateQueries({ queryKey: ['catalog', 'classes', 'lineage'] });
    },
  });

  const savedNotes = record.data?.item.notes ?? '';
  const value = draft ?? savedNotes;
  const mentionLookup = useClassNoteMentions(value, item.id, open);
  const changed = record.data !== undefined && draft !== undefined && draft !== savedNotes;
  const notePreview = (draft ?? item.notesPreview ?? '').trim().replaceAll(/\s+/g, ' ');
  const shortPreview = notePreview.length > 116 ? notePreview.slice(0, 116).trimEnd() + '…' : notePreview;
  const noteLength = draft?.length ?? item.notesLength ?? 0;
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const fieldId = `class-notes-${item.id}`;

  const createDraft = useMutation({
    mutationFn: (mention: Pick<ClassNoteMention, 'tier' | 'name'>) => createClassNoteDraft({
      ownerId: item.id,
      tier: mention.tier,
      name: mention.name,
    }, createAttempt.forPayload({ ownerId: item.id, tier: mention.tier, name: mention.name })),
    onSuccess: async result => {
      createAttempt.clear();
      setDraftCreatedMessage(`Draft card “${result.item.name}” created. Your note is still unsaved.`);
      queryClient.setQueryData(['catalog', 'cards', 'record', result.item.id], result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog', 'mentions'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'cards'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'class', item.id] }),
      ]);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['catalog', 'mentions'] });
      }
    },
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!restoreCursor || !open || !textarea || !cursor) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(Math.min(cursor.start, textarea.value.length), Math.min(cursor.end, textarea.value.length));
    textarea.scrollTop = cursor.scrollTop;
    onCursorRestored();
  }, [restoreCursor, open, cursor, value, onCursorRestored]);

  async function loadLatestVersion() {
    const result = await record.refetch();
    if (result.data) {
      save.reset();
      setLatestLoaded(true);
    }
  }

  function changeDraft(next: string) {
    if ((save.isError && !conflict) || save.isSuccess) save.reset();
    if (createDraft.isError || createDraft.isSuccess) createDraft.reset();
    setDraftCreatedMessage('');
    setNavigationError(false);
    onDraftChange(next);
  }

  function requestDraft(mention: Pick<ClassNoteMention, 'line' | 'tier' | 'name'>) {
    const current = mentionLookup.mentions.find(item => item.line === mention.line && item.valid);
    const resolution = mentionLookup.byLine.get(mention.line);
    if (!current || current.tier !== mention.tier || current.name !== mention.name || resolution?.status !== 'pending' || createDraft.isPending) return;
    const textarea = textareaRef.current;
    if (textarea) {
      const cursor = { start: textarea.selectionStart, end: textarea.selectionEnd, scrollTop: textarea.scrollTop };
      requestAnimationFrame(() => {
        const active = textareaRef.current;
        if (!active) return;
        active.focus({ preventScroll: true });
        active.setSelectionRange(Math.min(cursor.start, active.value.length), Math.min(cursor.end, active.value.length));
        active.scrollTop = cursor.scrollTop;
      });
    }
    setDraftCreatedMessage('');
    createDraft.mutate({ tier: mention.tier, name: mention.name });
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd || createDraft.isPending) return;
    const caret = event.currentTarget.selectionStart;
    const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
    const lineEndAt = value.indexOf('\n', caret);
    const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
    if (caret !== lineEnd) return;
    const match = value.slice(lineStart, lineEnd).match(/^\s*@([123])\s*(.+?)\s*$/u);
    if (!match) return;
    const tierPrefix = match[1];
    const name = match[2]?.trim();
    if (!tierPrefix || !name || name.length > 100) return;
    const line = value.slice(0, lineStart).split('\n').length - 1;
    const mention = mentionLookup.mentions.find(item => item.line === line && item.valid);
    const resolution = mentionLookup.byLine.get(line);
    if (!mention || mention.tier !== `C${tierPrefix}` || mention.name !== name || resolution?.status !== 'pending') return;
    event.preventDefault();
    requestDraft({ line, tier: mention.tier, name });
  }

  function prepareMentionNavigation(href: string): boolean {
    const textarea = textareaRef.current;
    const context = {
      id: item.id,
      cursor: {
        start: textarea?.selectionStart ?? value.length,
        end: textarea?.selectionEnd ?? value.length,
        scrollTop: textarea?.scrollTop ?? 0,
      },
    };
    const prepared = onPrepareMentionNavigation(href, context);
    setNavigationError(!prepared);
    return prepared;
  }

  function submit() {
    if (!record.data || !changed || save.isPending) return;
    save.mutate(value);
  }

  return <details className={styles.freeNotes} open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>
      <span className={styles.freeNotesSummaryCopy}>
        <span className={styles.freeNotesSummaryLine}>
          <strong>Free notes</strong>
          <small>{changed ? 'Unsaved draft' : noteLength ? `${noteLength.toLocaleString()} characters` : 'No notes yet'}</small>
        </span>
        {shortPreview && <span className={styles.freeNotesPreview}>{shortPreview}</span>}
      </span>
    </summary>
    <div className={styles.freeNotesBody}>
      <p className={styles.freeNotesHint}>Notes are saved to this C3 class and shared with the workspace.</p>
      {record.isPending && draft === undefined && <p className={styles.freeNotesStatus} role="status">Loading saved notes…</p>}
      {record.isError && <div className={styles.freeNotesError} role="alert">
        <p>{apiErrorMessage(record.error)}</p>
        <button className="button button-quiet" type="button" onClick={() => void record.refetch()}>Retry loading</button>
      </div>}
      {(!record.isPending || draft !== undefined || record.isError) && <>
        <label className={styles.freeNotesLabel} htmlFor={fieldId}>Notes for {item.name.trim() && item.name !== '?' ? item.name : 'this class path'}</label>
        <textarea
          ref={textareaRef}
          id={fieldId}
          value={value}
          maxLength={32000}
          rows={5}
          spellCheck
          aria-describedby={`${fieldId}-help ${fieldId}-count`}
          disabled={save.isPending}
          onChange={event => { changeDraft(event.currentTarget.value); }}
          onKeyDown={handleEditorKeyDown}
        />
        <div className={styles.freeNotesMeta}>
          <small id={`${fieldId}-help`}>Keep design intent, balance thoughts, and open questions together.</small>
          <small id={`${fieldId}-count`}>{value.length.toLocaleString()} / 32,000</small>
        </div>
        {open && mentionLookup.mentions.length > 0
          ? <ClassMentionReferences
            lookup={mentionLookup}
            onNavigate={prepareMentionNavigation}
            onCreateDraft={requestDraft}
            createDraftPending={createDraft.isPending}
            createDraftError={createDraft.isError
              ? createDraft.error instanceof ApiError && createDraft.error.code === 'MENTION_ALREADY_RESOLVES'
                ? 'A matching reference appeared in another session. The lookup is refreshing; your note is unchanged.'
                : apiErrorMessage(createDraft.error)
              : undefined}
          />
          : null}
        {navigationError && <p className={styles.freeNoteNavigationError} role="alert">The reference was not opened because this tab could not preserve your note draft.</p>}
        {draftCreatedMessage && <p className={styles.freeNoteDraftCreated} role="status">{draftCreatedMessage}</p>}
        <div className={styles.freeNotesActions}>
          {changed && <button className="button button-quiet" type="button" disabled={save.isPending} onClick={() => { onDraftChange(undefined); save.reset(); }}>Discard draft</button>}
          <button className="button button-primary" type="button" disabled={!changed || !record.data || record.isFetching || save.isPending || conflict} onClick={submit}>
            {save.isPending ? 'Saving note…' : 'Save note'}
          </button>
          <span className={styles.freeNotesStatus} role="status" aria-live="polite">
            {save.isPending ? 'Saving this class note…' : save.isSuccess ? 'Note saved.' : changed ? 'Unsaved changes' : ''}
          </span>
        </div>
      </>}
      {conflict && <div className={styles.freeNotesError} role="alert">
        <p>This class changed in another session. Your draft is still here. Load the latest version before saving it.</p>
        <button className="button button-quiet" type="button" disabled={record.isFetching} onClick={() => void loadLatestVersion()}>
          {record.isFetching ? 'Loading latest…' : 'Load latest version, keep draft'}
        </button>
      </div>}
      {latestLoaded && record.data && <details className={styles.freeNotesLatest}>
        <summary>Latest saved version · compare before replacing</summary>
        <p>{record.data.item.notes || 'The latest saved note is empty.'}</p>
      </details>}
      {save.isError && !conflict && <div className={styles.freeNotesError} role="alert">
        <p>{apiErrorMessage(save.error)}</p>
        <button className="button button-quiet" type="button" disabled={!record.data || record.isFetching} onClick={submit}>Retry save</button>
      </div>}
    </div>
  </details>;
}
