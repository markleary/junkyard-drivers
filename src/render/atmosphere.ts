import * as THREE from 'three';
import { sampleSky, type RGB, type SkySample } from '../world/daylight';
import type { QualitySettings } from './quality';

/**
 * Sky, sun, moon, fog and reflections for any hour of the day. Everything is
 * generated: a shaded dome with drifting clouds and stars, a sun-aware fog term
 * shared by every lit material, and a small reflection cube rebuilt as light changes.
 */

// Typed arrays survive three's uniform cloning by reference, so one write per
// frame reaches every built-in material without touching them individually.
const FOG_SUN_VIEW = new Float32Array(3);
const FOG_SUN_TINT = new Float32Array(4);
/** For hand-written shaders that include the fog chunks: the two sun terms the patched chunks expect. */
export const FOG_SUN_UNIFORMS = { fogSunView: { value: FOG_SUN_VIEW }, fogSunTint: { value: FOG_SUN_TINT } };
/** x: seconds, y: wind strength, z: night 0..1, w: unused. Shared by foliage and emissive shaders. */
export const WORLD_CLOCK = { value: new THREE.Vector4(0, 1, 0, 0) };

let fogInstalled = false;
/** Fog brightens toward the sun, as haze does at golden hour. Must run before materials compile. */
export function installFogScattering() {
  if (fogInstalled) return;
  fogInstalled = true;
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (!shader.uniforms || !('fogColor' in shader.uniforms)) continue;
    shader.uniforms.fogSunView = { value: FOG_SUN_VIEW };
    shader.uniforms.fogSunTint = { value: FOG_SUN_TINT };
  }
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunView;
  uniform vec4 fogSunTint;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float fogSun = pow( max( dot( normalize( vFogView ), fogSunView ), 0.0 ), 5.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, fogSunTint.rgb, fogSun * fogSunTint.a ), fogFactor );
#endif`;
}

const skyVertex = /* glsl */`
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Rotation only: the dome is always centred on the eye and pinned to the far plane.
  vec4 clip = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = clip.xyww;
}`;

const skyFragment = /* glsl */`
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uGlow;
uniform vec3 uSunDisc;
uniform vec3 uCloudLight;
uniform vec3 uCloudShade;
// x: seconds, y: cloud cover, z: star brightness, w: sun and moon disc scale
uniform vec4 uParams;
varying vec3 vDirection;

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float hash31( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}
float valueNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash21( i ), hash21( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( hash21( i + vec2( 0.0, 1.0 ) ), hash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float amplitude = 0.5, sum = 0.0;
  for ( int i = 0; i < CLOUD_OCTAVES; i ++ ) {
    sum += amplitude * valueNoise( p );
    p = p * 2.03 + vec2( 17.3, 9.1 );
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize( vDirection );
  float up = dir.y;
  float sunDot = max( dot( dir, uSunDir ), 0.0 );
  float height = clamp( up, 0.0, 1.0 );
  vec3 sky = mix( uMid, uTop, pow( height, 0.58 ) );
  // The warm band stays low, and climbs higher on the side of the sky that holds the sun.
  float low = 1.0 - height;
  float band = pow( low, 7.0 ) + pow( low, 2.6 ) * pow( sunDot, 2.0 ) * 0.62;
  sky = mix( sky, uHorizon, clamp( band, 0.0, 1.0 ) );
  sky += uGlow * ( pow( sunDot, 4.0 ) * 0.2 * low + pow( sunDot, 30.0 ) * 0.6 );

  #if CLOUD_OCTAVES > 0
  if ( up > 0.012 ) {
    vec2 plane = dir.xz / ( up + 0.16 );
    vec2 wind = vec2( uParams.x * 0.0052, uParams.x * 0.0021 );
    float detail = fbm( plane * 2.9 - wind * 1.6 );
    float body = fbm( plane * 0.74 + wind ) * 0.7 + detail * 0.3;
    float edge = mix( 0.62, 0.34, uParams.y );
    float density = smoothstep( edge, edge + 0.13, body );
    if ( density > 0.001 ) {
      vec2 toSun = normalize( uSunDir.xz + vec2( 0.0001 ) ) * 0.26;
      float shaded = fbm( ( plane + toSun ) * 0.74 + wind ) * 0.7 + detail * 0.3;
      float lit = clamp( 0.5 + ( body - shaded ) * 5.2, 0.0, 1.0 );
      // Thick cores are darker underneath; thin edges catch the light.
      vec3 cloud = mix( uCloudShade, uCloudLight, lit * ( 1.0 - 0.35 * smoothstep( edge + 0.1, edge + 0.34, body ) ) );
      cloud += uGlow * pow( sunDot, 8.0 ) * 0.85 * ( 1.0 - density * 0.5 );
      sky = mix( sky, cloud, density * smoothstep( 0.012, 0.15, up ) * 0.95 );
    }
  }
  #endif

  if ( uParams.z > 0.01 && up > 0.0 ) {
    vec3 grid = dir * 120.0;
    vec3 cell = floor( grid );
    float seed = hash31( cell );
    float size = 0.1 + 0.16 * fract( seed * 91.7 );
    float star = step( 0.991, seed ) * smoothstep( size, 0.0, length( fract( grid ) - 0.5 ) );
    float twinkle = 0.72 + 0.28 * sin( uParams.x * 2.3 + seed * 400.0 );
    vec3 tint = mix( vec3( 1.0, 0.86, 0.72 ), vec3( 0.76, 0.86, 1.0 ), fract( seed * 37.0 ) );
    sky += tint * star * twinkle * uParams.z * 3.2 * smoothstep( 0.0, 0.2, up );
  }

  // Haze gathers at the horizon so distant ground dissolves into the same tone.
  sky = mix( sky, uFog, pow( 1.0 - clamp( up, 0.0, 1.0 ), 11.0 ) * 0.88 );
  if ( up < 0.0 ) sky = mix( uFog, uFog * 0.55, smoothstep( 0.0, -0.35, up ) );

  float disc = smoothstep( 0.99962, 0.99982, sunDot ) * step( -0.02, uSunDir.y );
  sky += uSunDisc * disc * uParams.w;
  float moonDot = max( dot( dir, uMoonDir ), 0.0 );
  float moon = smoothstep( 0.99955, 0.99975, moonDot );
  sky += vec3( 0.86, 0.9, 1.0 ) * ( moon * 2.6 + pow( moonDot, 420.0 ) * 0.22 ) * uParams.z * uParams.w;

  gl_FragColor = vec4( sky, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const setColor = (target: THREE.Color, value: RGB, scale = 1) => target.setRGB(value[0] * scale, value[1] * scale, value[2] * scale, THREE.LinearSRGBColorSpace);

export interface Atmosphere {
  readonly sun: THREE.DirectionalLight;
  readonly sample: SkySample;
  /** Unit vector toward the light that casts shadows. */
  readonly keyDirection: THREE.Vector3;
  setHour(hour: number): void;
  /** Call once per frame before rendering. */
  update(dt: number, camera: THREE.Camera): void;
  /** Rebuild shadow and reflection resources after a quality change. */
  configure(quality: QualitySettings): void;
  dispose(): void;
}

export function createAtmosphere(renderer: THREE.WebGLRenderer, scene: THREE.Scene, initialQuality: QualitySettings, hour: number): Atmosphere {
  installFogScattering();
  let quality = initialQuality;
  let sample = sampleSky(hour);

  const uniforms = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlow: { value: new THREE.Color() }, uSunDisc: { value: new THREE.Color() },
    uCloudLight: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
    uParams: { value: new THREE.Vector4(0, .46, 0, 1) },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: skyVertex, fragmentShader: skyFragment,
    defines: { CLOUD_OCTAVES: quality.cloudOctaves },
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const skyGeometry = new THREE.SphereGeometry(1, 48, 24);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'Sky dome';
  sky.frustumCulled = false;
  sky.renderOrder = 1000; // After opaque scenery, so hidden sky pixels are never shaded.
  sky.matrixAutoUpdate = false;
  scene.add(sky);

  const fog = new THREE.FogExp2(0xffffff, .0015);
  scene.fog = fog;
  scene.background = null;

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x777777, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.shadow.normalBias = .03;
  sun.shadow.bias = -.00016;
  scene.add(hemisphere, sun, sun.target);

  // Reflections: the same sky over an earth-toned ground, ringed by broad dark
  // shapes that stand in for the workshop, fence line and trees on curved paint.
  const reflectionScene = new THREE.Scene();
  const reflectionSky = new THREE.Mesh(skyGeometry, skyMaterial);
  reflectionSky.frustumCulled = false;
  const groundMaterial = new THREE.MeshBasicMaterial({ fog: false });
  const reflectionGround = new THREE.Mesh(new THREE.CircleGeometry(900, 40), groundMaterial);
  reflectionGround.rotation.x = -Math.PI / 2;
  reflectionGround.position.y = -2.2;
  const silhouetteMaterials = [new THREE.MeshBasicMaterial({ fog: false }), new THREE.MeshBasicMaterial({ fog: false }), new THREE.MeshBasicMaterial({ fog: false })];
  const silhouetteBase: RGB[] = [[.09, .11, .08], [.2, .18, .13], [.06, .08, .06]];
  const silhouetteGeometry = new THREE.BoxGeometry(1, 1, 1);
  reflectionScene.add(reflectionSky, reflectionGround);
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2, distance = 90 + i % 3 * 12, height = 8 + i % 4 * 4;
    const silhouette = new THREE.Mesh(silhouetteGeometry, silhouetteMaterials[i % 3]);
    silhouette.position.set(Math.cos(angle) * distance, height / 2 - 2, Math.sin(angle) * distance);
    silhouette.scale.set(i % 3 ? 15 : 24, height, 12);
    silhouette.rotation.y = -angle;
    reflectionScene.add(silhouette);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  let environment: THREE.WebGLRenderTarget | undefined;
  let environmentHour = Infinity, environmentAge = Infinity, seconds = 0;

  function bakeEnvironment() {
    environmentHour = sample.hour;
    environmentAge = 0;
    if (!quality.environmentSize) {
      // Software rendering: no reflection cube. Sampling one is the costliest part of every lit pixel there.
      scene.environment = null;
      environment?.dispose();
      environment = undefined;
      return;
    }
    const light = .08 + .92 * sample.daylight;
    setColor(groundMaterial.color, sample.hemiGround, .55 + .75 * sample.daylight);
    silhouetteMaterials.forEach((material, i) => setColor(material.color, silhouetteBase[i], light));
    const discs = uniforms.uParams.value.w;
    uniforms.uParams.value.w = 0; // A sharp sun in the cube smears into blotches; the sun light supplies that highlight.
    const next = pmrem.fromScene(reflectionScene, .02, .1, 3000, { size: quality.environmentSize });
    uniforms.uParams.value.w = discs;
    scene.environment = next.texture;
    environment?.dispose();
    environment = next;
  }

  function applyShadows() {
    renderer.shadowMap.enabled = quality.shadows;
    sun.castShadow = quality.shadows;
    const size = Math.min(quality.shadowMapSize, renderer.capabilities.maxTextureSize);
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const range = quality.shadowRange;
    Object.assign(sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 1, far: 340 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.radius = quality.tier === 'high' ? 2.2 : 1.6;
  }

  const keyDirection = new THREE.Vector3();
  function apply() {
    setColor(uniforms.uTop.value, sample.top);
    setColor(uniforms.uMid.value, sample.mid);
    setColor(uniforms.uHorizon.value, sample.horizon);
    setColor(uniforms.uFog.value, sample.fog);
    setColor(uniforms.uGlow.value, sample.glow);
    setColor(uniforms.uCloudLight.value, sample.cloudLight);
    setColor(uniforms.uCloudShade.value, sample.cloudShade);
    // Deliberately far above 1: the disc is the brightest thing in view and feeds the bloom.
    setColor(uniforms.uSunDisc.value, sample.keyColor, sample.daylight > 0 ? 34 : 0);
    uniforms.uSunDir.value.set(...sample.sun);
    uniforms.uMoonDir.value.set(...sample.moon);
    uniforms.uParams.value.z = sample.stars;
    setColor(fog.color, sample.fog);
    fog.density = sample.fogDensity;
    setColor(hemisphere.color, sample.hemiSky);
    setColor(hemisphere.groundColor, sample.hemiGround);
    // Without a reflection cube the sky fill also stands in for its diffuse light.
    hemisphere.intensity = sample.hemiIntensity * (quality.environmentSize ? 1 : 1 + sample.environment * .6);
    setColor(sun.color, sample.keyColor);
    sun.intensity = sample.keyIntensity;
    keyDirection.set(...sample.key);
    scene.environmentIntensity = sample.environment;
    renderer.toneMappingExposure = sample.exposure;
    WORLD_CLOCK.value.z = sample.night;
    FOG_SUN_TINT[0] = sample.glow[0]; FOG_SUN_TINT[1] = sample.glow[1]; FOG_SUN_TINT[2] = sample.glow[2];
    FOG_SUN_TINT[3] = .1 + .62 * sample.daylight;
  }

  const viewSun = new THREE.Vector3();
  applyShadows();
  apply();
  bakeEnvironment();

  return {
    sun, keyDirection,
    get sample() { return sample; },
    setHour(next: number) {
      sample = sampleSky(next);
      apply();
    },
    update(dt: number, camera: THREE.Camera) {
      seconds += dt;
      environmentAge += dt;
      uniforms.uParams.value.x = seconds;
      WORLD_CLOCK.value.x = seconds;
      viewSun.set(...sample.sun).transformDirection(camera.matrixWorldInverse);
      FOG_SUN_VIEW[0] = viewSun.x; FOG_SUN_VIEW[1] = viewSun.y; FOG_SUN_VIEW[2] = viewSun.z;
      // Reflections follow the light without re-rendering the cube every frame.
      const drift = Math.abs(sample.hour - environmentHour);
      if (Math.min(drift, 24 - drift) > .12 && environmentAge > 2.5) bakeEnvironment();
    },
    configure(next: QualitySettings) {
      const cloudsChanged = next.cloudOctaves !== quality.cloudOctaves;
      const cubeChanged = next.environmentSize !== quality.environmentSize;
      quality = next;
      if (cloudsChanged) {
        skyMaterial.defines.CLOUD_OCTAVES = quality.cloudOctaves;
        skyMaterial.needsUpdate = true;
      }
      applyShadows();
      apply();
      if (cloudsChanged || cubeChanged) bakeEnvironment();
    },
    dispose() {
      scene.remove(sky, hemisphere, sun, sun.target);
      environment?.dispose();
      pmrem.dispose();
      skyGeometry.dispose(); skyMaterial.dispose();
      reflectionGround.geometry.dispose(); groundMaterial.dispose();
      silhouetteGeometry.dispose(); silhouetteMaterials.forEach(material => material.dispose());
      sun.shadow.dispose();
    },
  };
}
