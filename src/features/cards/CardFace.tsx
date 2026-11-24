import { useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardRow } from './types';
import styles from './cards.module.css';
import { ManaSlot } from './ManaSlot';
import { FullArtFrame } from './FullArtFrame';
import { ArtworkMaterials } from './ArtworkMaterials';
import { defaultSceneLayer } from '../../../shared/card-scene.js';
import type { SceneLayer } from './card-scene';
import { CardParallax } from './CardParallax';

const classNames = ['FIGHTER', 'BARBARIAN', 'NATURALIST', 'ROGUE', 'ARCANIST', 'CLERIC', 'INNOVATOR', 'SORCERER', 'ACOLYTE', 'DISCIPLE', 'BUSHI', 'SPIRITUALIST', 'ARTIST', 'OUTLAW', 'SWORDSMAN'];
const tierFolders: Record<string, string> = { C1: '01_C1_BRONZE', C2: '02_C2_PRATA', C3: '03_C3_OURO' };
const tierMetals = { C1: 'Bronze', C2: 'Silver', C3: 'Gold' } as const;

function mediaUrl(path: string | null | undefined): string | null {
  return path ? '/media/' + path.split('/').map(encodeURIComponent).join('/') : null;
}

function layoutPath(item: CardRow): string | null {
  const root = /^C1_(\d+)/.exec(item.ownerSlot ?? '');
  const index = Number(root?.[1] ?? item.slot);
  if (!Number.isInteger(index) || index < 0 || index >= classNames.length) return null;
  const filename = `${String(index + 1).padStart(2, '0')}_${classNames[index]}.png`;
  if (item.type === 'Class Mechanic') return '/class-mechanics/' + filename;
  const tier = item.ownerTier === 'SPEC' ? 'C3' : item.ownerTier ?? (item.category === 'class' ? 'C1' : null);
  const folder = tier ? tierFolders[tier] : null;
  return folder ? `/card-layouts/${folder}/${filename}` : null;
}

type EditableField = 'name' | 'type' | 'element' | 'cost' | 'ruleText' | 'flavourText';

export function CardFace({ row, fullRule, fullFlavour, artPreview, editable = false, fitText = false, animatedMana = false, previewScene = false, previewSceneMotion = false, selectedLayer, onSceneLayerMove, onSelectField, onChooseArtwork, onArtworkOffsetChange }: {
  row: CardRow;
  fullRule?: string | undefined;
  fullFlavour?: string | undefined;
  artPreview?: string | null | undefined;
  editable?: boolean;
  fitText?: boolean;
  animatedMana?: boolean;
  previewScene?: boolean;
  previewSceneMotion?: boolean;
  selectedLayer?: SceneLayer | null;
  onSceneLayerMove?: (layer: SceneLayer, x: number, y: number) => void;
  onSelectField?: ((field: EditableField) => void) | undefined;
  onChooseArtwork?: (() => void) | undefined;
  onArtworkOffsetChange?: ((x: number, y: number) => void) | undefined;
}) {
  const poster = row.visualProfile === 'full-art-v1' && row.type !== 'Class Mechanic' ? row.scenePosterPath : null;
  const art = artPreview ?? mediaUrl(poster || row.artPath) ?? row.ownerIcon;
  const background = mediaUrl(row.ownerArtwork);
  const hasArtwork = Boolean(row.artPath || poster || artPreview || previewScene);
  const mechanic = row.type === 'Class Mechanic';
  const fullArt = !mechanic && row.visualProfile === 'full-art-v1';
  const fighter = row.ownerSlot ? /^C1_0(?:\/|$)/.test(row.ownerSlot) : row.category === 'class' && row.slot === 0;
  const frame = fullArt ? null : layoutPath(row);
  const tier = row.ownerTier ?? (row.category === 'class' ? 'C1' : null);
  const tierMetal = tier && tier !== 'SPEC' ? tierMetals[tier] : null;
  const faceRef = useRef<HTMLDivElement>(null);
  const artDragRef = useRef<{ pointerId: number; startX: number; startY: number; startOffsetX: number; startOffsetY: number; offsetX: number; offsetY: number; moved: boolean; layer: SceneLayer | null } | null>(null);
  const artZoom = row.artZoomPercent ?? 100;
  const artOffsetX = row.artOffsetXPercent ?? 0;
  const artOffsetY = row.artOffsetYPercent ?? 0;
  const framing = {
    '--art-offset-x': `${hasArtwork ? artOffsetX : 0}%`,
    '--art-offset-y': `${hasArtwork ? artOffsetY : 0}%`,
    '--art-zoom': hasArtwork ? artZoom / 100 : 1,
  } as CSSProperties;
  const goldMask = fullArt && hasArtwork && !artPreview ? mediaUrl(row.goldMaskPath) : null;
  const prismMask = fullArt && hasArtwork && !artPreview ? mediaUrl(row.prismMaskPath) : null;
  const sceneBack = fullArt && hasArtwork && !artPreview && (animatedMana || previewScene) ? mediaUrl(row.sceneBackPath) : null;
  const sceneMid = sceneBack ? mediaUrl(row.sceneMidPath) : null;
  const sceneFront = sceneBack ? mediaUrl(row.sceneFrontPath) : null;

  function startArtworkDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editable || !hasArtwork || !event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    const layer = previewScene && selectedLayer ? selectedLayer : null;
    const position = layer ? row.sceneSettings?.[layer] ?? defaultSceneLayer(layer) : { x: artOffsetX, y: artOffsetY };
    const drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startOffsetX: position.x, startOffsetY: position.y, offsetX: position.x, offsetY: position.y, moved: false, layer };
    artDragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveArtwork(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = artDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.moved ||= Math.abs(event.clientX - drag.startX) > 2 || Math.abs(event.clientY - drag.startY) > 2;
    const zoom = drag.layer ? artZoom / 100 : 1;
    drag.offsetX = Math.max(-50, Math.min(50, drag.startOffsetX + (event.clientX - drag.startX) / Math.max(1, bounds.width * zoom) * 100));
    drag.offsetY = Math.max(-50, Math.min(50, drag.startOffsetY + (event.clientY - drag.startY) / Math.max(1, bounds.height * zoom) * 100));
    if (drag.moved) {
      event.currentTarget.style.setProperty(drag.layer ? '--layer-drag-x' : '--art-drag-x', `${drag.offsetX}%`);
      event.currentTarget.style.setProperty(drag.layer ? '--layer-drag-y' : '--art-drag-y', `${drag.offsetY}%`);
    }
  }

  function endArtworkDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = artDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    artDragRef.current = null;
    event.currentTarget.style.removeProperty('--art-drag-x');
    event.currentTarget.style.removeProperty('--art-drag-y');
    event.currentTarget.style.removeProperty('--layer-drag-x');
    event.currentTarget.style.removeProperty('--layer-drag-y');
    if (!drag.moved || event.type !== 'pointerup') return;
    const x = Math.round(drag.offsetX);
    const y = Math.round(drag.offsetY);
    if (drag.layer) onSceneLayerMove?.(drag.layer, x, y);
    else onArtworkOffsetChange?.(x, y);
  }

  useLayoutEffect(() => {
    const face = faceRef.current;
    if (!fitText || !face) return;
    const fields = [...face.querySelectorAll<HTMLElement>('[data-fit-text]')];
    let frameId = 0;
    const measureContext = document.createElement('canvas').getContext('2d');
    const fitsText = (field: HTMLElement, fontSize: number, maxWidth: number, maxHeight: number, lineRatio: number) => {
      if (!measureContext) return true;
      const computed = getComputedStyle(field);
      measureContext.font = `${computed.fontStyle} ${computed.fontWeight} ${fontSize}px ${computed.fontFamily}`;
      const text = field.textContent ?? '';
      const paragraphs = text.split(/\n+/);
      const noWrap = computed.whiteSpace === 'nowrap';
      if (noWrap) return paragraphs.every(paragraph => measureContext.measureText(paragraph).width <= maxWidth);
      let lineCount = 0;
      let widestLine = 0;
      for (const paragraph of paragraphs) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) { lineCount++; continue; }
        let line = '';
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          const candidateWidth = measureContext.measureText(candidate).width;
          if (line && candidateWidth > maxWidth) {
            widestLine = Math.max(widestLine, measureContext.measureText(line).width);
            lineCount++;
            line = word;
          } else {
            line = candidate;
          }
          if (measureContext.measureText(line).width > maxWidth) {
            // Long unbroken words can wrap at character boundaries in the card frame.
            let fragment = '';
            for (const character of line) {
              const next = fragment + character;
              if (fragment && measureContext.measureText(next).width > maxWidth) {
                widestLine = Math.max(widestLine, measureContext.measureText(fragment).width);
                lineCount++;
                fragment = character;
              } else fragment = next;
            }
            line = fragment;
          }
        }
        widestLine = Math.max(widestLine, measureContext.measureText(line).width);
        lineCount++;
      }
      return noWrap ? widestLine <= maxWidth : widestLine <= maxWidth + 1 && lineCount * fontSize * lineRatio <= maxHeight + 1;
    };
    const fitNow = () => {
      cancelAnimationFrame(frameId);
      for (const field of fields) {
        field.style.removeProperty('font-size');
        const max = Number.parseFloat(getComputedStyle(field).fontSize);
        const min = Number(field.dataset.fitMin ?? 6);
        if (!Number.isFinite(max) || max <= min || !field.clientWidth || !field.clientHeight) continue;
        const computed = getComputedStyle(field);
        const lineHeight = Number.parseFloat(computed.lineHeight);
        const lineRatio = Number.isFinite(lineHeight) ? lineHeight / max : 1.2;
        let low = min;
        let high = max;
        let best = min;
        for (let step = 0; step < 8; step++) {
          const candidate = (low + high) / 2;
          if (fitsText(field, candidate, field.clientWidth, field.clientHeight, lineRatio)) { best = candidate; low = candidate; }
          else high = candidate;
        }
        field.style.fontSize = best >= max - 0.5 ? '' : `${best.toFixed(2)}px`;
      }
    };
    const fitAfterResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fitNow);
    };
    const observer = new ResizeObserver(fitAfterResize);
    observer.observe(face);
    fitNow();
    return () => { observer.disconnect(); cancelAnimationFrame(frameId); };
  }, [fitText, fullArt, tier, row.name, row.type, row.element, row.cost, row.nameFontSize, row.typeFontSize, row.elementFontSize, row.ruleFontSize, row.flavourFontSize, row.ruleTextOffsetY, row.flavourTextOffsetY, fullRule, fullFlavour]);

  function text(field: EditableField, className: string, value: string, size: number, style?: CSSProperties) {
    const content = value || (field === 'name' ? '?' : '');
    const styleWithSize = { ...style, '--preview-font-size': `${size}px` } as CSSProperties;
    const classNameWithEdit = `${styles[className as keyof typeof styles]}${editable ? ` ${styles.previewField}` : ''}`;
    const minSize = className === 'printTitle' || className === 'mechanicTitle' ? 8 : className === 'printRules' || className === 'mechanicRules' ? 7 : 6;
    const fit = !fullArt || field === 'name' ? 'true' : undefined;
    return editable
      ? <button className={classNameWithEdit} type="button" data-fit-text={fit} data-fit-min={minSize} style={styleWithSize} onClick={() => onSelectField?.(field)}>{content}</button>
      : <span className={classNameWithEdit} data-fit-text={fit} data-fit-min={minSize} style={styleWithSize}>{content}</span>;
  }

  const rules = fullRule ?? row.ruleTextPreview;
  const flavour = fullFlavour ?? row.flavourTextPreview;
  const tierBadge = fullArt && tierMetal && <span className={styles.fullArtTier} data-tier={tier} aria-label={`${tier} ${tierMetal}`}>{tier}</span>;

  return <div className={styles.cardStack}>
    <div ref={faceRef} className={styles.cardFace} data-generic={!frame ? 'true' : undefined} data-layout={fullArt ? 'full-art' : mechanic ? 'mechanic' : 'standard'} data-frame={fullArt && fighter ? 'fighter' : undefined}>
      {background && <img className={styles.cardBackground} src={background} alt="" loading="lazy" decoding="async" />}
      <div
        className={`${styles.cardArt}${mechanic ? ` ${styles.mechanicArt}` : ''}${hasArtwork ? ` ${styles.hasArtwork}` : art ? ` ${styles.hasClassIcon}` : ` ${styles.noArtwork}`}${editable && hasArtwork ? ` ${styles.artAdjustable}` : ''}`}
        style={framing}
        onPointerDown={editable && hasArtwork ? startArtworkDrag : undefined}
        onPointerMove={editable && hasArtwork ? moveArtwork : undefined}
        onPointerUp={editable && hasArtwork ? endArtworkDrag : undefined}
        onPointerCancel={editable && hasArtwork ? endArtworkDrag : undefined}
        onLostPointerCapture={editable && hasArtwork ? endArtworkDrag : undefined}
      >
        {art ? <img data-artwork-poster src={art} alt="" draggable={false} loading="lazy" decoding="async" /> : <span className={styles.cardPlaceholder} aria-hidden="true">◇</span>}
        {sceneBack && sceneMid && sceneFront
          ? <CardParallax key={`${sceneBack}|${sceneMid}|${sceneFront}|${row.sceneSmokePath ?? ''}`} back={sceneBack} mid={sceneMid} front={sceneFront} smoke={mediaUrl(row.sceneSmokePath)} settings={row.sceneSettings} selectedLayer={selectedLayer} preview={previewScene} motionPreview={previewSceneMotion} />
          : (goldMask || prismMask) && <ArtworkMaterials gold={goldMask} prism={prismMask} reactive={animatedMana} />}
        {editable && <button className={styles.artPickerButton} type="button" onClick={onChooseArtwork} aria-label={hasArtwork ? 'Replace card artwork' : 'Add card artwork'}><span>{hasArtwork ? 'Replace artwork' : 'Add artwork'}</span></button>}
      </div>
      {fullArt && <FullArtFrame fighter={fighter} reactive={animatedMana} bronze={tier === 'C1'} />}
      {frame && <img className={styles.cardFrame} src={frame} alt="" loading="lazy" decoding="async" />}
      {!mechanic && <ManaSlot cost={row.cost || '0'} animated={animatedMana} editable={editable} frameSrc={frame} backgroundSrc={fullArt ? null : background} aboveArt={fullArt} onSelectCost={() => onSelectField?.('cost')} />}
      {text('name', mechanic ? 'mechanicTitle' : 'printTitle', row.name || '?', row.nameFontSize ?? 17)}
      {fullArt ? <div className={styles.fullArtCopy}>
        {fighter && <div className={styles.fighterFortress} aria-hidden="true">
          <span className={styles.fighterTower} />
          <span className={styles.fighterTower} />
        </div>}
        <div className={styles.fullArtMeta}>
          {text('type', 'printType', row.type || 'Other', row.typeFontSize ?? 6)}
          {text('element', 'printElement', row.element || 'Neutral', row.elementFontSize ?? 6)}
        </div>
        {(rules || editable) && text('ruleText', 'printRules', rules || 'Write the card rules…', row.ruleFontSize ?? 10)}
        {flavour && text('flavourText', 'printFlavour', flavour, row.flavourFontSize ?? 7)}
        {(tierBadge || row.ownerIcon) && <div className={styles.fullArtFooter}>
          {tierBadge}
          {row.ownerIcon && <img className={styles.fullArtEmblem} src={row.ownerIcon} alt="" loading="lazy" decoding="async" />}
        </div>}
      </div> : <>
      {!mechanic && text('type', 'printType', row.type || 'Other', row.typeFontSize ?? 6)}
      {text('ruleText', mechanic ? 'mechanicRules' : 'printRules', fullRule ?? (row.ruleTextPreview || 'Write the card rules…'), row.ruleFontSize ?? 10, { top: `calc(var(--rules-top, ${mechanic ? 72 : 64}%) + ${(row.ruleTextOffsetY ?? 0) / 14.84}%)` })}
      {!mechanic && (fullFlavour || (editable && fullFlavour !== undefined) || (!fullArt && fullFlavour !== undefined)) && text('flavourText', 'printFlavour', fullFlavour || 'Flavour text', row.flavourFontSize ?? 7, { top: `calc(var(--flavour-top, 85%) + ${(row.flavourTextOffsetY ?? 0) / 14.84}%)` })}
      {!mechanic && text('element', 'printElement', row.element || 'Neutral', row.elementFontSize ?? 6)}
      </>}
    </div>
  </div>;
}
