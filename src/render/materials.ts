import * as THREE from 'three';
import { WORLD_CLOCK } from './atmosphere';

/**
 * Shared material roles for the world. Untextured pieces use one of a few
 * vertex-tinted finishes, so thousands of differently coloured parts batch
 * together; textured ground and walls come from `surfaces.ts`.
 */
function finish(name: string, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness, ...extra });
  material.name = name;
  return material;
}

export const flat = {
  /** Dry paint, primer, card, cloth. */
  matte: finish('flat-matte', .88, 0),
  /** Enamel, plastic, sign paint. */
  satin: finish('flat-satin', .5, 0),
  /** Bare or galvanised steel. */
  metal: finish('flat-metal', .46, .78),
  /** Polished trim and mirrors. */
  chrome: finish('flat-chrome', .14, 1),
  rubber: finish('flat-rubber', .94, 0),
  /** Thin sheet seen from both sides: bent panels, bunting, awning cloth. */
  sheet: finish('flat-sheet', .78, .2, { side: THREE.DoubleSide }),
  /** Road paint and other marks laid a few millimetres above a surface. Wins depth ties at any distance. */
  marking: finish('flat-marking', .82, 0, { polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5 }),
};

/** Reflective glazing for shop fronts and windows. Opaque: the room behind is painted, not rendered. */
export const glazing = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, vertexColors: true, roughness: .08, metalness: .35, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.5,
});
glazing.name = 'glazing';

/**
 * Town windows: dark reflective glass by day. Each pane's vertex colour is the
 * light of the room behind it, which only shows once the sun is down, so lit
 * and unlit windows share one material and one draw call per map cell.
 */
export const windowGlass = new THREE.MeshPhysicalMaterial({
  color: 0x5d7078, vertexColors: true, roughness: .06, metalness: .72, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.35,
});
windowGlass.name = 'window-glass';
windowGlass.onBeforeCompile = shader => {
  shader.uniforms.uWorldClock = WORLD_CLOCK;
  shader.fragmentShader = 'uniform vec4 uWorldClock;\n' + shader.fragmentShader
    .replace('#include <color_fragment>', '')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * uWorldClock.z * 1.0;');
};
windowGlass.customProgramCacheKey = () => 'jd-window-glass';

/** See-through panes for the shop and workshop. */
export const clearGlass = new THREE.MeshPhysicalMaterial({
  color: 0x9fb4b8, roughness: .06, metalness: .1, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.4,
  transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide,
});
clearGlass.name = 'clear-glass';

/** Standing water: nearly black, mirror smooth, so it shows the sky. */
export const puddle = new THREE.MeshPhysicalMaterial({
  color: 0x1c1f20, roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.9,
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
puddle.name = 'puddle';
puddle.userData.needsUv = true;

interface Glow { material: THREE.MeshBasicMaterial; day: number; night: number; flicker: number; tint: THREE.Color }
const glows: Glow[] = [];

/** Give a one-off lit material, such as a tube sign, the same day and night behaviour as the shared ones. */
export function registerGlow(material: THREE.MeshBasicMaterial, day: number, night: number, flicker = 0, tint = 0xffffff) {
  glows.push({ material, day, night, flicker, tint: new THREE.Color(tint) });
}

/**
 * Unlit, vertex-tinted light sources. Their brightness follows the clock and
 * can exceed white, which is what the bloom pass picks up after dark.
 */
function glow(name: string, day: number, night: number, flicker = 0, extra: THREE.MeshBasicMaterialParameters = {}) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, ...extra });
  material.name = name;
  registerGlow(material, day, night, flicker);
  return material;
}

export const lights = {
  /** Street and yard lamps. */
  lamp: glow('glow-lamp', .5, 5.5),
  /** Tubes and fittings that burn all day indoors. */
  interior: glow('glow-interior', 2, 3.4),
  /** Sign lettering and tube signs. */
  neon: glow('glow-neon', .9, 5.5, .06),
  /** Lit rooms behind town windows. */
  window: glow('glow-window', .06, 2.4),
  /** Soft pools and cones cast by lamps; additive, so they only ever brighten. */
  pool: glow('glow-pool', 0, .5, 0, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  // Front faces only: a view from inside a cone, such as the chase camera under a workshop lamp, is not washed out.
  cone: glow('glow-cone', 0, .06, 0, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};
lights.pool.userData.needsUv = true;

let poolTexture: THREE.CanvasTexture | undefined;
/** Radial falloff shared by lamp pools. Created on first use, in the browser only. */
export function ensureLightTextures() {
  if (poolTexture) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.35, 'rgba(255,255,255,.5)');
  gradient.addColorStop(.7, 'rgba(255,255,255,.13)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  poolTexture = new THREE.CanvasTexture(canvas);
  poolTexture.colorSpace = THREE.SRGBColorSpace;
  lights.pool.map = poolTexture;
  lights.pool.needsUpdate = true;
}

/** Call once per frame: lamps fade up through dusk rather than snapping on. */
export function updateGlows(night: number, seconds: number) {
  for (const item of glows) {
    const pulse = item.flicker ? 1 + item.flicker * Math.sin(seconds * 13.7) * Math.sin(seconds * 3.1) : 1;
    item.material.color.copy(item.tint).multiplyScalar((item.day + (item.night - item.day) * night) * pulse);
  }
}

/** Foliage and long grass lean with the wind; the base of each piece stays planted. */
export function swaying<T extends THREE.Material>(material: T, strength: number, cacheKey: string): T {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWorldClock = WORLD_CLOCK;
    shader.vertexShader = 'uniform vec4 uWorldClock;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swayOrigin = instanceMatrix[3].xyz;
        float swayScale = length( instanceMatrix[1].xyz );
      #else
        vec3 swayOrigin = vec3( 0.0 );
        float swayScale = 1.0;
      #endif
      float swayPhase = swayOrigin.x * 0.31 + swayOrigin.z * 0.27;
      float swayLift = max( position.y, 0.0 ) * swayScale;
      float gust = sin( uWorldClock.x * 1.3 + swayPhase ) + 0.5 * sin( uWorldClock.x * 2.7 + swayPhase * 1.7 );
      // Divide by the instance scale so the lean is measured in metres, not model units.
      transformed.x += gust * ${strength.toFixed(4)} * swayLift * uWorldClock.y / swayScale;
      transformed.z += cos( uWorldClock.x * 1.1 + swayPhase * 1.3 ) * ${(strength * .6).toFixed(4)} * swayLift * uWorldClock.y / swayScale;
    `);
  };
  material.customProgramCacheKey = () => `jd-sway-${cacheKey}`;
  return material;
}
