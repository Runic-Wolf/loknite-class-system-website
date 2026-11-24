import { useState, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import { apiErrorMessage } from '../../ui/feedback';
import { TagPickerField } from '../tags/TagPickerField';
import type { ClassOption, SkillItem, SkillKind, SkillWrite } from './types';
import styles from './skills.module.css';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a skill name.').max(160),
  kind: z.enum(['Passive', 'Active', 'Signature', 'Ultimate']),
  lcsNotes: z.string().max(12000),
  mobileNotes: z.string().max(12000),
  tags: z.array(z.string().max(80)).max(40),
}).superRefine((values, context) => {
  if (new Set(values.tags).size !== values.tags.length) context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique.' });
});

type Props = {
  item?: SkillItem | undefined;
  classOption?: ClassOption | undefined;
  classSearch: string;
  classCandidates: ClassOption[];
  searchingClasses: boolean;
  classError?: string | undefined;
  onClassSearch: (query: string) => void;
  onChooseClass: (option: ClassOption | undefined) => void;
  onSave: (input: SkillWrite) => Promise<void>;
  onCancel: () => void;
};

export function SkillEditor({ item, classOption, classSearch, classCandidates, searchingClasses, classError, onClassSearch, onChooseClass, onSave, onCancel }: Props) {
  const [values, setValues] = useState({
    name: item?.name ?? '', kind: item?.kind ?? 'Active' as SkillKind,
    lcsNotes: item?.lcsNotes ?? '', mobileNotes: item?.mobileNotes ?? '', tags: item?.tags ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const dirty = values.name !== (item?.name ?? '') || values.kind !== (item?.kind ?? 'Active') || values.lcsNotes !== (item?.lcsNotes ?? '') || values.mobileNotes !== (item?.mobileNotes ?? '') || JSON.stringify(values.tags) !== JSON.stringify(item?.tags ?? []);

  function set<K extends keyof typeof values>(key: K, value: typeof values[K]) {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: '' }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = schema.safeParse(values);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    if (!classOption) {
      setErrors({ classId: 'Choose the class that owns this skill.' });
      return;
    }
    setSaving(true); setSaveError('');
    try {
      const data = result.data;
      await onSave({ ...data, classId: item?.classId ?? classOption.id });
    } catch (error) { setSaveError(apiErrorMessage(error)); }
    finally { setSaving(false); }
  }

  function cancel() {
    if (dirty) setDiscardPrompt(true); else onCancel();
  }

  return <form className={styles.editor} onSubmit={submit}>
    <header className={styles.editorHead}><div><span className="eyebrow">{item ? 'SKILL RECORD' : 'NEW SKILL'}</span><h3>{item ? 'Edit skill' : 'Create a skill'}</h3></div><span className={styles.kindBadge}>{item?.kind ?? values.kind}</span></header>
    {saveError && <p className={styles.errorNotice} role="alert">{saveError}</p>}
    <div className={styles.formGrid}>
      <Field label="Name" error={errors.name}><input value={values.name} onChange={event => set('name', event.currentTarget.value)} autoComplete="off" maxLength={160} autoFocus /></Field>
      <Field label="Kind" error={errors.kind}><select value={values.kind} onChange={event => set('kind', event.currentTarget.value as SkillKind)}><option>Passive</option><option>Active</option><option>Signature</option><option>Ultimate</option></select></Field>
      {!item ? <div className={styles.classPicker}>
        <span className={styles.fieldLabel}>Owning class <span aria-hidden="true">*</span></span>
        {classOption ? <div className={styles.selectedClass}><span><strong>{classOption.name || '(unnamed class)'}</strong><small>{classOption.tier} · {classOption.slot}</small></span><button className="button button-quiet" type="button" onClick={() => { onClassSearch(''); onChooseClass(undefined); }}>Change</button></div>
          : <><label className={styles.classSearch}><span className="sr-only">Search classes</span><input value={classSearch} onChange={event => onClassSearch(event.currentTarget.value)} placeholder="Type a class name" autoComplete="off" /></label>
            {classError && <small className={styles.fieldError}>{classError}</small>}
            {searchingClasses ? <small className={styles.hint}>Searching classes…</small> : classCandidates.length > 0 && <ul className={styles.classOptions} aria-label="Class matches">{classCandidates.slice(0, 8).map(option => <li key={option.id}><button type="button" onClick={() => onChooseClass(option)}><span><strong>{option.name || '(unnamed class)'}</strong><small>{option.tier} · {option.slot}</small></span><span aria-hidden="true">→</span></button></li>)}</ul>}
            {classSearch.trim().length >= 2 && !searchingClasses && !classCandidates.length && !classError && <small className={styles.hint}>No classes match that search.</small>}
          </>}
        {errors.classId && <small className={styles.fieldError}>{errors.classId}</small>}
      </div> : <div className={styles.selectedClass}><span><strong>{classOption?.name || '(unnamed class)'}</strong><small>{classOption?.slot} · class is fixed after creation</small></span></div>}
      <TagPickerField value={values.tags} onChange={tags => set('tags', tags)} disabled={saving} error={errors.tags} />
      <Field label="Studio notes" hint="Planning notes used by the desktop class system." error={errors.lcsNotes} wide><textarea value={values.lcsNotes} onChange={event => set('lcsNotes', event.currentTarget.value)} rows={5} maxLength={12000} /></Field>
      <Field label="Mobile notes" hint="Notes used by the mobile card layout." error={errors.mobileNotes} wide><textarea value={values.mobileNotes} onChange={event => set('mobileNotes', event.currentTarget.value)} rows={4} maxLength={12000} /></Field>
    </div>
    {discardPrompt && <div className={styles.discardNotice} role="alert"><p>Discard the unsaved skill changes?</p><button className="button button-quiet" type="button" onClick={() => setDiscardPrompt(false)}>Continue editing</button><button className="button button-danger" type="button" onClick={onCancel}>Discard</button></div>}
    <footer className={styles.formActions}><span>{dirty ? 'Unsaved changes' : 'Ready to save'}</span><button className="button button-quiet" type="button" onClick={cancel}>Cancel</button><button className="button button-primary" type="submit" disabled={saving || (!item && !classOption)}>{saving ? 'Saving…' : item ? 'Save skill' : 'Create skill'}</button></footer>
  </form>;
}

function Field({ label, hint, error, wide, children }: { label: string; hint?: string | undefined; error?: string | undefined; wide?: boolean; children: ReactNode }) {
  return <label className={`${styles.field}${wide ? ` ${styles.fieldWide}` : ''}`}><span>{label}</span>{children}{hint && <small className={styles.hint}>{hint}</small>}{error && <small className={styles.fieldError} role="alert">{error}</small>}</label>;
}
