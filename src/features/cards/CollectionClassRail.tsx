import { useState } from 'react';
import { Link } from 'react-router';
import { hrefWithParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { ClassFamilyIconRail } from '../classes/ClassFamilyIconRail';
import { classNodeLabel } from '../classes/progression';
import type { ClassProgression } from '../classes/progression';
import type { ClassLineageRoot } from '../classes/types';
import styles from './cards.module.css';

export function CollectionClassRail({ roots, activeSlot, exactClassId, progression, loading, error, params, comparisonIds, onRetry, onToggleComparison }: {
  roots: ClassLineageRoot[];
  activeSlot: string | null;
  exactClassId: string | null;
  progression: ClassProgression | null;
  loading: boolean;
  error?: unknown;
  params: URLSearchParams;
  comparisonIds: string[];
  onRetry: () => void;
  onToggleComparison: (classId: string) => void;
}) {
  const activeRoot = roots.find(root => root.slot === activeSlot);
  const scopeClasses = progression
    ? [progression.root, ...progression.branches.flatMap(branch => [branch.item, ...branch.classes.map(path => path.item)])]
    : [];
  const selectedClass = scopeClasses.find(item => item.id === exactClassId);
  const scopeLabel = comparisonIds.length
    ? `${comparisonIds.length} classes selected for comparison`
    : selectedClass
    ? `${classNodeLabel(selectedClass)} · ${selectedClass.tier}`
    : exactClassId
      ? 'Selected class'
      : activeRoot ? `All classes in ${activeRoot.name}` : 'All classes';
  const scopeKey = `${activeRoot?.id ?? activeSlot ?? 'none'}:${exactClassId ?? 'all'}`;
  const scopeStartsOpen = Boolean(error) || !exactClassId;
  const [scopeDisclosure, setScopeDisclosure] = useState<{ key: string; open: boolean } | null>(null);
  const scopeOpen = scopeDisclosure?.key === scopeKey ? scopeDisclosure.open : scopeStartsOpen;

  return <section className={styles.collectionClassRail} aria-label="Class collection scope">
    <ClassFamilyIconRail
      items={roots}
      activeSlot={activeSlot}
      sectionLabel="Class collection families"
      navLabel="Choose class family"
      heading={`${roots.length} roots`}
      instruction="Expand an icon to reveal its name"
      linkLabel={root => `Show ${root.name || 'unnamed class'} cards`}
      appearance="embedded"
      hrefForRoot={root => hrefWithParams(params, {
          view: 'cards', category: 'class', family: root.slot, classId: root.id, origin: null,
          after: null, id: null, focus: null, create: null, edit: null, saved: null, error: null,
        })}
    />

    {activeRoot && <>
      <details className={styles.scopeDisclosure} key={scopeKey} open={scopeOpen}
        onToggle={event => setScopeDisclosure({ key: scopeKey, open: event.currentTarget.open })}>
        <summary className={styles.scopeSummary}>
          <span className={styles.scopeSummaryCopy}>
            <span className="eyebrow">{activeRoot.name} · CLASS SCOPE</span>
            <strong>{scopeLabel}</strong>
          </span>
          <span className={styles.scopeSummaryAction}>
            <span className={styles.scopeShowAction}>Change class scope</span>
            <span className={styles.scopeHideAction}>Hide paths</span>
          </span>
        </summary>
        <div className={styles.scopeDisclosureContent}>
          <div className={styles.scopeHeading}>
            <div><span className="eyebrow">{activeRoot.name} progression</span><strong>Choose a class or add it to compare</strong></div>
            <span>{loading ? 'Loading class paths…' : error ? 'Paths unavailable' : 'Add classes from other roots too'}</span>
          </div>
          {loading && <ClassScopeSkeleton />}
          {!!error && <div className={styles.collectionError} role="alert"><p>Class paths could not be loaded. {apiErrorMessage(error)}</p><button className="button button-quiet" type="button" onClick={onRetry}>Retry class paths</button></div>}
          {progression && <div className={styles.scopeTree}>
            <Link className={styles.scopeAll} data-current={exactClassId ? undefined : 'true'} aria-current={!exactClassId ? 'page' : undefined}
              to={hrefWithParams(params, { view: 'cards', category: 'class', family: activeRoot.slot, classId: null, after: null, id: null, focus: null, create: null, edit: null, saved: null })}>
              <span><b>ALL</b><strong>All classes in {activeRoot.name}</strong></span><small>C1 + C2 + C3</small>
            </Link>
            <div className={styles.scopeRootChoice}>
              <Link className={styles.scopeRoot} data-current={exactClassId === progression.root.id ? 'true' : undefined}
                aria-current={exactClassId === progression.root.id ? 'page' : undefined}
                to={hrefWithParams(params, { view: 'cards', family: activeRoot.slot, classId: progression.root.id, after: null, id: null, focus: null, create: null, edit: null, saved: null })}>
                <span className={styles.scopeTier}>C1 · Bronze</span><strong>{classNodeLabel(progression.root)}</strong><small>Only this class</small>
              </Link>
              <CompareClassToggle item={progression.root} selected={comparisonIds.includes(progression.root.id)} onToggle={onToggleComparison} />
            </div>
            <div className={styles.scopeBranches}>
              {progression.branches.map(branch => <section className={styles.scopeBranch} key={branch.item.id} aria-label={`C2 branch: ${classNodeLabel(branch.item)}`}>
                <div className={styles.scopeC2Choice}>
                  <Link className={styles.scopeC2} data-current={exactClassId === branch.item.id ? 'true' : undefined}
                    aria-current={exactClassId === branch.item.id ? 'page' : undefined}
                    to={hrefWithParams(params, { view: 'cards', family: activeRoot.slot, classId: branch.item.id, after: null, id: null, focus: null, create: null, edit: null, saved: null })}>
                    <span className={styles.scopeTier}>C2 · Silver</span><strong>{classNodeLabel(branch.item)}</strong>
                  </Link>
                  <CompareClassToggle item={branch.item} selected={comparisonIds.includes(branch.item.id)} onToggle={onToggleComparison} />
                </div>
                <div className={styles.scopeC3Grid}>
                  {branch.classes.map(child => <div className={styles.scopeC3Choice} key={child.item.id}>
                    <Link className={styles.scopeC3} data-current={exactClassId === child.item.id ? 'true' : undefined}
                      aria-current={exactClassId === child.item.id ? 'page' : undefined}
                      aria-label={`Show cards for C3 ${classNodeLabel(child.item)}`} to={hrefWithParams(params, {
                        view: 'cards', family: activeRoot.slot, classId: child.item.id, after: null, id: null, focus: null, create: null, edit: null, saved: null,
                      })}>
                      <span className={styles.scopeTier}>C3 · Gold</span><strong>{classNodeLabel(child.item)}</strong>
                    </Link>
                    <CompareClassToggle item={child.item} selected={comparisonIds.includes(child.item.id)} onToggle={onToggleComparison} />
                  </div>)}
                </div>
              </section>)}
            </div>
          </div>}
        </div>
      </details>
    </>}
    {!activeRoot && <p className={styles.scopeHint}>Choose a family, then add C1, C2 or C3 classes to compare cards across your party. The category filter can show every card group.</p>}
  </section>;
}

function CompareClassToggle({ item, selected, onToggle }: { item: ClassProgression['root']; selected: boolean; onToggle: (id: string) => void }) {
  const label = `${item.tier} ${classNodeLabel(item)}`;
  return <button className={styles.scopeCompareToggle} data-selected={String(selected)} type="button" aria-pressed={selected}
    aria-label={`${selected ? 'Remove' : 'Add'} ${label} ${selected ? 'from' : 'to'} class comparison`} title={`${selected ? 'Remove' : 'Add'} ${label} ${selected ? 'from' : 'to'} comparison`}
    onClick={() => onToggle(item.id)}><span aria-hidden="true">{selected ? '✓' : '+'}</span></button>;
}

function ClassScopeSkeleton() {
  return <div className={styles.scopeSkeleton} aria-busy="true"><p className="sr-only" role="status">Loading class scope</p><i /><div><i /><i /></div><div><i /><i /><i /></div></div>;
}
