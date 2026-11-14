import * as THREE from 'three';
import { DEFAULT_PAINT, type ShellId } from '../game/catalog';

/** A rendering description, independent of the saved workshop record. */
export interface RestorationAppearance {
  stage: 'wash' | 'rust' | 'repair' | 'prime' | 'paint' | 'seal' | 'complete';
  route: 'paint' | 'patina';
  work: number;
  /** The colour captured before bodywork; choosing a final coat must not recolour the aged skin. */
  startingPaint?: string;
}

type Surface = 'dirty' | 'washed' | 'metal' | 'stabilized' | 'repaired' | 'preserved' | 'primer' | 'paint' | 'sealed';
const SIZE = 512;
const skin = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; return canvas; };

/** Keep the original cars' established chip locations when they enter the body shop. */
export function bodyWeatheringSeed(shellId: ShellId): number {
  const legacy: Partial<Record<ShellId, number>> = {
    hachiro: 7 * 7193, bison: 5 * 7193, veloce: 6 * 7193, wren: 4 * 7193, packhorse: 9 * 7193,
  };
  return legacy[shellId] ?? [...shellId].reduce((hash, letter) => Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
}

/**
 * The same chips survive washing, sanding and sealing. Each operation changes
 * their material, so preserving patina keeps the car's own recognizable marks.
 * Two CPU canvases hold this step's endpoints; only the working skin goes to
 * the GPU. Neither completed steps nor work fractions accumulate textures.
 */
export function createRestorationSurface(shellId: ShellId, base: readonly number[]) {
  const canvas = skin(), source = skin(), destination = skin();
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  let endpoints = '', lastWork = -1;

  function draw(target: HTMLCanvasElement, phase: Surface, paint: string, startingPaint: string) {
    const ctx = target.getContext('2d')!;
    let seed = bodyWeatheringSeed(shellId);
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const colour = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    // Untouched shells keep their authored oxidised colour. A previously painted
    // car ages its captured colour instead of reverting to that factory patina.
    const aged = startingPaint === DEFAULT_PAINT[shellId] ? base : colour(startingPaint);
    const rgb = phase === 'primer' ? [166, 165, 150] : phase === 'paint' ? colour(paint) : aged;
    const pixels = ctx.createImageData(SIZE, SIZE);
    const sealed = phase === 'sealed', plain = phase === 'primer' || phase === 'paint';
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grain = (random() - .5) * (plain ? 3 : 11);
      for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = rgb[channel] * (sealed ? .96 : 1) + grain;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    if (plain) return;
    for (let patch = 0; patch < 23; patch++) {
      const x = random() * SIZE, y = random() * SIZE, radius = 7 + random() * 28;
      const points = Array.from({ length: 16 }, (_, i) => {
        const angle = i / 16 * Math.PI * 2, r = radius * (.55 + random() * .6);
        return [Math.cos(angle) * r, Math.sin(angle) * r * .65];
      });
      const patchShape = (scale: number, color: string) => {
        ctx.fillStyle = color; ctx.beginPath();
        points.forEach(([px, py], i) => i ? ctx.lineTo(x + px * scale, y + py * scale) : ctx.moveTo(x + px * scale, y + py * scale));
        ctx.closePath(); ctx.fill();
      };
      const metal = phase === 'metal' || phase === 'repaired';
      const stable = ['stabilized', 'preserved', 'sealed'].includes(phase);
      const filled = phase === 'repaired' && patch % 3 === 0;
      const mended = (phase === 'preserved' || sealed) && patch % 6 === 0;
      patchShape(metal ? 1.3 : 1.14, metal ? '#979a90' : 'rgba(67,54,39,.55)');
      patchShape(1, filled ? '#c6bea6' : metal ? '#8a9190' : mended ? '#686b61' : '#79513a');
      patchShape(.65, filled ? '#d3cbb7' : metal ? '#a4abaa' : stable ? '#86563c' : '#9b6240');
      for (let speck = 0; speck < 16; speck++) {
        const light = random() > .5;
        ctx.fillStyle = metal ? light ? 'rgba(236,234,217,.25)' : 'rgba(45,54,53,.15)'
          : light ? 'rgba(48,35,28,.38)' : 'rgba(184,123,74,.35)';
        ctx.fillRect(x + (random() - .5) * radius, y + (random() - .5) * radius * .6, 1 + random() * 3, 1 + random() * 2);
      }
      if (metal) {
        // Fine, directional sanding lines only on exposed metal and filler.
        ctx.strokeStyle = 'rgba(231,234,219,.24)'; ctx.lineWidth = .6;
        for (let line = -3; line <= 3; line++) {
          ctx.beginPath(); ctx.moveTo(x - radius * .45, y + line * 2);
          ctx.lineTo(x + radius * .4, y + line * 2 - 1); ctx.stroke();
        }
      }
    }
    for (let i = 0; i < 46; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(215,208,178,.21)' : 'rgba(31,35,31,.3)'; ctx.lineWidth = .5 + random();
      const x = random() * SIZE, y = random() * SIZE;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8 + random() * 46, y + (random() - .5) * 7); ctx.stroke();
    }
    if (phase === 'dirty') {
      // Settled dust, road film and thin vertical runs, rather than opaque mud.
      ctx.fillStyle = 'rgba(67,58,41,.21)'; ctx.fillRect(0, 0, SIZE, SIZE);
      const grime = ctx.createLinearGradient(0, 190, 0, SIZE);
      grime.addColorStop(0, 'rgba(38,36,27,0)'); grime.addColorStop(1, 'rgba(38,36,27,.43)');
      ctx.fillStyle = grime; ctx.fillRect(0, 0, SIZE, SIZE);
      for (let streak = 0; streak < 65; streak++) {
        ctx.fillStyle = `rgba(46,42,29,${.025 + random() * .045})`;
        ctx.fillRect(random() * SIZE, random() * SIZE, 1 + random() * 3, 20 + random() * 100);
      }
    }
  }

  return {
    texture,
    update(appearance: RestorationAppearance, paint: string) {
      const patina = appearance.route === 'patina';
      const phases: Record<RestorationAppearance['stage'], [Surface, Surface]> = {
        wash: ['dirty', 'washed'], rust: ['washed', patina ? 'stabilized' : 'metal'],
        repair: [patina ? 'stabilized' : 'metal', patina ? 'preserved' : 'repaired'],
        prime: ['repaired', 'primer'], paint: ['primer', 'paint'], seal: ['preserved', 'sealed'],
        complete: [patina ? 'sealed' : 'paint', patina ? 'sealed' : 'paint'],
      };
      const [from, to] = phases[appearance.stage];
      const startingPaint = (appearance.startingPaint ?? paint).toLowerCase();
      const key = `${from}/${to}/${paint}/${startingPaint}`;
      // 24 small passes give visible travel without uploading on every frame.
      const work = Math.round(THREE.MathUtils.clamp(appearance.work, 0, 1) * 24) / 24;
      if (endpoints === key && lastWork === work) return;
      if (endpoints !== key) { draw(source, from, paint, startingPaint); draw(destination, to, paint, startingPaint); endpoints = key; }
      lastWork = work;
      context.clearRect(0, 0, SIZE, SIZE);
      context.drawImage(source, 0, 0);
      if (work >= 1 || from === to) context.drawImage(destination, 0, 0);
      else if (work > 0) {
        // Work travels across body-space UVs. A soft edge reads as a cloth or
        // spray pass rather than a broad whole-car colour dissolve.
        const edge = work * (SIZE + 20) - 10, full = Math.max(0, Math.floor(edge - 10));
        if (full) context.drawImage(destination, 0, 0, SIZE, full, 0, 0, SIZE, full);
        for (let y = full; y < Math.min(SIZE, edge + 10); y++) {
          context.globalAlpha = THREE.MathUtils.clamp((edge + 10 - y) / 20, 0, 1);
          context.drawImage(destination, 0, y, SIZE, 1, 0, y, SIZE, 1);
        }
        context.globalAlpha = 1;
      }
      texture.needsUpdate = true;
    },
    dispose() { texture.dispose(); canvas.width = source.width = destination.width = 1; },
  };
}
