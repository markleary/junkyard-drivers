/** Rendering tiers. Gameplay, physics and saves are identical in every tier. */
export type QualityTier = 'high' | 'medium' | 'low' | 'compatible';
export type QualityChoice = QualityTier | 'auto';

export interface QualitySettings {
  tier: QualityTier;
  /** Upper bound on the canvas pixel ratio. The DOM interface stays at native density. */
  pixelRatio: number;
  /** Multisample count for the scene buffer. */
  samples: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Half-extent in metres of the sun shadow volume around the view. */
  shadowRange: number;
  ambientOcclusion: boolean;
  bloom: boolean;
  /** Screen passes need the float scene buffer; software WebGL renders straight to the canvas. */
  postprocessing: boolean;
  /** Noise octaves in the cloud layer. Zero draws a clear gradient sky. */
  cloudOctaves: number;
  /** 0..1 multiplier for instanced ground cover and loose scatter. */
  density: number;
  /** Upper bound on live particles. */
  particles: number;
  /** Street lamps that carry a real light near the player after dark. */
  lampLights: number;
  /** Edge length of the reflection cube. Zero skips image-based lighting; the sky fill is raised to make up for it. */
  environmentSize: number;
}

const TIERS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: 'high', pixelRatio: 1.5, samples: 4, shadows: true, shadowMapSize: 4096, shadowRange: 62,
    ambientOcclusion: true, bloom: true, postprocessing: true, cloudOctaves: 5, density: 1, particles: 900, lampLights: 4, environmentSize: 256,
  },
  medium: {
    tier: 'medium', pixelRatio: 1.25, samples: 4, shadows: true, shadowMapSize: 2048, shadowRange: 52,
    ambientOcclusion: false, bloom: true, postprocessing: true, cloudOctaves: 4, density: .6, particles: 500, lampLights: 2, environmentSize: 128,
  },
  low: {
    tier: 'low', pixelRatio: 1, samples: 0, shadows: true, shadowMapSize: 1024, shadowRange: 42,
    ambientOcclusion: false, bloom: false, postprocessing: true, cloudOctaves: 3, density: .3, particles: 220, lampLights: 0, environmentSize: 128,
  },
  compatible: {
    tier: 'compatible', pixelRatio: .6, samples: 0, shadows: false, shadowMapSize: 512, shadowRange: 40,
    ambientOcclusion: false, bloom: false, postprocessing: false, cloudOctaves: 0, density: .12, particles: 60, lampLights: 0, environmentSize: 0,
  },
};

export const QUALITY_ORDER: QualityTier[] = ['high', 'medium', 'low', 'compatible'];
export const QUALITY_LABEL: Record<QualityChoice, string> = { auto: 'Auto', high: 'High', medium: 'Medium', low: 'Low', compatible: 'Compatible' };

export function qualitySettings(tier: QualityTier): QualitySettings {
  return { ...TIERS[tier] };
}

export function isSoftwareRenderer(name: string): boolean {
  return /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render/i.test(name);
}

/** Starting tier before any frame has been timed. */
export function initialTier(choice: QualityChoice, software: boolean, touch: boolean): QualityTier {
  if (software) return 'compatible';
  if (choice !== 'auto') return choice;
  return touch ? 'medium' : 'high';
}

/**
 * Auto mode only ever steps down, and only after a sustained slow stretch, so a
 * brief stall while shaders compile never costs the player their shadows.
 */
export class FrameBudget {
  private slow = 0;
  private settled = 0;

  /** Returns true when the tier should drop one step. dt is the unclamped frame time in seconds. */
  sample(dt: number): boolean {
    this.settled += dt;
    if (this.settled < 6) return false;
    if (dt > 1 / 34) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt * .5);
    if (this.slow < 3.5) return false;
    this.slow = 0;
    this.settled = 0;
    return true;
  }

  reset() {
    this.slow = 0;
    this.settled = 0;
  }
}

export function nextLowerTier(tier: QualityTier): QualityTier | undefined {
  if (tier === 'high') return 'medium';
  if (tier === 'medium') return 'low';
  return undefined;
}
