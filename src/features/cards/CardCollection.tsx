import { useEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import { hrefWithParams } from '../../app/urls';
import type { CardItem, CardRecord, CardRow } from './types';
import type { ClassRow } from '../classes/types';
import styles from './cards.module.css';
import { CardFace } from './CardFace';
import { CardSnapshot } from './CardSnapshot';

function rowFromRecord(record: CardRecord | undefined, classOptions: ClassRow[]): CardRow | null {
  if (!record) return null;
  const item = record.item;
  const owner = classOptions.find(option => option.id === item.layoutClassId || option.id === item.ownerId);
  const root = owner ? classOptions.find(option => option.tier === 'C1' && owner.slot.startsWith(option.slot)) ?? owner : undefined;
  return {
    id: item.id, name: item.name, category: item.category, type: item.type, element: item.element, cost: item.cost,
    status: item.status, workflowStatus: item.workflowStatus, ruleTextPreview: item.ruleText.slice(0, 280), artPath: item.artPath,
    ownerId: item.ownerId ?? null, layoutClassId: item.layoutClassId ?? null, slot: item.slot,
    ownerName: owner?.name ?? null, ownerTier: owner?.tier ?? null, ownerSlot: owner?.slot ?? root?.slot ?? null,
    ownerIcon: root?.icon ?? null, ownerArtwork: root?.artwork ?? null,
    nameFontSize: item.nameFontSize ?? 17, typeFontSize: item.typeFontSize ?? 6, elementFontSize: item.elementFontSize ?? 6,
    ruleFontSize: item.ruleFontSize ?? 10, flavourFontSize: item.flavourFontSize ?? 7,
    ruleTextOffsetY: item.ruleTextOffsetY ?? 0, flavourTextOffsetY: item.flavourTextOffsetY ?? 0,
    artZoomPercent: item.artZoomPercent ?? 100, artOffsetXPercent: item.artOffsetXPercent ?? 0, artOffsetYPercent: item.artOffsetYPercent ?? 0,
    visualProfile: item.visualProfile ?? null, scenePosterPath: item.scenePosterPath ?? null,
    flavourTextPreview: item.flavourText.slice(0, 240),
  };
}

export function CardCollection({ rows, next, params, density, busy, loading, error, onRetry, record, classOptions = [], onInspect }: {
  rows?: CardRow[] | undefined;
  next: string | null | undefined;
  params: URLSearchParams;
  density: 'compact' | 'normal' | 'large';
  busy: boolean;
  loading: boolean;
  error?: string | undefined;
  onRetry: () => void;
  record?: CardRecord | undefined;
  classOptions?: ClassRow[] | undefined;
  onInspect: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedId = searchParams.get('focus') === '1' ? searchParams.get('id') : null;
  const selected = params.get('id');
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const hadFocus = useRef(false);
  const [tooltip, setTooltip] = useState<{ row: CardRow; left: number; top: number; above: boolean } | null>(null);

  useEffect(() => {
    if (hadFocus.current && !focusedId && selected) {
      requestAnimationFrame(() => links.current.get(selected)?.focus());
    }
    hadFocus.current = Boolean(focusedId);
  }, [focusedId, selected]);

  useEffect(() => {
    const hide = () => setTooltip(null);
    window.addEventListener('resize', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('resize', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  function showTooltip(event: ReactMouseEvent<HTMLAnchorElement> | ReactFocusEvent<HTMLAnchorElement>, row: CardRow) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const center = Math.max(width / 2 + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - width / 2 - 8));
    const belowSpace = window.innerHeight - rect.bottom;
    const above = belowSpace < 270 && rect.top > 220;
    setTooltip({ row, left: center, top: above ? Math.max(12, rect.top - 9) : Math.min(rect.bottom + 9, window.innerHeight - 12), above });
  }

  function closeFocus() {
    setSearchParams(current => {
      const nextParams = new URLSearchParams(current);
      nextParams.delete('focus');
      return nextParams;
    });
  }

  const focusedRow = focusedId ? rows?.find(row => row.id === focusedId) ?? rowFromRecord(record, classOptions) : null;
  const selectedRow = selected ? rows?.find(row => row.id === selected) : undefined;

  return <section className={styles.collectionPanel} aria-label="Card collection">
    <header className={styles.panelHeading}>
      <div><span className="eyebrow">CARD COLLECTION</span><h2>Collection <span className={styles.count}>{rows?.length ?? 0}</span></h2></div>
      <span className={styles.panelNote}>{busy ? 'Updating…' : `${rows?.length ?? 0} shown`}</span>
    </header>
    {error && <div className={styles.collectionError} role="alert"><p>Cards could not be loaded. {error}</p><button className="button button-quiet" type="button" onClick={onRetry}>Retry collection</button></div>}
    {loading ? <CardCollectionSkeleton /> : rows?.length ? <div className={styles.collectionViewport}>
      <div className={styles.cardGrid} data-density={density} data-focused={focusedId ? 'true' : undefined} aria-busy={busy} aria-label="Cards in this collection">
        {rows.map(row => {
          const href = hrefWithParams(params, { view: 'cards', id: row.id, focus: '1', create: null, edit: null, saved: null, error: null });
          const chosen = selected === row.id;
          return <Link
            className={styles.gameCardLink}
            data-selected={chosen ? 'true' : undefined}
            aria-current={chosen ? 'true' : undefined}
            aria-describedby={tooltip?.row.id === row.id ? 'gallery-card-tooltip' : undefined}
            aria-label={`Open card focus: ${row.name || 'Untitled card'}, ${row.type || 'Free Note'}, ${row.status === 'CONFIRMADO' ? 'confirmed' : 'draft'}`}
            to={href}
            ref={node => { if (node) links.current.set(row.id, node); else links.current.delete(row.id); }}
            onMouseEnter={event => showTooltip(event, row)}
            onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setTooltip(null); }}
            onFocus={event => showTooltip(event, row)}
            onBlur={() => setTooltip(null)}
            key={row.id}
          >
            <article className={styles.gameCard}>
              <CardSnapshot row={row} />
              <header className={styles.gameCardHeading}><h3>{row.name || '?'}</h3><span className={row.status === 'CONFIRMADO' ? styles.confirmedStatus : undefined}>{row.status === 'CONFIRMADO' ? 'Confirmed' : 'Draft'}</span></header>
              <p className={styles.gameCardMeta}>{row.category} · {row.type || 'Free Note'}{row.ownerName ? ' · ' + row.ownerName : ''}</p>
            </article>
          </Link>;
        })}
      </div>
      {next && <Link className={styles.nextPage} to={hrefWithParams(params, { after: next, id: null, focus: null, create: null, edit: null, saved: null })}>Next collection page <span aria-hidden="true">→</span></Link>}
      {focusedId && <CardFocus
        row={focusedRow}
        item={record?.item}
        loading={!focusedRow && !record}
        onClose={closeFocus}
        onInspect={() => { closeFocus(); onInspect(); }}
      />}
      {selectedRow && <span className="sr-only" role="status">Selected {selectedRow.name || 'card'} in the collection.</span>}
    </div> : !error && <div className={styles.emptyState}><strong>No cards in this collection</strong><p>Change a filter or choose another class scope. Your current category and family stay selected.</p></div>}
    {tooltip && createPortal(<div id="gallery-card-tooltip" role="tooltip" className={styles.cardTooltip} data-above={tooltip.above ? 'true' : undefined} style={{ left: tooltip.left, top: tooltip.top }}>
      <strong>{tooltip.row.name || 'Untitled card'}</strong>
      <span>{tooltip.row.type || 'Free Note'} · {tooltip.row.element || 'Neutral'} · Cost {tooltip.row.cost || '0'}</span>
      <p>{tooltip.row.ruleTextPreview || 'No rules written yet.'}</p>
    </div>, document.body)}
  </section>;
}

function CardFocus({ row, item, loading, onClose, onInspect }: {
  row: CardRow | null;
  item?: CardItem | undefined;
  loading: boolean;
  onClose: () => void;
  onInspect: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    requestAnimationFrame(() => closeButton.current?.focus());
    return () => { if (element.open) element.close(); };
  }, []);

  const visualRow = row && item?.id === row.id
    ? {
        ...row,
        goldMaskPath: item.goldMaskPath ?? null, prismMaskPath: item.prismMaskPath ?? null,
        sceneSettings: item.sceneSettings ?? null, scenePosterPath: item.scenePosterPath ?? null,
        sceneBackPath: item.sceneBackPath ?? null, sceneMidPath: item.sceneMidPath ?? null,
        sceneFrontPath: item.sceneFrontPath ?? null, sceneSmokePath: item.sceneSmokePath ?? null,
      }
    : row;
  return <dialog
    ref={dialog}
    className={styles.focusDialog}
    aria-labelledby="focused-card-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className={styles.focusDialogBody}>
      <header className={styles.focusHeading}>
        <div><span className="eyebrow">CARD FOCUS · COLLECTION POSITION PRESERVED</span><h2 id="focused-card-title">{visualRow?.name || item?.name || (loading ? 'Loading card' : 'Card preview')}</h2></div>
        <button ref={closeButton} className="button button-quiet" type="button" onClick={onClose} aria-label="Close card focus">Close</button>
      </header>
      {visualRow ? <div className={styles.focusContent}>
        <div className={styles.focusCard}><CardFace row={visualRow} fullRule={item?.ruleText} fullFlavour={item?.flavourText} fitText animatedMana /></div>
        <div className={styles.focusCopy}>
          <span className="eyebrow">{visualRow.category} · {visualRow.type || 'Free Note'}</span>
          <p className={styles.focusRule}>{item?.ruleText || visualRow.ruleTextPreview || 'No rules written yet.'}</p>
          {item?.flavourText && <div><span className={styles.fieldCaption}>FLAVOUR TEXT</span><p>{item.flavourText}</p></div>}
          <p className={styles.focusMeta}>{visualRow.element || item?.element || 'Neutral'} · Cost {visualRow.cost || item?.cost || '0'} · {visualRow.status === 'CONFIRMADO' ? 'Confirmed' : 'Draft'}</p>
          <button className="button button-primary" type="button" onClick={onInspect}>Inspect and edit fields</button>
        </div>
      </div> : loading ? <div className={styles.focusSkeleton} aria-busy="true"><p className="sr-only" role="status">Loading focused card</p><span /><div><i /><i /><i /></div></div> : <p>Card preview unavailable. Close focus to continue in the collection.</p>}
    </div>
  </dialog>;
}

export function CardCollectionSkeleton() {
  return <div className={styles.collectionSkeleton} aria-busy="true" aria-label="Loading card collection">
    <p className="sr-only" role="status">Loading card collection</p>
    {Array.from({ length: 8 }, (_, index) => <div className={styles.skeletonCard} key={index} aria-hidden="true">
      <i />
      <span><b className={index % 3 === 0 ? styles.skeletonShort : undefined} /><small /></span>
    </div>)}
  </div>;
}
