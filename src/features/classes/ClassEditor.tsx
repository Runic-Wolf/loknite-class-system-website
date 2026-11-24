import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../app/api';
import { updateClass } from './api';
import type { ClassRecord, ClassUpdate } from './types';
import styles from './classes.module.css';
import { MediaUploadField } from '../../ui/MediaUploadField';
import { TagPickerField } from '../tags/TagPickerField';

const classFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a class name.').max(160, 'Use 160 characters or fewer.'),
  concept: z.string().max(4000, 'Use 4,000 characters or fewer.'),
  notes: z.string().max(32000, 'Use 32,000 characters or fewer.'),
  tags: z.array(z.string().max(80, 'Each tag must be 80 characters or fewer.')).max(40, 'Use 40 tags or fewer.'),
  imagePath: z.string().max(500, 'Use 500 characters or fewer.'),
}).superRefine((values, context) => {
  if (new Set(values.tags).size !== values.tags.length) context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique.' });
});

type ClassFormValues = z.infer<typeof classFormSchema>;

function toUpdate(values: ClassFormValues): ClassUpdate {
  return {
    name: values.name.trim(),
    concept: values.concept,
    notes: values.notes,
    tags: values.tags,
    imagePath: values.imagePath.trim() || null,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return 'This class changed in another session. Your text is still here; reload the latest version to compare before saving again.';
  if (error instanceof ApiError && error.status === 428) return 'The version check is missing. Reload the class before trying again.';
  if (error instanceof Error) return error.message;
  return 'The class could not be saved. Your text is still here; try again.';
}

export function ClassEditor({ record, onCancel }: { record: ClassRecord; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [uploading, setUploading] = useState(false);
  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: record.item.name ?? '',
      concept: record.item.concept ?? '',
      notes: record.item.notes ?? '',
      tags: record.item.tags ?? [],
      imagePath: record.item.imagePath ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (input: ClassUpdate) => updateClass(record.item.id, record.version, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog', 'classes'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'class', record.item.id] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog', 'mentions'] }),
      ]);
      setSearchParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete('edit');
        next.delete('error');
        next.set('saved', '1');
        return next;
      });
    },
  });

  async function submit(values: ClassFormValues) {
    try { await save.mutateAsync(toUpdate(values)); } catch { /* The mutation state displays the error and retains the form. */ }
  }

  function cancelEdit() {
    if (form.formState.isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }

  const conflict = save.error instanceof ApiError && save.error.status === 409;

  return <form className={styles.editor} onSubmit={form.handleSubmit(submit)} aria-busy={save.isPending || uploading}>
    <div className={styles.formGrid}>
      <Field label="Class name" id="class-name" error={form.formState.errors.name?.message}>
        <input id="class-name" maxLength={160} autoComplete="off" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'class-name-error' : undefined} {...form.register('name')} />
      </Field>
      <Field label="Concept" id="class-concept" error={form.formState.errors.concept?.message}>
        <input id="class-concept" maxLength={4000} aria-invalid={Boolean(form.formState.errors.concept)} aria-describedby={form.formState.errors.concept ? 'class-concept-error' : undefined} {...form.register('concept')} />
      </Field>
    </div>
    <Field label="Notes" id="class-notes" error={form.formState.errors.notes?.message}>
      <textarea id="class-notes" rows={7} maxLength={32000} aria-invalid={Boolean(form.formState.errors.notes)} aria-describedby={form.formState.errors.notes ? 'class-notes-error' : undefined} {...form.register('notes')} />
    </Field>
    <div className={styles.formGrid}>
      <TagPickerField
        value={form.watch('tags')}
        onChange={tags => form.setValue('tags', tags, { shouldDirty: true, shouldValidate: true })}
        disabled={save.isPending || uploading}
        error={form.formState.errors.tags?.message}
      />
      <MediaUploadField
        id="class-image"
        label="Image path"
        hint="Optional. Paste an existing vault path or upload new artwork."
        maxLength={500}
        value={form.watch('imagePath')}
        error={form.formState.errors.imagePath?.message}
        disabled={save.isPending}
        onChange={path => form.setValue('imagePath', path, { shouldDirty: true, shouldValidate: true })}
        onUploadingChange={setUploading}
      />
    </div>
    <div className={styles.formActions}>
      <button className="button button-quiet" type="button" onClick={cancelEdit} disabled={save.isPending || uploading}>Cancel</button>
      <button className="button button-primary" type="submit" disabled={save.isPending || uploading}>{uploading ? 'Uploading artwork…' : save.isPending ? 'Saving…' : 'Save class'}</button>
      <span className={styles.formStatus} role="status" aria-live="polite">{uploading ? 'Uploading artwork…' : save.isPending ? 'Saving this class…' : save.isSuccess ? 'Class saved.' : ''}</span>
    </div>
    {save.isError && <div className={styles.formError} role="alert">
      <p>{errorMessage(save.error)}</p>
      {conflict && <button className="button button-quiet" type="button" onClick={async () => {
        await queryClient.invalidateQueries({ queryKey: ['catalog', 'class', record.item.id] });
        onCancel();
      }}>Discard draft and reload latest</button>}
      {!conflict && <button className="button button-quiet" type="button" onClick={() => void form.handleSubmit(submit)()}>Try save again</button>}
    </div>}
    {confirmDiscard && <div className={styles.discardNotice} role="group" aria-label="Unsaved changes">
      <p>Discard the changes you have not saved?</p>
      <button className="button button-quiet" type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
      <button className="button button-primary" type="button" onClick={onCancel}>Discard changes</button>
    </div>}
  </form>;
}

function Field({ label, id, hint, error, children }: { label: string; id: string; hint?: string | undefined; error?: string | undefined; children: ReactNode }) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && !error && <small id={hintId}>{hint}</small>}
    {error && <small id={errorId} className={styles.fieldError}>{error}</small>}
  </div>;
}
