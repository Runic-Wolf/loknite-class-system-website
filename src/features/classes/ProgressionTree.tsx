import { useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { hrefWithParams } from '../../app/urls';
import { classNodeLabel, isPlaceholderClassName, slotOrdinal } from './progression';
import type { ClassProgression } from './progression';
import type { ClassNoteCursor, ClassRow } from './types';
import { ClassNotesInline } from './ClassNotesInline';
import styles from './classes.module.css';

const tierNames: Record<ClassRow['tier'], string> = {
  C1: 'C1 · Bronze', C2: 'C2 · Silver', C3: 'C3 · Gold', SPEC: 'Specialization',
};

function nodeHref(params: URLSearchParams, rootSlot: string, item: ClassRow): string {
  return hrefWithParams(params, {
    view: 'classes', lineage: rootSlot, id: item.id, edit: null, saved: null, error: null, after: null,
  });
}

function ClassNode({ item, rootSlot, params, selectedId, positionLabel, selectionMode, selectedClassIds, onToggleClassSelection, root = false }: {
  item: ClassRow;
  rootSlot: string;
  params: URLSearchParams;
  selectedId: string;
  positionLabel: string;
  selectionMode: boolean;
  selectedClassIds: ReadonlySet<string>;
  onToggleClassSelection: (id: string) => void;
  root?: boolean;
}) {
  const selected = item.id === selectedId;
  const selectionChecked = selectedClassIds.has(item.id);
  const placeholder = isPlaceholderClassName(item);
  const label = placeholder ? 'Name in progress' : classNodeLabel(item);
  const accessibleLabel = placeholder
    ? tierNames[item.tier] + ', ' + positionLabel + ', name in progress'
    : tierNames[item.tier] + ', ' + label + ', ' + positionLabel;
  const className = root ? styles.rootClassNode : item.tier === 'SPEC' ? styles.specializationNode : styles.progressionNode;

  const content = <>
    {root && item.artwork && <img className={styles.rootArtwork} src={'/media/' + item.artwork.split('/').map(encodeURIComponent).join('/')} alt="" width="600" height="260" fetchPriority="high" />}
    {root && <span className={styles.rootScrim} aria-hidden="true" />}
    {root && item.icon && <span className={styles.rootPortrait}><img src={item.icon} alt="" width="68" height="68" fetchPriority="high" /></span>}
    <span className={styles.nodeCopy}>
      <span className={styles.nodeKicker}>{tierNames[item.tier]}</span>
      <strong>{label}</strong>
      {placeholder && (root || item.tier === 'SPEC') && <span className={styles.nodeMeta}>{positionLabel}</span>}
    </span>
  </>;

  if (selectionMode) return <button
    className={className}
    type="button"
    data-class-node="true"
    data-node-id={item.id}
    data-node-parent={item.parentId ?? ''}
    data-node-tier={item.tier}
    data-node-position={slotOrdinal(item.slot)}
    data-selection-mode="true"
    data-selection-checked={selectionChecked ? 'true' : undefined}
    aria-pressed={selectionChecked}
    aria-label={`${selectionChecked ? 'Remove' : 'Add'} ${accessibleLabel} ${selectionChecked ? 'from' : 'to'} batch tag selection`}
    onClick={() => onToggleClassSelection(item.id)}
  >{content}</button>;

  return <Link
    className={className}
    data-class-node="true"
    data-node-id={item.id}
    data-node-parent={item.parentId ?? ''}
    data-node-tier={item.tier}
    data-node-position={slotOrdinal(item.slot)}
    data-selected={selected ? 'true' : undefined}
    aria-current={selected ? 'true' : undefined}
    aria-label={accessibleLabel}
    to={nodeHref(params, rootSlot, item)}
  >
    {content}
  </Link>;
}

type LastHorizontalPress = { rootId: string; key: string; time: number };

function nodeInDirection(target: HTMLElement, nodes: HTMLElement[], direction: string): HTMLElement | undefined {
  const current = target.getBoundingClientRect();
  const centerX = (current.left + current.right) / 2;
  const centerY = (current.top + current.bottom) / 2;
  let best: HTMLElement | undefined;
  let bestCost = Infinity;

  for (const candidate of nodes) {
    if (candidate === target) continue;
    const rect = candidate.getBoundingClientRect();
    const deltaX = (rect.left + rect.right) / 2 - centerX;
    const deltaY = (rect.top + rect.bottom) / 2 - centerY;
    if ((direction === 'ArrowLeft' && deltaX >= -7)
      || (direction === 'ArrowRight' && deltaX <= 7)
      || (direction === 'ArrowUp' && deltaY >= -7)
      || (direction === 'ArrowDown' && deltaY <= 7)) continue;

    const cost = direction === 'ArrowLeft' || direction === 'ArrowRight'
      ? Math.abs(deltaX) + Math.abs(deltaY) * 1.7
      : Math.abs(deltaY) + Math.abs(deltaX) * 0.65;
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

function handleTreeKeyDown(
  event: KeyboardEvent<HTMLElement>,
  selectionMode: boolean,
  rootId: string,
  lastHorizontal: { current: LastHorizontalPress },
  onSelectClass: (id: string) => void,
  onMoveRoot: (direction: -1 | 1) => void,
) {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-class-node="true"]');
  if (!target) return;

  const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-class-node="true"]')];
  const nodeId = target.dataset.nodeId;
  const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  if (horizontal) {
    const previous = lastHorizontal.current;
    const now = performance.now();
    const quickRepeat = !event.repeat && previous.rootId === rootId
      && previous.key === event.key && now - previous.time < 360;
    if (!event.repeat) lastHorizontal.current = { rootId, key: event.key, time: now };

    if (event.shiftKey || quickRepeat) {
      event.preventDefault();
      lastHorizontal.current = { rootId: '', key: '', time: 0 };
      onMoveRoot(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
  }

  const next = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ? nodeInDirection(target, nodes, event.key)
    : undefined;
  if (next) {
    event.preventDefault();
    next.focus();
    if (!selectionMode && next.dataset.nodeId) onSelectClass(next.dataset.nodeId);
  }
}

export function ProgressionTree({ progression, selectedId, params, noteDrafts, openNoteIds, restoreNoteId, restoreCursor, selectionMode, selectedClassIds, onToggleClassSelection, onSelectClass, onMoveRoot, onCursorRestored, onNoteOpenChange, onNoteDraftChange, onPrepareMentionNavigation }: {
  progression: ClassProgression;
  selectedId: string;
  params: URLSearchParams;
  noteDrafts: Record<string, string>;
  openNoteIds: ReadonlySet<string>;
  restoreNoteId: string | null;
  restoreCursor: ClassNoteCursor | undefined;
  selectionMode: boolean;
  selectedClassIds: ReadonlySet<string>;
  onToggleClassSelection: (id: string) => void;
  onSelectClass: (id: string) => void;
  onMoveRoot: (direction: -1 | 1) => void;
  onCursorRestored: () => void;
  onNoteOpenChange: (id: string, open: boolean) => void;
  onNoteDraftChange: (id: string, value: string | undefined) => void;
  onPrepareMentionNavigation: (href: string, context: { id: string; cursor: ClassNoteCursor }) => boolean;
}) {
  const lastHorizontal = useRef<LastHorizontalPress>({ rootId: '', key: '', time: 0 });
  return <section className={styles.progressionCanvas} aria-label="Class progression">
    <header className={styles.progressionHeading}>
      <div><span className="eyebrow">21 FIXED SLOTS</span><h2>Progression path</h2></div>
      <p>{selectionMode
        ? 'Arrow keys move focus. Enter or Space toggles a class in the batch.'
        : 'Arrow keys select the nearest visible class. Shift+←/→ or a quick double arrow changes family. Enter opens Inspect.'}</p>
    </header>
    <div className={styles.progressionTree} onKeyDown={event => handleTreeKeyDown(event, selectionMode, progression.root.id, lastHorizontal, onSelectClass, onMoveRoot)}>
      <ClassNode item={progression.root} rootSlot={progression.root.slot} params={params} selectedId={selectedId} positionLabel="Base class" selectionMode={selectionMode} selectedClassIds={selectedClassIds} onToggleClassSelection={onToggleClassSelection} root />
      <div className={styles.progressionBranches} aria-label="Two C2 branches">
        {progression.branches.map((branch, branchIndex) => <article className={styles.progressionBranch} key={branch.item.id}>
          <header className={styles.branchHeading}>
            <span>BRANCH {String(branchIndex + 1).padStart(2, '0')}</span>
            <span>3 C3 paths</span>
          </header>
          <ClassNode item={branch.item} rootSlot={progression.root.slot} params={params} selectedId={selectedId} positionLabel={'Branch ' + (branchIndex + 1)} selectionMode={selectionMode} selectedClassIds={selectedClassIds} onToggleClassSelection={onToggleClassSelection} />
          <div className={styles.progressionC3Grid} aria-label={'C3 paths under ' + classNodeLabel(branch.item)}>
            {branch.classes.map((child, childIndex) => <article className={styles.progressionC3} key={child.item.id}>
              <header className={styles.c3Heading}><span>PATH {String(childIndex + 1).padStart(2, '0')}</span><span>2 specs</span></header>
              <ClassNode item={child.item} rootSlot={progression.root.slot} params={params} selectedId={selectedId} positionLabel={'Path ' + (childIndex + 1)} selectionMode={selectionMode} selectedClassIds={selectedClassIds} onToggleClassSelection={onToggleClassSelection} />
              <ClassNotesInline
                item={child.item}
                draft={noteDrafts[child.item.id]}
                open={openNoteIds.has(child.item.id)}
                onOpenChange={open => onNoteOpenChange(child.item.id, open)}
                restoreCursor={restoreNoteId === child.item.id}
                cursor={restoreNoteId === child.item.id ? restoreCursor : undefined}
                onCursorRestored={onCursorRestored}
                onPrepareMentionNavigation={onPrepareMentionNavigation}
                onDraftChange={value => onNoteDraftChange(child.item.id, value)}
              />
              <div className={styles.specializationList} aria-label={'Specializations under ' + classNodeLabel(child.item)}>
                {child.specializations.map((item, specializationIndex) => <ClassNode item={item} rootSlot={progression.root.slot} params={params} selectedId={selectedId} positionLabel={'Specialization ' + (specializationIndex + 1)} selectionMode={selectionMode} selectedClassIds={selectedClassIds} onToggleClassSelection={onToggleClassSelection} key={item.id} />)}
              </div>
            </article>)}
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}
