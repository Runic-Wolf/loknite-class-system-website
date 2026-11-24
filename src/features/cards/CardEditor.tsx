import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ClassLineageRoot, ClassRow } from '../classes/types';
import type { CardItem, CardRow, CardWrite } from './types';
import styles from './cards.module.css';
import { MediaUploadField } from '../../ui/MediaUploadField';
import { TagPickerField } from '../tags/TagPickerField';
import { CardFace } from './CardFace';
import { defaultSceneLayer, sceneLayerBounds } from '../../../shared/card-scene.js';
import { sceneLayers, sceneMediaUrl, uploadScenePoster, type SceneLayer, type SceneLayerSettings, type SceneSettings } from './card-scene';

const cardTypes = ['Attack', 'Skill', 'Power', 'Other', 'Class Mechanic'] as const;
const cardElements = ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'] as const;
const cardCosts = ['0', '1', '2', '3', '4', '5', 'X'] as const;
const materialMasks = [
  { field: 'goldMaskPath', label: 'Gold outline mask', hint: 'Export the outline as a thin, opaque band on a transparent canvas.' },
  { field: 'prismMaskPath', label: 'Prism foil mask', hint: 'Use opacity to choose where the prism foil appears.' },
] as const;
const emptyScene = { sceneBackPath: '', sceneMidPath: '', sceneFrontPath: '', sceneSmokePath: '' };
const workflowStatuses = [['draft', 'Draft'], ['review', 'In review'], ['completed', 'Completed'], ['audited', 'Audited']] as const;

const categories = [
  ['class', 'Class'], ['enemy', 'Enemy'], ['neutral', 'Neutral'],
  ['equipment', 'Equipment'], ['species', 'Species'], ['status', 'Status'],
] as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a card name.').max(160),
  type: z.enum(['', 'Attack', 'Skill', 'Power', 'Other', 'Class Mechanic']),
  element: z.enum(['', 'Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy']),
  cost: z.enum(['', '0', '1', '2', '3', '4', '5', 'X']),
  workflowStatus: z.enum(['draft', 'review', 'completed', 'audited']),
  ruleText: z.string().max(12000),
  flavourText: z.string().max(12000),
  artPath: z.string().max(1024),
  goldMaskPath: z.string().max(1024),
  prismMaskPath: z.string().max(1024),
  sceneBackPath: z.string().trim().max(1024),
  sceneMidPath: z.string().trim().max(1024),
  sceneFrontPath: z.string().trim().max(1024),
  sceneSmokePath: z.string().trim().max(1024),
  visualProfile: z.enum(['framed', 'full-art-v1']),
  tags: z.array(z.string().max(80)).max(40),
  category: z.enum(['class', 'enemy', 'neutral', 'equipment', 'species', 'status']),
  ownerId: z.string(),
  nameFontSize: z.number().int().min(8).max(32),
  typeFontSize: z.number().int().min(4).max(24),
  elementFontSize: z.number().int().min(4).max(24),
  ruleFontSize: z.number().int().min(4).max(32),
  flavourFontSize: z.number().int().min(4).max(32),
  ruleTextOffsetY: z.number().int().min(-50).max(50),
  flavourTextOffsetY: z.number().int().min(-50).max(50),
  artZoomPercent: z.number().int().min(50).max(200),
  artOffsetXPercent: z.number().int().min(-50).max(50),
  artOffsetYPercent: z.number().int().min(-50).max(50),
}).superRefine((values, context) => {
  if (new Set(values.tags).size !== values.tags.length) context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique.' });
  const sceneCount = [values.sceneBackPath, values.sceneMidPath, values.sceneFrontPath].filter(Boolean).length;
  if (sceneCount || values.sceneSmokePath) {
    if (sceneCount !== 3) {
      context.addIssue({ code: 'custom', path: ['sceneBackPath'], message: 'Add a background, subjects, and foreground to save a layered scene.' });
    }
  }
});

type FormValues = z.infer<typeof schema>;

type Props = {
  item?: CardItem | undefined;
  lineages: ClassLineageRoot[];
  classOptions?: ClassRow[] | undefined;
  initialCategory?: CardItem['category'] | undefined;
  initialOwnerId?: string | null | undefined;
  initialSlot?: number | undefined;
  saving: boolean;
  onSave: (input: CardWrite, next: 'close' | 'another') => Promise<boolean>;
  onCancel: () => void;
};

export function CardEditor({ item, lineages, classOptions = [], initialCategory, initialOwnerId, initialSlot, saving: savingRecord, onSave, onCancel }: Props) {
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [uploadStates, setUploadStates] = useState<Record<string, boolean>>({});
  const uploading = Object.values(uploadStates).some(Boolean);
  function markUpload(field: string, active: boolean) {
    setUploadStates(current => ({ ...current, [field]: active }));
  }
  const [showScene, setShowScene] = useState(true);
  const [showSceneMotion, setShowSceneMotion] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<SceneLayer | null>(null);
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(item?.sceneSettings ?? {});
  const [bakingPoster, setBakingPoster] = useState(false);
  const [posterError, setPosterError] = useState('');
  const saving = savingRecord || bakingPoster;
  const sceneSettingsChanged = JSON.stringify(sceneSettings) !== JSON.stringify(item?.sceneSettings ?? {});
  const selectedSettings = selectedLayer ? sceneSettings[selectedLayer] ?? defaultSceneLayer(selectedLayer) : null;

  function changeLayer(layer: SceneLayer, patch: Partial<SceneLayerSettings>) {
    setSceneSettings(current => ({ ...current, [layer]: { ...defaultSceneLayer(layer), ...current[layer], ...patch } }));
    setPosterError('');
  }
  const sceneControls = useRef<HTMLDetailsElement>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const submitNext = useRef<'close' | 'another'>('close');
  const nameInput = useRef<HTMLInputElement>(null);
  const filePicker = useRef<(() => void) | null>(null);
  const registerFilePicker = useCallback((open: (() => void) | null) => { filePicker.current = open; }, []);
  const updateArtPreview = useCallback((url: string | null) => setArtPreview(url), []);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: item?.name ?? '', type: item?.type ?? 'Skill', element: item?.element ?? 'Neutral',
      cost: item?.cost ?? '0', workflowStatus: item?.workflowStatus ?? 'draft', ruleText: item?.ruleText ?? '', flavourText: item?.flavourText ?? '',
      artPath: item?.artPath ?? '', tags: item?.tags ?? [],
      goldMaskPath: item?.goldMaskPath ?? '', prismMaskPath: item?.prismMaskPath ?? '',
      sceneBackPath: item?.sceneBackPath ?? '', sceneMidPath: item?.sceneMidPath ?? '',
      sceneFrontPath: item?.sceneFrontPath ?? '', sceneSmokePath: item?.sceneSmokePath ?? '',
      visualProfile: item ? item.visualProfile ?? 'framed' : 'full-art-v1',
      category: item?.category ?? initialCategory ?? 'class', ownerId: item?.ownerId ?? initialOwnerId ?? '',
      nameFontSize: item?.nameFontSize ?? 17, typeFontSize: item?.typeFontSize ?? 6, elementFontSize: item?.elementFontSize ?? 6,
      ruleFontSize: item?.ruleFontSize ?? 10, flavourFontSize: item?.flavourFontSize ?? 7,
      ruleTextOffsetY: item?.ruleTextOffsetY ?? 0, flavourTextOffsetY: item?.flavourTextOffsetY ?? 0,
      artZoomPercent: item?.artZoomPercent ?? 100, artOffsetXPercent: item?.artOffsetXPercent ?? 0, artOffsetYPercent: item?.artOffsetYPercent ?? 0,
    },
  });
  const values = useWatch({ control: form.control });
  const hasScene = Boolean(values.sceneBackPath?.trim() && values.sceneMidPath?.trim() && values.sceneFrontPath?.trim());
  const canFrameArtwork = Boolean(values.artPath || artPreview || hasScene);
  const nameRegistration = form.register('name');
  const ownerOptions = [...new Map([...lineages, ...classOptions].map(option => [option.id, option])).values()];
  const previewOwner = ownerOptions.find(option => option.id === (values.ownerId || item?.layoutClassId || item?.ownerId)) ?? null;
  const previewRoot = previewOwner?.tier === 'C1'
    ? previewOwner
    : previewOwner
      ? ownerOptions.find(option => option.tier === 'C1' && previewOwner.slot.startsWith(option.slot)) ?? null
      : lineages.find(option => Number(option.slot.slice(3)) === (item?.slot ?? initialSlot ?? 0)) ?? null;
  const previewSlot = Number(previewRoot?.slot.slice(3) ?? item?.slot ?? initialSlot ?? 0);
  const previewRow: CardRow = {
    id: item?.id ?? 'live-card-preview', name: values.name || '', category: values.category ?? item?.category ?? 'class',
    type: values.type ?? item?.type ?? 'Skill', element: values.element ?? item?.element ?? 'Neutral', cost: values.cost ?? item?.cost ?? '0',
    status: item?.status ?? 'RASCUNHO', workflowStatus: values.workflowStatus ?? item?.workflowStatus ?? 'draft',
    ruleTextPreview: values.ruleText?.slice(0, 280) ?? '', artPath: values.artPath || null,
    visualProfile: values.visualProfile ?? 'framed',
    goldMaskPath: values.goldMaskPath || null, prismMaskPath: values.prismMaskPath || null,
    sceneSettings, scenePosterPath: item?.scenePosterPath ?? null,
    sceneBackPath: values.sceneBackPath?.trim() || null, sceneMidPath: values.sceneMidPath?.trim() || null,
    sceneFrontPath: values.sceneFrontPath?.trim() || null, sceneSmokePath: values.sceneSmokePath?.trim() || null,
    ownerId: values.ownerId || item?.ownerId || null, layoutClassId: previewOwner?.id ?? item?.layoutClassId ?? null,
    slot: previewSlot, ownerName: previewOwner?.name ?? previewRoot?.name ?? null,
    ownerTier: previewOwner?.tier ?? ((values.category ?? item?.category ?? 'class') === 'class' ? 'C1' : null),
    ownerSlot: previewOwner?.slot ?? previewRoot?.slot ?? ((values.category ?? item?.category ?? 'class') === 'class' ? `C1_${previewSlot}` : null),
    ownerIcon: previewRoot?.icon ?? null, ownerArtwork: previewRoot?.artwork ?? null,
    nameFontSize: values.nameFontSize ?? 17, typeFontSize: values.typeFontSize ?? 6, elementFontSize: values.elementFontSize ?? 6,
    ruleFontSize: values.ruleFontSize ?? 10, flavourFontSize: values.flavourFontSize ?? 7,
    ruleTextOffsetY: values.ruleTextOffsetY ?? 0, flavourTextOffsetY: values.flavourTextOffsetY ?? 0,
    artZoomPercent: values.artZoomPercent ?? 100, artOffsetXPercent: values.artOffsetXPercent ?? 0, artOffsetYPercent: values.artOffsetYPercent ?? 0,
  };

  function selectPreviewField(field: 'name' | 'type' | 'element' | 'cost' | 'ruleText' | 'flavourText') {
    form.setFocus(field);
  }

  function cancel() {
    if (form.formState.isDirty || sceneSettingsChanged) setDiscardPrompt(true);
    else onCancel();
  }

  return <form className={styles.editor} onSubmit={form.handleSubmit(async values => {
    const next = submitNext.current;
    submitNext.current = 'close';
    let scenePosterPath = item?.scenePosterPath ?? null;
    const completeScene = Boolean(values.sceneBackPath && values.sceneMidPath && values.sceneFrontPath);
    const layersChanged = sceneLayers.some(({ field }) => (values[field] || null) !== (item?.[field] ?? null));
    setPosterError('');
    if (completeScene && (!scenePosterPath || layersChanged || sceneSettingsChanged)) {
      setBakingPoster(true);
      try {
        scenePosterPath = await uploadScenePoster({
          back: sceneMediaUrl(values.sceneBackPath),
          smoke: sceneMediaUrl(values.sceneSmokePath),
          mid: sceneMediaUrl(values.sceneMidPath),
          front: sceneMediaUrl(values.sceneFrontPath),
        }, sceneSettings);
      } catch (error) {
        setPosterError(error instanceof Error ? error.message : 'The scene poster could not be saved.');
        return;
      } finally {
        setBakingPoster(false);
      }
    } else if (!completeScene) {
      scenePosterPath = null;
    }

    const saved = await onSave({
      name: values.name,
      type: values.type,
      element: values.element,
      cost: values.cost,
      workflowStatus: values.workflowStatus,
      ruleText: values.ruleText,
      flavourText: values.flavourText,
      artPath: values.artPath.trim() || null,
      goldMaskPath: values.goldMaskPath.trim() || null,
      prismMaskPath: values.prismMaskPath.trim() || null,
      sceneSettings: completeScene && Object.keys(sceneSettings).length ? sceneSettings : null,
      scenePosterPath,
      sceneBackPath: values.sceneBackPath || null, sceneMidPath: values.sceneMidPath || null,
      sceneFrontPath: values.sceneFrontPath || null, sceneSmokePath: values.sceneSmokePath || null,
      ...(values.type !== 'Class Mechanic' ? { visualProfile: values.visualProfile } : {}),
      tags: values.tags,
      nameFontSize: values.nameFontSize, typeFontSize: values.typeFontSize, elementFontSize: values.elementFontSize,
      ruleFontSize: values.ruleFontSize, flavourFontSize: values.flavourFontSize,
      ruleTextOffsetY: values.ruleTextOffsetY, flavourTextOffsetY: values.flavourTextOffsetY,
      artZoomPercent: values.artZoomPercent, artOffsetXPercent: values.artOffsetXPercent, artOffsetYPercent: values.artOffsetYPercent,
      ...(!item ? { category: values.category, ownerId: values.ownerId || null, ...(initialSlot !== undefined ? { slot: initialSlot } : {}) } : {}),
    }, next);
    if (saved && next === 'another') {
      setSceneSettings({});
      setSelectedLayer(null);
      form.reset({ ...values, name: '', ruleText: '', flavourText: '', artPath: '', goldMaskPath: '', prismMaskPath: '', ...emptyScene, tags: [], artZoomPercent: 100, artOffsetXPercent: 0, artOffsetYPercent: 0 });
      requestAnimationFrame(() => nameInput.current?.focus());
    }
  }, errors => {
    if (errors.sceneBackPath && sceneControls.current) {
      sceneControls.current.open = true;
      sceneControls.current.querySelector('summary')?.focus();
    }
  })}>
    <div className={styles.editorHead}><div><span className="eyebrow">{item ? 'CARD RECORD' : 'NEW CARD'}</span><h3>{item ? 'Edit card' : 'Create a draft'}</h3></div><span className={styles.draftBadge}>RASCUNHO</span></div>
    <div className={styles.editorWorkspace}>
    <section className={styles.previewColumn} aria-label="Live card preview">
      <div className={styles.previewHeading}><div><span className="eyebrow">LIVE PREVIEW</span><strong>Card composition</strong></div><span>Updates as you edit</span></div>
      <div className={styles.livePreview}><CardFace row={previewRow} fullRule={values.ruleText} fullFlavour={values.flavourText} artPreview={artPreview} editable={!saving} fitText previewScene={showScene && hasScene} previewSceneMotion={showSceneMotion && !selectedLayer} selectedLayer={selectedLayer} onSceneLayerMove={(layer, x, y) => changeLayer(layer, { x, y })} onSelectField={selectPreviewField} onChooseArtwork={() => filePicker.current?.()} onArtworkOffsetChange={(x, y) => {
        form.setValue('artOffsetXPercent', x, { shouldDirty: true });
        form.setValue('artOffsetYPercent', y, { shouldDirty: true });
      }} /></div>
      {hasScene && values.visualProfile === 'full-art-v1' && <div className={styles.scenePreviewControls}>
        <label><input type="checkbox" checked={showScene} onChange={event => setShowScene(event.currentTarget.checked)} /> Show scene layers</label>
        <label><input type="checkbox" checked={showSceneMotion && !selectedLayer} disabled={!showScene} onChange={event => {
          setShowSceneMotion(event.currentTarget.checked);
          if (event.currentTarget.checked) setSelectedLayer(null);
        }} /> Preview parallax</label>
      </div>}
      <p className={styles.previewHint}>{showScene && selectedLayer && hasScene ? 'Drag the selected layer in the preview, or use the position controls.' : 'Drag the artwork to reframe it. Use Artwork framing for precise zoom and position.'}</p>
    </section>
    <div className={styles.editorFields}>
    <div className={styles.formGrid}>
      {!item && <Field label="Category" error={form.formState.errors.category?.message}><select {...form.register('category')}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
      {!item && <Field label="Class lineage" hint="Optional. Links this card to a class slot." error={form.formState.errors.ownerId?.message}><select {...form.register('ownerId')}><option value="">Independent card</option>{ownerOptions.map(owner => <option value={owner.id} key={owner.id}>{owner.tier} · {owner.name || '?'} · {owner.slot}</option>)}</select></Field>}
      <Field label="Name" error={form.formState.errors.name?.message}><input {...nameRegistration} ref={node => { nameRegistration.ref(node); nameInput.current = node; }} autoComplete="off" maxLength={160} autoFocus={!item} /></Field>
      <Field label="Type" error={form.formState.errors.type?.message}><select {...form.register('type')} disabled={item?.type === 'Class Mechanic'}><option value="">Unassigned type</option>{cardTypes.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="Element" error={form.formState.errors.element?.message}><select {...form.register('element')}><option value="">Unassigned element</option>{cardElements.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="Cost" error={form.formState.errors.cost?.message}><select {...form.register('cost')}><option value="">Unassigned cost</option>{cardCosts.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
      <Field label="Editorial workflow" hint="Review progress is separate from gameplay approval." error={form.formState.errors.workflowStatus?.message}><select {...form.register('workflowStatus')}>{workflowStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      {values.type !== 'Class Mechanic' && <Field label="Card layout" error={form.formState.errors.visualProfile?.message}>
        <select {...form.register('visualProfile')} disabled={saving}>
          <option value="full-art-v1">Full art</option>
          <option value="framed">Classic frame</option>
        </select>
      </Field>}
      <MediaUploadField
        id="card-artwork"
        label="Artwork path"
        hint="Paste an existing media vault path or upload a new piece of art."
        value={form.watch('artPath')}
        error={form.formState.errors.artPath?.message}
        disabled={saving || Boolean(uploadStates.goldMaskPath || uploadStates.prismMaskPath)}
        onChange={path => {
          if (path !== form.getValues('artPath')) {
            for (const { field } of materialMasks) form.setValue(field, '', { shouldDirty: true });
          }
          form.setValue('artPath', path, { shouldDirty: true, shouldValidate: true });
        }}
        onUploadingChange={active => markUpload('artPath', active)}
        onPreviewChange={updateArtPreview}
        onOpenFilePickerChange={registerFilePicker}
      />
      {values.visualProfile === 'full-art-v1' && values.type !== 'Class Mechanic' && values.artPath && !artPreview && (
        <details className={`${styles.visualControls} ${styles.fieldWide}`}>
          <summary><strong>Art materials</strong></summary>
          <fieldset className={styles.visualFields} disabled={saving}>
            <p>Use transparent PNGs with the same canvas and crop as the original artwork. Both masks follow its zoom and position.</p>
            {materialMasks.map(({ field, label, hint }) => (
              <MediaUploadField key={field}
                id={`card-${field}`}
                label={label}
                hint={hint}
                value={values[field] ?? ''}
                error={form.formState.errors[field]?.message}
                disabled={saving || Boolean(uploadStates.artPath)}
                onChange={path => form.setValue(field, path, { shouldDirty: true, shouldValidate: true })}
                onUploadingChange={active => markUpload(field, active)}
              />
            ))}
          </fieldset>
        </details>
      )}
      {values.type !== 'Class Mechanic' && (values.visualProfile === 'full-art-v1' || sceneLayers.some(({ field }) => values[field])) && (
        <details className={`${styles.visualControls} ${styles.fieldWide}`} ref={sceneControls}>
          <summary><strong>Full art layers</strong></summary>
          <fieldset className={styles.visualFields} disabled={saving}>
            <p>Use matching canvases to keep the layers aligned. Saving a full art scene builds its collection poster.</p>
            {hasScene && <div className={styles.sceneLayerControls}>
              <Field label="Layer to adjust">
                <select aria-label="Layer to adjust" value={selectedLayer ?? ''} onChange={event => {
                  setSelectedLayer((event.currentTarget.value || null) as SceneLayer | null);
                  setShowScene(true);
                  setShowSceneMotion(false);
                }}>
                  <option value="">Whole composition</option>
                  {sceneLayers.filter(({ field }) => Boolean(values[field]?.trim())).map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </Field>
              {selectedLayer && selectedSettings && <>
                <div className={styles.visualGrid}>
                  {([
                    ['x', 'Layer horizontal position', '%'], ['y', 'Layer vertical position', '%'], ['zoom', 'Layer zoom', '%'],
                    ['opacity', 'Layer opacity', '%'], ['depth', 'Parallax depth', ''],
                  ] as const).map(([key, label, suffix]) => (
                    <VisualControl key={key} label={label} min={sceneLayerBounds[key][0]!} max={sceneLayerBounds[key][1]!}
                      suffix={suffix} value={selectedSettings[key]} onChange={value => changeLayer(selectedLayer, { [key]: value })} />
                  ))}
                </div>
                <label><input type="checkbox" checked={selectedSettings.visible} onChange={event => changeLayer(selectedLayer, { visible: event.currentTarget.checked })} /> Show selected layer</label>
                <button type="button" className="button button-quiet" onClick={() => {
                  setSceneSettings(current => {
                    const next = { ...current };
                    delete next[selectedLayer];
                    return next;
                  });
                  setPosterError('');
                }}>Reset selected layer</button>
              </>}
            </div>}
            {sceneLayers.map(({ id, field, label, hint }) => (
              <MediaUploadField key={field}
                id={`card-${field}`}
                label={label}
                hint={hint}
                value={values[field] ?? ''}
                error={form.formState.errors[field]?.message}
                onChange={path => {
                  form.setValue(field, path, { shouldDirty: true });
                  setPosterError('');
                  if (!path && selectedLayer === id) setSelectedLayer(null);
                  if (form.formState.isSubmitted) void form.trigger('sceneBackPath');
                }}
                onUploadingChange={active => markUpload(field, active)}
              />
            ))}
            {sceneLayers.some(({ field }) => values[field]) && (
              <button className="button button-quiet" type="button" disabled={uploading} onClick={() => {
                for (const { field } of sceneLayers) form.setValue(field, '', { shouldDirty: true });
                setSceneSettings({});
                setSelectedLayer(null);
                setPosterError('');
                void form.trigger('sceneBackPath');
              }}>Clear all scene layers</button>
            )}
          </fieldset>
        </details>
      )}
      <section className={`${styles.artworkFraming} ${styles.fieldWide}`} aria-label="Artwork framing">
        <div><strong>Artwork framing</strong><p>{canFrameArtwork ? 'Drag the image in the preview, or adjust zoom and position here.' : 'Add artwork to enable zoom and position controls.'}</p></div>
        <div className={styles.visualGrid}>
          <VisualControl label="Zoom" min={50} max={200} suffix="%" value={values.artZoomPercent ?? 100} disabled={!canFrameArtwork} onChange={value => form.setValue('artZoomPercent', value, { shouldDirty: true })} />
          <VisualControl label="Horizontal position" min={-50} max={50} suffix="%" value={values.artOffsetXPercent ?? 0} disabled={!canFrameArtwork} onChange={value => form.setValue('artOffsetXPercent', value, { shouldDirty: true })} />
          <VisualControl label="Vertical position" min={-50} max={50} suffix="%" value={values.artOffsetYPercent ?? 0} disabled={!canFrameArtwork} onChange={value => form.setValue('artOffsetYPercent', value, { shouldDirty: true })} />
        </div>
      </section>
      <TagPickerField
        value={form.watch('tags')}
        onChange={tags => form.setValue('tags', tags, { shouldDirty: true, shouldValidate: true })}
        cardElement={form.watch('element')}
        disabled={saving || uploading}
        error={form.formState.errors.tags?.message}
      />
      <Field label="Rule text" error={form.formState.errors.ruleText?.message} wide><textarea {...form.register('ruleText')} rows={5} maxLength={12000} /></Field>
      <Field label="Flavour text" error={form.formState.errors.flavourText?.message} wide><textarea {...form.register('flavourText')} rows={4} maxLength={12000} /></Field>
    </div>
    <details className={styles.visualControls}>
      <summary><strong>Typography and text placement</strong><span>Optional fine tuning</span></summary>
      <fieldset className={styles.visualFields} disabled={saving}>
      <p>{values.visualProfile === 'full-art-v1' && values.type !== 'Class Mechanic'
        ? 'The rules panel grows with its text. Adjust the preferred type sizes here.'
        : 'Text automatically fits its card area. These settings adjust the preferred maximum and vertical placement.'}</p>
      <div className={styles.visualGrid}>
        <VisualControl label="Name size" min={8} max={32} value={values.nameFontSize ?? 17} onChange={value => form.setValue('nameFontSize', value, { shouldDirty: true })} />
        <VisualControl label="Type size" min={4} max={24} value={values.typeFontSize ?? 6} onChange={value => form.setValue('typeFontSize', value, { shouldDirty: true })} />
        <VisualControl label="Element size" min={4} max={24} value={values.elementFontSize ?? 6} onChange={value => form.setValue('elementFontSize', value, { shouldDirty: true })} />
        <VisualControl label="Rules size" min={4} max={32} value={values.ruleFontSize ?? 10} onChange={value => form.setValue('ruleFontSize', value, { shouldDirty: true })} />
        <VisualControl label="Flavour size" min={4} max={32} value={values.flavourFontSize ?? 7} onChange={value => form.setValue('flavourFontSize', value, { shouldDirty: true })} />
        {(values.visualProfile !== 'full-art-v1' || values.type === 'Class Mechanic') && <>
          <VisualControl label="Rules vertical position" min={-50} max={50} suffix=" px" value={values.ruleTextOffsetY ?? 0} onChange={value => form.setValue('ruleTextOffsetY', value, { shouldDirty: true })} />
          <VisualControl label="Flavour vertical position" min={-50} max={50} suffix=" px" value={values.flavourTextOffsetY ?? 0} onChange={value => form.setValue('flavourTextOffsetY', value, { shouldDirty: true })} />
        </>}
      </div>
      </fieldset>
    </details>
    </div>
    </div>
    {discardPrompt && <div className={styles.discardNotice} role="alert"><p>Discard the changes in this draft?</p><button className="button button-quiet" type="button" onClick={() => setDiscardPrompt(false)}>Continue editing</button><button className="button button-danger" type="button" onClick={onCancel}>Discard</button></div>}
    {posterError && <p className={styles.fieldError} role="alert">{posterError}</p>}
    <div className={styles.formActions}>
      <span className={styles.formStatus}>{bakingPoster ? 'Building scene poster…' : uploading ? 'Uploading artwork…' : (form.formState.isDirty || sceneSettingsChanged) ? 'Unsaved changes' : 'All changes saved'}</span>
      <button className="button button-quiet" type="button" onClick={cancel} disabled={uploading || saving}>Cancel</button>
      {!item && <button className="button button-primary" type="submit" onClick={() => { submitNext.current = 'another'; }} disabled={saving || uploading}>{saving ? 'Saving…' : 'Create and add another'}</button>}
      {!item && <button className="button button-quiet" type="submit" onClick={() => { submitNext.current = 'close'; }} disabled={saving || uploading}>{saving ? 'Saving…' : 'Create and close'}</button>}
      {item && <button className="button button-primary" type="submit" onClick={() => { submitNext.current = 'close'; }} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save card'}</button>}
    </div>
  </form>;
}

function VisualControl({ label, min, max, value, suffix = ' px', disabled = false, onChange }: { label: string; min: number; max: number; value: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <label className={styles.visualControl}>
    <span>{label}</span><output>{value}{suffix}</output>
    <input type="range" min={min} max={max} step={1} value={value} aria-label={label} disabled={disabled} onChange={event => onChange(Number(event.currentTarget.value))} />
  </label>;
}

function Field({ label, hint, error, wide = false, children }: { label: string; hint?: string | undefined; error?: string | undefined; wide?: boolean; children: ReactNode }) {
  return <label className={`${styles.field}${wide ? ` ${styles.fieldWide}` : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
    {error && <small className={styles.fieldError} role="alert">{error}</small>}
  </label>;
}
