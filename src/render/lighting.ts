import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { createAtmosphere } from './atmosphere';
import { FrameBudget, initialTier, isSoftwareRenderer, nextLowerTier, qualitySettings, type QualityChoice, type QualityTier } from './quality';

export interface LightingOptions {
  touch: boolean;
  quality: QualityChoice;
  hour: number;
}

/** A named colour treatment applied after tone mapping. Photo mode swaps these. */
export interface Grade { saturation: number; contrast: number; vignette: number; warmth: number; fade: number }
export const GRADES = {
  natural: { saturation: 1.1, contrast: 1.0, vignette: .2, warmth: .16, fade: 0 },
  postcard: { saturation: 1.3, contrast: 1.12, vignette: .34, warmth: .7, fade: .02 },
  faded: { saturation: .72, contrast: .94, vignette: .42, warmth: .9, fade: .09 },
  mono: { saturation: 0, contrast: 1.2, vignette: .46, warmth: 0, fade: .03 },
} satisfies Record<string, Grade>;
export type GradeName = keyof typeof GRADES;

const finalVertex = /* glsl */`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

const finalFragment = /* glsl */`
precision highp float;
uniform sampler2D tColor;
// x: saturation, y: contrast, z: vignette, w: seconds
uniform vec4 uGrade;
// x: warmth, y: fade, z: shadow lift
uniform vec3 uTone;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float grain( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main() {
  vec3 color = texture2D( tColor, vUv ).rgb;
  color = ACESFilmicToneMapping( color );
  color = sRGBTransferOETF( vec4( color, 1.0 ) ).rgb;
  // Grading happens on display values, where contrast and saturation behave as the eye expects.
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( luma ), color, uGrade.x );
  color = ( color - 0.5 ) * uGrade.y + 0.5;
  // The darkest tones are raised a little, so tires and engines in shade keep their shape instead of closing up to black.
  color += uTone.z * ( 1.0 - smoothstep( 0.0, 0.32, luma ) );
  // Cool shadows against warm highlights, the late-afternoon palette of the yard.
  color += uTone.x * ( vec3( -0.012, 0.0, 0.018 ) * ( 1.0 - luma ) + vec3( 0.016, 0.006, -0.012 ) * luma );
  color = mix( color, vec3( 0.78, 0.74, 0.66 ), uTone.y );
  vec2 centred = vUv - 0.5;
  color *= 1.0 - uGrade.z * smoothstep( 0.32, 0.92, length( centred ) * 1.25 );
  // One 8-bit step of noise hides banding in the smooth sky gradient.
  color += ( grain( gl_FragCoord.xy + fract( uGrade.w ) * 91.0 ) - 0.5 ) / 255.0 * 1.6;
  gl_FragColor = vec4( clamp( color, 0.0, 1.0 ), 1.0 );
}`;

/** Sky, sun and shadows plus the screen passes, independent of game state. */
export function createLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: LightingOptions) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const software = isSoftwareRenderer(rendererName);
  let choice: QualityChoice = options.quality;
  let touch = options.touch;
  let tier: QualityTier = initialTier(choice, software, touch);
  let quality = qualitySettings(tier);
  let width = 1, height = 1;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const atmosphere = createAtmosphere(renderer, scene, quality, options.hour);
  const budget = new FrameBudget();

  const finalMaterial = new THREE.RawShaderMaterial({
    vertexShader: finalVertex, fragmentShader: finalFragment, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: null as THREE.Texture | null }, toneMappingExposure: { value: 1 },
      uGrade: { value: new THREE.Vector4(1, 1, 0, 0) }, uTone: { value: new THREE.Vector3(0, 0, 0) },
    },
  });
  const finalQuad = new FullScreenQuad(finalMaterial);
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const copyQuad = new FullScreenQuad(copyMaterial);

  let sceneTarget: THREE.WebGLRenderTarget | undefined;
  let compositeTarget: THREE.WebGLRenderTarget | undefined;
  let ao: GTAOPass | undefined;
  let bloom: UnrealBloomPass | undefined;
  let grade: Grade = GRADES.natural;
  let seconds = 0;

  function releaseTargets() {
    sceneTarget?.depthTexture?.dispose();
    sceneTarget?.dispose(); sceneTarget = undefined;
    compositeTarget?.dispose(); compositeTarget = undefined;
    ao?.dispose(); ao = undefined;
    bloom?.dispose(); bloom = undefined;
  }

  function buildTargets() {
    releaseTargets();
    if (!quality.postprocessing) return;
    const ratio = renderer.getPixelRatio();
    const w = Math.max(2, Math.round(width * ratio)), h = Math.max(2, Math.round(height * ratio));
    // The depth texture lets ambient occlusion reuse this pass instead of drawing the scene again.
    const depth = new THREE.DepthTexture(w, h);
    sceneTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthTexture: depth, samples: Math.min(quality.samples, renderer.capabilities.maxSamples),
    });
    if (quality.ambientOcclusion || quality.bloom) compositeTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    if (quality.ambientOcclusion) {
      ao = new GTAOPass(scene, camera, w, h);
      // Normals are rebuilt from depth, so cut-out foliage needs no special handling.
      ao.setGBuffer(depth, undefined);
      ao.blendIntensity = .74;
      ao.updateGtaoMaterial({ radius: .9, thickness: 1.1, distanceExponent: 1.4, distanceFallOff: .9, scale: 1, samples: 12 });
      ao.updatePdMaterial({ radius: 5, samples: 12, rings: 2, lumaPhi: 8, depthPhi: 2, normalPhi: 3 });
      ao.setSize(Math.ceil(w * .75), Math.ceil(h * .75));
    }
    if (quality.bloom) {
      // Only values well above white bloom: the sun, lamps, headlights and glints.
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .3, .6, 1.12);
    }
  }

  function applyQuality(next: QualityTier) {
    tier = next;
    quality = qualitySettings(tier);
    atmosphere.configure(quality);
    budget.reset();
    resize(width, height);
  }

  function resize(nextWidth: number, nextHeight: number) {
    width = Math.max(1, nextWidth); height = Math.max(1, nextHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    renderer.setSize(width, height);
    buildTargets();
  }

  const focus = new THREE.Vector3(), forward = new THREE.Vector3();
  function placeShadow() {
    // Bias the shadow volume ahead of the view, then snap to whole texels so
    // shadow edges do not shimmer as the player moves.
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    const texel = quality.shadowRange * 2 / atmosphere.sun.shadow.mapSize.x;
    const reach = quality.shadowRange * .42;
    focus.set(
      Math.round((camera.position.x + forward.x * reach) / texel) * texel, 0,
      Math.round((camera.position.z + forward.z * reach) / texel) * texel,
    );
    atmosphere.sun.target.position.copy(focus);
    atmosphere.sun.position.copy(focus).addScaledVector(atmosphere.keyDirection, 170);
  }

  resize(innerWidth, innerHeight);

  return {
    atmosphere,
    get quality() { return tier; },
    get settings() { return quality; },
    get choice() { return choice; },
    get software() { return software; },
    /** Player preference. Software WebGL always stays in the compatible tier. */
    setQuality(next: QualityChoice, isTouch = touch) {
      choice = next; touch = isTouch;
      const wanted = initialTier(choice, software, touch);
      if (wanted !== tier) applyQuality(wanted);
    },
    setGrade(name: GradeName) { grade = GRADES[name]; },
    render(dt: number, measure = true) {
      seconds += dt;
      if (measure && choice === 'auto' && budget.sample(dt)) {
        const lower = nextLowerTier(tier);
        if (lower) applyQuality(lower);
      }
      atmosphere.update(dt, camera);
      placeShadow();
      renderer.info.reset();
      if (!sceneTarget) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      let source = sceneTarget;
      if (compositeTarget) {
        if (ao) ao.render(renderer, compositeTarget, sceneTarget, dt, false);
        else {
          copyMaterial.uniforms.tDiffuse.value = sceneTarget.texture;
          renderer.setRenderTarget(compositeTarget);
          copyQuad.render(renderer);
        }
        bloom?.render(renderer, compositeTarget, compositeTarget, dt, false);
        source = compositeTarget;
      }
      const uniforms = finalMaterial.uniforms;
      uniforms.tColor.value = source.texture;
      uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      uniforms.uGrade.value.set(grade.saturation, grade.contrast, grade.vignette, seconds);
      uniforms.uTone.value.set(grade.warmth, grade.fade, .012 + .02 * atmosphere.sample.daylight);
      renderer.setRenderTarget(null);
      finalQuad.render(renderer);
    },
    resize,
    dispose() {
      releaseTargets();
      atmosphere.dispose();
      finalMaterial.dispose(); finalQuad.dispose();
      copyMaterial.dispose(); copyQuad.dispose();
    },
  };
}
export type Lighting = ReturnType<typeof createLighting>;
