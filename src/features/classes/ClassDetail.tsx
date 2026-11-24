import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiRequest, catalogPath } from '../../app/api';
import { hrefWithParams, withoutRecordParams } from '../../app/urls';
import { apiErrorMessage } from '../../ui/feedback';
import { ClassDetailSkeleton } from './ClassSkeleton';
import { ClassEditor } from './ClassEditor';
import { TagProvenance } from './TagProvenance';
import type { ClassRecord } from './types';
import styles from './classes.module.css';

type LinkedItem = { id: string; name: string; kind?: string; status?: string };
type LinkedList = { items: LinkedItem[]; next: string | null };

function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  return `/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function ClassDetail({ id, onRetry, isPending, isError, error, record }: {
  id: string | null;
  onRetry: () => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  record?: ClassRecord | undefined;
}) {
  if (!id) return <section className={`${styles.detailPanel} ${styles.detailPlaceholder}`}><span className={styles.placeholderGlyph} aria-hidden="true">↖</span><h2>Choose a class</h2><p>Open a record to inspect its lineage, notes, tags and linked content.</p></section>;
  if (isPending) return <ClassDetailSkeleton />;
  if (isError || !record) return <section className={styles.detailPanel} role="alert"><h2>Class detail unavailable</h2><p>{apiErrorMessage(error)}</p><button className="button button-quiet" type="button" onClick={onRetry}>Retry class detail</button></section>;
  return <LoadedClassDetail record={record} />;
}

function LoadedClassDetail({ record }: { record: ClassRecord }) {
  const [params, setParams] = useSearchParams();
  const item = record.item;
  const editing = params.get('edit') === '1';
  const parent = record.lineage.at(-2);
  const lineageName = record.lineage.map(part => part.name || '?').join(' / ');
  const image = mediaUrl(item.imagePath) ?? record.icon;
  const saved = params.get('saved') === '1';

  function startEditing() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('edit', '1'); next.delete('saved'); next.delete('error');
      return next;
    });
  }

  function stopEditing() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('edit');
      return next;
    });
  }

  const parentHref = parent ? hrefWithParams(params, { view: 'classes', id: parent.id, edit: null, saved: null }) : null;

  return <article className={styles.detailPanel} aria-labelledby="class-detail-title">
    <div className={styles.detailTopline}>
      <Link className={styles.backLink} to={hrefWithParams(withoutRecordParams(params), { view: 'classes' })}><span aria-hidden="true">←</span><span>Back to progression</span></Link>
      <span className={`${styles.statusPill} ${item.official ? styles.official : styles.design}`}>{item.official ? 'Official' : 'In design'}</span>
    </div>
    <div className={styles.classHero}>
      <div className={styles.classPortrait}>{image ? <img src={image} width="88" height="88" alt="" /> : <span aria-hidden="true">◇</span>}</div>
      <div className={styles.classTitle}>
        <span className="eyebrow">{item.tier} <i aria-hidden="true">·</i> {item.slot}</span>
        <h2 id="class-detail-title">{item.name || '?'}</h2>
        <p>{lineageName || item.slot}</p>
      </div>
      {!editing && <div className={styles.detailActions}>
        <button className="button button-primary" type="button" onClick={startEditing}>Edit class</button>
        <Link className="button button-quiet" to={`/?view=database&entity=skills&class=${encodeURIComponent(item.id)}&create=1`}>Add skill</Link>
        <Link className="button button-quiet" to={`/?view=cards&category=class&family=${encodeURIComponent(item.slot.split('/')[0] ?? item.slot)}&classId=${encodeURIComponent(item.id)}`}>Cards in gallery</Link>
      </div>}
    </div>

    {saved && <p className={styles.successNotice} role="status">Class saved. The current version is up to date.</p>}
    {editing ? <ClassEditor record={record} onCancel={stopEditing} /> : <>
      <div className={styles.detailCopy}><span className={styles.fieldCaption}>CONCEPT</span><p>{item.concept || 'No concept yet.'}</p></div>
      <div className={styles.detailCopy}><span className={styles.fieldCaption}>NOTES</span><p className={styles.preserveLines}>{item.notes || 'No notes yet.'}</p></div>
      <div className={styles.tags} aria-label="Class tags">
        {(item.tags ?? []).length ? item.tags.map(tag => <span className={styles.tag} key={tag}>{tag}</span>) : <span className={styles.mutedCopy}>No tags assigned</span>}
      </div>
      <TagProvenance key={item.id} classId={item.id} />
      <div className={styles.detailStats}>
        <div><strong>{record.skillCount}</strong><span>Skills</span></div>
        <div><strong>{record.cardCount}</strong><span>Cards</span></div>
        <div><strong>{record.children.length}</strong><span>Child classes</span></div>
      </div>
      {parent && parentHref && <RelationBlock label="PARENT CLASS"><Link className={styles.relationLink} to={parentHref}>{parent.name || '?'}<span>{parent.tier} · {parent.slot}</span></Link></RelationBlock>}
      {record.children.length > 0 && <RelationBlock label="CHILD CLASSES">{record.children.map(child => <Link className={styles.relationLink} to={hrefWithParams(params, { view: 'classes', id: child.id, edit: null, saved: null })} key={child.id}>{child.name || '?'}<span>{child.tier}</span></Link>)}</RelationBlock>}
      <RelatedRecords classId={item.id} />
      <LineageContext record={record} />
    </>}
  </article>;
}

function RelationBlock({ label, children }: { label: string; children: ReactNode }) {
  return <section className={styles.relationBlock}><span className={styles.fieldCaption}>{label}</span><div className={styles.relationList}>{children}</div></section>;
}

function RelatedRecords({ classId }: { classId: string }) {
  const skills = useQuery({
    queryKey: ['catalog', 'skills', 'class', classId],
    queryFn: ({ signal }) => apiRequest<LinkedList>(catalogPath('skills', { class: classId, limit: 6 }), { signal }),
  });
  const cards = useQuery({
    queryKey: ['catalog', 'cards', 'owner', classId],
    queryFn: ({ signal }) => apiRequest<LinkedList>(catalogPath('cards', { owner: classId, limit: 6 }), { signal }),
  });

  return <>
    {skills.isPending ? <RelationSkeleton label="Skills" /> : skills.data?.items.length ? <RelationBlock label="SKILLS">{skills.data.items.map(skill => <Link className={styles.relationLink} to={`/?view=database&entity=skills&id=${encodeURIComponent(skill.id)}`} key={skill.id}>{skill.name || '?'}<span>{skill.kind ?? 'Skill'}</span></Link>)}</RelationBlock> : null}
    {cards.isPending ? <RelationSkeleton label="Related cards" /> : cards.data?.items.length ? <RelationBlock label="RELATED CARDS">{cards.data.items.map(card => <Link className={styles.relationLink} to={`/?view=cards&id=${encodeURIComponent(card.id)}`} key={card.id}>{card.name || '?'}<span>{card.status ?? 'Card'}</span></Link>)}</RelationBlock> : null}
    {(skills.isError || cards.isError) && <p className={styles.inlineWarning} role="status">Some linked records could not be loaded. The class details are still available.</p>}
  </>;
}

function RelationSkeleton({ label }: { label: string }) {
  return <div className={styles.relationBlock} aria-busy="true"><span className={styles.fieldCaption}>{label}</span><p className="sr-only" role="status">Loading {label.toLowerCase()}</p><div className={styles.relationSkeleton} aria-hidden="true"><i /><i /></div></div>;
}

function LineageContext({ record }: { record: ClassRecord }) {
  return <section className={styles.lineageContext} aria-label="Class lineage">
    <header><div><span className="eyebrow">DESIGN CONTEXT</span><h3>Class lineage</h3></div><span className={styles.contextCount}>{record.children.length} branches</span></header>
    <div className={styles.lineageStack}>
      {record.lineage.map((part, index) => <div className={`${styles.lineageStep}${index === record.lineage.length - 1 ? ` ${styles.currentLineage}` : ''}`} key={part.id}>
        <span>{part.tier}</span><strong>{part.name || '?'}</strong><small>{part.slot}</small>
      </div>)}
    </div>
    <p>{record.children.length ? 'Open a child slot to continue this progression.' : 'This slot has no child classes.'}</p>
  </section>;
}
