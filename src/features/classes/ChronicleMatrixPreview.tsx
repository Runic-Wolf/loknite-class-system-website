import { classNodeLabel, isPlaceholderClassName } from './progression';
import type { ClassProgression, ProgressionC3 } from './progression';
import type { ClassRow } from './types';
import styles from './chronicle-preview.module.css';

function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function conceptStatus(item: ClassRow): string {
  const concept = item.concept?.trim();
  if (!concept || /conceito em (elabora|desenvolv)|concept in (progress|development)/i.test(concept)) {
    return 'Class concept in development';
  }
  return concept;
}

function FinalClass({ item, specializations, onInspect }: {
  item: ClassRow;
  specializations: ClassRow[];
  onInspect: (id: string) => void;
}) {
  return <article className={styles.finalClass}>
    <button className={styles.classLink} type="button" onClick={() => onInspect(item.id)}>
      <span className={styles.tierMark}>C3</span>
      <strong>{classNodeLabel(item)}</strong>
      <span className={styles.classPrompt}>Inspect class <span aria-hidden="true">↗</span></span>
    </button>
    <details className={styles.specDetails}>
      <summary>{specializations.length} specializations</summary>
      <ul>
        {specializations.map((specialization, index) => <li key={specialization.id}>
          <button type="button" onClick={() => onInspect(specialization.id)}>
            {isPlaceholderClassName(specialization) ? `Specialization ${index + 1} · in progress` : classNodeLabel(specialization)}
          </button>
        </li>)}
      </ul>
    </details>
  </article>;
}

export function ChronicleMatrixPreview({ progression, onInspectClass }: {
  progression: ClassProgression;
  onInspectClass: (id: string) => void;
}) {
  const { root, branches } = progression;
  const artwork = mediaUrl(root.artwork);
  const finalCount = branches.reduce((count, branch) => count + branch.classes.length, 0);

  return <section className={styles.preview} aria-labelledby="chronicle-title">
    <header className={styles.previewHeading}>
      <div>
        <span className={styles.kicker}>FIELD NOTES <i aria-hidden="true">·</i> CLASS ORIGIN</span>
        <h2 id="chronicle-title">{root.name} <span>path</span></h2>
        <p>One origin. Two disciplines. Six destinies.</p>
      </div>
      <div className={styles.slotMark} aria-label="Nine visible progression classes">
        <strong>1 <i>→</i> 2 <i>→</i> 6</strong>
        <span>THE CLASS PATH</span>
      </div>
    </header>

    <div className={styles.storyLayout}>
      <article className={styles.originCard}>
        <div className={styles.artworkFrame}>
          {artwork
            ? <img src={artwork} alt="" loading="lazy" decoding="async" />
            : <div className={styles.artworkFallback} role="img" aria-label="Class artwork not added yet"><span>Artwork<br />to come</span></div>}
          <span className={styles.artworkTier}>C1 <i>·</i> ORIGIN</span>
          <span className={styles.artworkName}>{root.name}</span>
        </div>
        <div className={styles.originCopy}>
          <span className={styles.kicker}>THE BEGINNING</span>
          <p>{conceptStatus(root)}</p>
          <div className={styles.originFacts}>
            <span><strong>{String(branches.length).padStart(2, '0')}</strong> branches</span>
            <span><strong>{String(finalCount).padStart(2, '0')}</strong> final classes</span>
          </div>
          {root.tags.length > 0 && <ul className={styles.tags} aria-label="Class traits">
            {root.tags.map(tag => <li key={tag}>{tag}</li>)}
          </ul>}
          <button className={styles.inspectOrigin} type="button" onClick={() => onInspectClass(root.id)}>Inspect origin <span aria-hidden="true">↗</span></button>
        </div>
      </article>

      <div className={styles.progression} aria-label={`${root.name} class progression`}>
        <div className={styles.originNode}>
          <span className={styles.tierMark}>C1</span>
          <strong>{root.name}</strong>
          <span className={styles.nodeRole}>Shared origin</span>
        </div>
        <div className={styles.branchGrid}>
          {branches.map(branch => <section className={styles.branch} key={branch.item.id} aria-label={`${classNodeLabel(branch.item)} branch`}>
            <button className={styles.branchNode} type="button" onClick={() => onInspectClass(branch.item.id)}>
              <span className={styles.tierMark}>C2</span>
              <strong>{classNodeLabel(branch.item)}</strong>
              <span className={styles.branchConcept}>{conceptStatus(branch.item)}</span>
            </button>
            <div className={styles.finalGrid}>
              {branch.classes.map((child: ProgressionC3) => <FinalClass
                key={child.item.id}
                item={child.item}
                specializations={child.specializations}
                onInspect={onInspectClass}
              />)}
            </div>
          </section>)}
        </div>
      </div>
    </div>
    <p className={styles.dataNote}>Names, traits and artwork come from the local catalog. Slot identifiers stay in Inspect and the database.</p>
  </section>;
}
