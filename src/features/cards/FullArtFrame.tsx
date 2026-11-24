import { useEffect, useId, useRef } from 'react';
import styles from './cards.module.css';

// Shared coordinates match the 5:7 card face. Geometry is decorative; the fields stay HTML.
const rim = 'M96 13H460L486 38V649L458 678H42L14 649V96';
const plaque = 'M104 24H453L471 43V76L449 93H104L87 76V43Z';
const banner = 'M104 32H452L465 44V72L445 86H104L92 71V46Z';
const shield = 'M53.5 8L95 27V60Q95 81 53.5 102Q12 81 12 60V27Z';
const fighterBanner = 'M83 32Q172 26 270 30Q365 34 444 28L444 76Q351 82 253 79T88 91Z';
const fighterBeam = 'M24 26L472 18L481 22L477 29L25 37L13 32Z';
const fighterCrest = 'M17 24L53 12L88 27L87 60Q82 81 53 95Q25 80 20 61Z';

export function FullArtFrame({ fighter, reactive, bronze }: { fighter: boolean; reactive: boolean; bronze: boolean }) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const shine = useRef<SVGRadialGradientElement>(null);
  const tint = fighter ? '#844044' : '#575773';
  const tone = fighter ? '#cc8f80' : '#abacd0';

  useEffect(() => {
    const parent = svg.current?.parentElement;
    const gradient = shine.current;
    if (!reactive || !parent || !gradient) return;
    const face = parent;
    const light = gradient;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scheduled = 0;
    let point = [142, 105];
    function paint() {
      scheduled = 0;
      light.setAttribute('cx', String(point[0]));
      light.setAttribute('cy', String(point[1]));
    }
    function schedule() {
      if (!scheduled) scheduled = requestAnimationFrame(paint);
    }
    function track(event: PointerEvent) {
      if (motion.matches || event.pointerType === 'touch') return;
      const bounds = face.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      point = [(event.clientX - bounds.left) / bounds.width * 500, (event.clientY - bounds.top) / bounds.height * 700];
      schedule();
    }
    function reset() {
      point = [142, 105];
      schedule();
    }
    face.addEventListener('pointermove', track, { passive: true });
    face.addEventListener('pointerleave', reset);
    motion.addEventListener('change', reset);
    return () => {
      cancelAnimationFrame(scheduled);
      face.removeEventListener('pointermove', track);
      face.removeEventListener('pointerleave', reset);
      motion.removeEventListener('change', reset);
    };
  }, [reactive]);

  return <svg ref={svg} className={styles.fullArtFrame} data-reactive={reactive || undefined} viewBox="0 0 500 700" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + '-steel'} x2="100%" y2="100%">
        <stop stopColor="#d8d5ca" /><stop offset=".30" stopColor="#555763" />
        <stop offset=".51" stopColor="#a1a1a5" /><stop offset=".73" stopColor="#3f4049" />
        <stop offset="1" stopColor="#d0b9a7" />
      </linearGradient>
      <linearGradient id={id + '-cloth'} x2="0" y2="100%">
        <stop stopColor={tint} /><stop offset=".46" stopColor={fighter ? '#541b22' : '#303043'} />
        <stop offset="1" stopColor={fighter ? '#271317' : '#191923'} />
      </linearGradient>
      <radialGradient ref={shine} id={id + '-light'} gradientUnits="userSpaceOnUse" cx="142" cy="105" r="220">
        <stop stopColor={bronze ? '#c89474' : '#fff0bb'} stopOpacity={bronze ? '.68' : '.95'} />
        <stop offset=".55" stopColor={bronze ? '#95634c' : '#f9bf7d'} stopOpacity=".30" />
        <stop offset="1" stopColor={bronze ? '#95634c' : '#f9bf7d'} stopOpacity="0" />
      </radialGradient>
    </defs>
    {fighter ? <>
      <g className={styles.fighterClothTip}>
        <path d="M435 29Q451 28 476 27L462 48L484 63Q465 74 435 78Z" fill={`url(#${id}-cloth)`} stroke="#2a1116" strokeWidth="4" />
        <path d="M439 68Q458 67 474 62" fill="none" stroke="#f1aaaa" strokeOpacity=".33" strokeWidth="2" />
      </g>
      <g>
        <path d={fighterBanner} fill={`url(#${id}-cloth)`} stroke="#2a1116" strokeWidth="4" />
        <path d="M111 80Q246 66 393 71L438 68M112 45Q284 43 424 37" fill="none" stroke="#f1aaaa" strokeOpacity=".33" strokeWidth="2" />
      </g>
      <path d={fighterBeam} fill={`url(#${id}-steel)`} stroke="#292024" strokeWidth="2" />
      <path d={fighterCrest} fill="#251820" stroke={`url(#${id}-steel)`} strokeWidth="5" />
      <circle cx="53.5" cy="53.9" r="36" fill="#09131f" stroke="#ae7772" strokeWidth="2" />
      <g fill="none" stroke={`url(#${id}-light)`} strokeWidth="3">
        <path d="M19 28L53 15L86 28M109 26L477 20" />
      </g>
    </> : <>
    <path d={rim} fill="none" stroke="#0c0b11" strokeWidth="16" />
    <path d={rim} fill="none" stroke={`url(#${id}-steel)`} strokeWidth="5" />
    <path d={plaque} fill="#161119" stroke={`url(#${id}-steel)`} strokeWidth="4" />
    <path d={banner} fill={`url(#${id}-cloth)`} stroke={tone} strokeOpacity=".7" strokeWidth="1.5" />
    <path d={shield} fill="#151720" stroke={`url(#${id}-steel)`} strokeWidth="4" />
    <circle cx="53.5" cy="53.9" r="37.5" fill="#0a1020" stroke={tint} strokeWidth="3" />
    <g fill={tone}>
      <circle cx="110" cy="59" r="2.4" /><circle cx="449" cy="58" r="2.4" />
      <circle cx="32" cy="661" r="2.4" /><circle cx="468" cy="661" r="2.4" />
    </g>
    <g fill="none" stroke={`url(#${id}-light)`} strokeWidth="3">
      <path d={rim} /><path d={plaque} /><path d={shield} />
    </g>
    </>}
  </svg>;
}
