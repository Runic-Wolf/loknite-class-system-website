import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiRequest, recordPath } from '../../app/api';
import { hrefWithParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import styles from './classes.module.css';

type TagSource = {
  kind: 'class' | 'skill';
  recordId: string;
  recordName: string;
  classId: string;
  className: string;
  inherited: boolean;
};

type Provenance = {
  class: { id: string; name: string; tier: string };
  lineage: Array<{ id: string; name: string; tier: string }>;
  counts: { effective: number; directOnClass: number; ownSkills: number; inheritedSkills: number };
  tags: Array<{
    value: string;
    occurrenceCount: number;
    directOnClass: boolean;
    fromOwnSkills: boolean;
    fromAncestorSkills: boolean;
    sources: TagSource[];
  }>;
};

export function TagProvenance({ classId }: { classId: string }) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['catalog', 'classes', classId, 'tag-provenance'],
    queryFn: ({ signal }) => apiRequest<Provenance>(`${recordPath('classes', classId)}/tag-provenance`, { signal }),
    enabled: open,
  });

  return <details
    className={styles.tagProvenance}
    onToggle={event => setOpen(event.currentTarget.open)}
  >
    <summary>
      <span><strong>Effective tags &amp; origins</strong><small>Class tags plus skills available through this lineage</small></span>
      <span className={styles.provenanceCount}>{query.data ? query.data.counts.effective : 'View'}</span>
    </summary>
    <div className={styles.provenanceBody}>
      <p className={styles.provenanceNote}>
        A class tag stays on that class. Skills owned by ancestor classes pass their tags down the lineage. C-Tier is structural and is not counted as a tag.
      </p>
      {query.isPending && <div className={styles.provenanceSkeleton} aria-busy="true"><span className="sr-only" role="status">Loading tag origins</span><i /><i /><i /></div>}
      {query.isError && <div className={styles.provenanceError} role="alert"><p>{apiErrorMessage(query.error)}</p><button className="button button-quiet" type="button" onClick={() => void query.refetch()}>Retry</button></div>}
      {query.data && <>
        <div className={styles.provenanceLegend} aria-label="Tag origin categories">
          <span data-origin="class">On this class · {query.data.counts.directOnClass}</span>
          <span data-origin="own">Own skills · {query.data.counts.ownSkills}</span>
          <span data-origin="inherited">Ancestor skills · {query.data.counts.inheritedSkills}</span>
        </div>
        {query.data.tags.length === 0 ? <p className={styles.provenanceEmpty}>No effective tags in this class lineage.</p> : <ul className={styles.provenanceList}>
          {query.data.tags.map(tag => <li className={styles.provenanceRow} key={tag.value}>
            <div className={styles.provenanceTagHeading}>
              <strong>{tag.value}</strong>
              <span className={styles.provenanceBadges}>
                {tag.directOnClass && <i data-origin="class">Class</i>}
                {tag.fromOwnSkills && <i data-origin="own">Own skill</i>}
                {tag.fromAncestorSkills && <i data-origin="inherited">Inherited</i>}
              </span>
              {tag.occurrenceCount > 1 && <small>{tag.occurrenceCount} sources</small>}
            </div>
            <ul className={styles.provenanceSources}>
              {tag.sources.map(source => <li key={`${source.kind}:${source.recordId}`}>
                {source.kind === 'skill' ? <>
                  <Link to={`/?view=database&entity=skills&id=${encodeURIComponent(source.recordId)}`}>{source.recordName || 'Unnamed skill'}</Link>
                  <span> · </span>
                  {source.inherited ? <Link to={hrefWithParams(params, { view: 'classes', id: source.classId, edit: null, saved: null })}>{source.className || 'Unnamed class'}</Link> : <span>this class</span>}
                </> : <span>Assigned directly to {source.className || 'this class'}</span>}
              </li>)}
            </ul>
          </li>)}
        </ul>}
      </>}
    </div>
  </details>;
}
