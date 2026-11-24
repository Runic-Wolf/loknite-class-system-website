import { useEffect, useRef, useState, type CSSProperties } from 'react';
import fragmentShader from './mana-orb-toroidal.frag.glsl?raw';
import styles from './ManaSlot.module.css';
import { manaOrbConfig } from './mana-orb-config';

const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUV;
void main() {
  vUV = aPosition * .5 + .5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SNAPSHOT = '/card-effects/mana-orb/toroidal-97.png';
const CHARGE = manaOrbConfig.chargePercent / 100;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader allocation failed.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'WebGL shader compilation failed.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function loadImage(source: string | null): Promise<HTMLImageElement | null> {
  if (!source) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  const sourceWidth = imageRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
  const sourceHeight = imageRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

export function ManaSlot({ cost, animated = false, editable = false, frameSrc = null, backgroundSrc = null, aboveArt = false, onSelectCost }: {
  cost: string;
  animated?: boolean;
  editable?: boolean;
  frameSrc?: string | null;
  aboveArt?: boolean;
  backgroundSrc?: string | null;
  onSelectCost?: (() => void) | undefined;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationReadyRef = useRef(false);
  const [animationReady, setAnimationReady] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    const canvas = canvasRef.current;
    const face = slot?.parentElement;
    if (!animated || !slot || !canvas || !face) return;
    animationReadyRef.current = false;
    setAnimationReady(false);

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let animationFrame = 0;
    let startTime: number | null = null;
    let previousRender = 0;
    let active = true;
    let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let imageReady = false;
      const orbDiameter = manaOrbConfig.diameterPercentOfSlot / 100;
      let geometry = { centerX: .115, centerY: .925, sizeX: .21 * orbDiameter, sizeY: .15 * orbDiameter };

    try {
      const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
      program = gl.createProgram();
      if (!program) throw new Error('WebGL program allocation failed.');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL program link failed.');

      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!buffer || !texture) throw new Error('WebGL resource allocation failed.');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      const locations = {
        backdrop: gl.getUniformLocation(program, 'uBackdrop'),
        center: gl.getUniformLocation(program, 'uCenter'),
        size: gl.getUniformLocation(program, 'uSize'),
        time: gl.getUniformLocation(program, 'uTime'),
        mana: gl.getUniformLocation(program, 'uMana'),
      };

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(locations.backdrop, 0);
      gl.uniform1f(locations.mana, CHARGE);
      gl.clearColor(.035, .075, .105, 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const diameter = Math.max(64, Math.min(192, Math.round(canvas.clientWidth * pixelRatio)));
      canvas.width = diameter;
      canvas.height = diameter;
      gl.viewport(0, 0, diameter, diameter);

      const updateGeometry = () => {
        const faceRect = face.getBoundingClientRect();
        const slotRect = slot.getBoundingClientRect();
        if (!faceRect.width || !faceRect.height) return;
        geometry = {
          centerX: (slotRect.left + slotRect.width / 2 - faceRect.left) / faceRect.width,
          centerY: 1 - (slotRect.top + slotRect.height / 2 - faceRect.top) / faceRect.height,
          sizeX: slotRect.width * orbDiameter / faceRect.width,
          sizeY: slotRect.height * orbDiameter / faceRect.height,
        };
      };
      updateGeometry();
      const observer = new ResizeObserver(updateGeometry);
      observer.observe(face);

      const render = (now: number) => {
        if (!active || document.hidden || !imageReady) return;
        if (startTime === null) startTime = now;
        if (!reduced && now - previousRender < 1000 / 24) {
          animationFrame = requestAnimationFrame(render);
          return;
        }
        previousRender = now;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(locations.center, geometry.centerX, geometry.centerY);
        gl.uniform2f(locations.size, geometry.sizeX, geometry.sizeY);
        gl.uniform1f(locations.time, reduced ? 0 : (now - startTime) / 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!animationReadyRef.current) {
          animationReadyRef.current = true;
          setAnimationReady(true);
        }
        if (!reduced) animationFrame = requestAnimationFrame(render);
      };

      const backdropCanvas = document.createElement('canvas');
      backdropCanvas.width = 320;
      backdropCanvas.height = 448;
      const backdropContext = backdropCanvas.getContext('2d');
      if (!backdropContext) throw new Error('Card backdrop canvas is unavailable.');
      const prepareBackdrop = async () => {
        const [background, frameImage] = await Promise.all([loadImage(backgroundSrc), loadImage(frameSrc)]);
        if (!active) return;
        const gradient = backdropContext.createRadialGradient(96, 106, 0, 160, 205, 360);
        gradient.addColorStop(0, '#273b47');
        gradient.addColorStop(.55, '#172631');
        gradient.addColorStop(1, '#0c141c');
        backdropContext.fillStyle = gradient;
        backdropContext.fillRect(0, 0, 320, 448);
        if (background) drawCover(backdropContext, background, 320, 448);
        backdropContext.fillStyle = 'rgba(5, 13, 20, .14)';
        backdropContext.fillRect(0, 0, 320, 448);
        if (frameImage) backdropContext.drawImage(frameImage, 0, 0, 320, 448);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backdropCanvas);
        imageReady = true;
        animationFrame = requestAnimationFrame(render);
      };
      void prepareBackdrop();

      const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
      const onMotionChange = (event: MediaQueryListEvent) => {
        reduced = event.matches;
        cancelAnimationFrame(animationFrame);
        startTime = null;
        previousRender = 0;
        animationFrame = requestAnimationFrame(render);
      };
      motionPreference.addEventListener('change', onMotionChange);
      const onVisibilityChange = () => {
        cancelAnimationFrame(animationFrame);
        if (!document.hidden) {
          startTime = null;
          previousRender = 0;
          animationFrame = requestAnimationFrame(render);
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      return () => {
        active = false;
        cancelAnimationFrame(animationFrame);
        observer.disconnect();
        motionPreference.removeEventListener('change', onMotionChange);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      };
    } catch (error) {
      canvas.dataset.error = error instanceof Error ? error.message : 'WebGL initialization failed.';
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      setAnimationReady(false);
      return;
    }
  }, [animated, backgroundSrc, frameSrc]);

  const slotStyle = {
    '--mana-slot-offset-x': `${manaOrbConfig.slotOffsetXPercentOfCard}%`,
    '--mana-slot-offset-y': `${manaOrbConfig.slotOffsetYPercentOfCard}%`,
    '--mana-orb-diameter': `${aboveArt ? 55 : manaOrbConfig.diameterPercentOfSlot}%`,
    '--mana-cost-font': `${manaOrbConfig.costFontCqi}cqi`,
  } as CSSProperties;

  return <div ref={slotRef} className={styles.slot} data-charge={String(manaOrbConfig.chargePercent)} data-orb-layer={aboveArt ? 'above-frame' : manaOrbConfig.renderLayer} style={slotStyle}>
    <img className={styles.orbSnapshot} src={SNAPSHOT} alt="" aria-hidden="true" />
    {animated && <canvas ref={canvasRef} className={styles.ribbonCanvas} data-ready={animationReady ? 'true' : undefined} aria-hidden="true" />}
    <span className={styles.cost} aria-label={`Mana cost ${cost}`}>{cost}</span>
    {editable && <button className={styles.costHit} type="button" onClick={onSelectCost} aria-label="Edit mana cost" />}
  </div>;
}
