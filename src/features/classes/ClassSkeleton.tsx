import styles from './classes.module.css';

type ClassSkeletonProps = { rows?: number };

export function ClassListSkeleton({ rows = 8 }: ClassSkeletonProps) {
  return (
    <section className={styles.listPanel} aria-busy="true" aria-label="Class results">
      <div className={styles.panelHeading}>
        <div><span className="eyebrow">CLASS RECORDS</span><h2>Loading classes</h2></div>
      </div>
      <p className="sr-only" role="status">Loading class results</p>
      <div className={styles.skeletonRows} aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className={styles.skeletonRow} key={index}>
            <span className={styles.skeletonIcon} />
            <span className={styles.skeletonCopy}>
              <i className={index % 3 === 0 ? styles.shortLine : undefined} />
              <i />
            </span>
            <span className={styles.skeletonChevron} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ClassDetailSkeleton() {
  return (
    <section className={styles.detailPanel} aria-busy="true" aria-label="Class detail">
      <p className="sr-only" role="status">Loading class details</p>
      <div className={styles.detailSkeleton} aria-hidden="true">
        <i className={styles.skeletonBack} />
        <div className={styles.detailSkeletonHero}>
          <i className={styles.skeletonPortrait} />
          <div><i className={styles.skeletonEyebrow} /><i className={styles.skeletonTitle} /><i className={styles.skeletonPath} /></div>
        </div>
        <i className={styles.skeletonSectionTitle} />
        <i className={styles.skeletonParagraph} />
        <i className={styles.skeletonParagraphShort} />
        <i className={styles.skeletonSectionTitle} />
        <div className={styles.skeletonRelations}><i /><i /><i /></div>
      </div>
    </section>
  );
}

export function ClassLineageSkeleton() {
  return <section className={styles.progressionCanvas} aria-busy="true" aria-label="Class progression">
    <p className="sr-only" role="status">Loading the 21 class slots in this lineage</p>
    <header className={styles.progressionHeading}>
      <div><span className="eyebrow">CLASS PROGRESSION</span><h2>Loading lineage</h2></div>
      <span className={styles.skeletonMeta} />
    </header>
    <div className={styles.progressionSkeleton} aria-hidden="true">
      <div className={styles.rootNodeSkeleton}><i /><span><b /><small /></span></div>
      <div className={styles.skeletonBranches}>
        {[0, 1].map(branch => <div className={styles.skeletonBranch} key={branch}>
          <i className={styles.skeletonBranchTitle} />
          <i className={styles.skeletonC2} />
          <div className={styles.skeletonC3Grid}>{[0, 1, 2].map(path => <div className={styles.skeletonC3} key={path}><i /><div><b /><b /></div></div>)}</div>
        </div>)}
      </div>
    </div>
  </section>;
}
