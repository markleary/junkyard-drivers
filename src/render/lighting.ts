import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Outdoor light, reflections and restrained contact shading, independent of game state. */
export function createLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareRenderer = /SwiftShader|llvmpipe|softpipe|Software Rasterizer/i.test(rendererName);
  if (softwareRenderer) {
    renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), .6));
    renderer.setSize(innerWidth, innerHeight);
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !softwareRenderer;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const sunDirection = new THREE.Vector3(-.78, .43, .46).normalize();
  const sky = new Sky();
  sky.scale.setScalar(5000);
  sky.material.uniforms.turbidity.value = 2.8;
  sky.material.uniforms.rayleigh.value = 1.5;
  sky.material.uniforms.mieCoefficient.value = .004;
  sky.material.uniforms.mieDirectionalG.value = .8;
  sky.material.uniforms.sunPosition.value.copy(sunDirection);
  scene.add(sky);
  scene.background = new THREE.Color('#b8c6cd');
  scene.fog = new THREE.Fog('#c1cbc7', 200, 600);

  // The same sky lights the paint and glass. An earth hemisphere grounds the
  // reflections without a remote HDRI or the old indoor studio light boxes.
  const environmentScene = new THREE.Scene();
  const environmentSky = sky.clone();
  environmentScene.add(environmentSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2000, 48), new THREE.MeshBasicMaterial({ color: '#655e4f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  environmentScene.add(ground);
  // Broad shapes along the reflected horizon give curved body panels readable
  // highlights, as a nearby workshop and tree line would, without a remote HDRI.
  const reflectionGeometry = new THREE.BoxGeometry(1, 1, 1);
  const reflectionMaterials = [0x586052, 0x7e7c6b, 0x464e43].map(color => new THREE.MeshBasicMaterial({ color }));
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2, distance = 90 + i % 3 * 12;
    const silhouette = new THREE.Mesh(reflectionGeometry, reflectionMaterials[i % 3]);
    const height = 8 + i % 4 * 4;
    silhouette.position.set(Math.cos(angle) * distance, height / 2 - 2, Math.sin(angle) * distance);
    silhouette.scale.set(i % 3 ? 15 : 24, height, 12); silhouette.rotation.y = -angle;
    environmentScene.add(silhouette);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .025, .1, 6000);
  scene.environment = environment.texture;
  scene.environmentIntensity = .68;
  ground.geometry.dispose(); ground.material.dispose(); pmrem.dispose();
  reflectionGeometry.dispose(); reflectionMaterials.forEach(material => material.dispose());

  const skyFill = new THREE.HemisphereLight('#c1d8e7', '#756049', .78);
  scene.add(skyFill);
  const sun = new THREE.DirectionalLight('#ffe1b9', 3.2);
  sun.castShadow = !softwareRenderer;
  const shadowSize = Math.min(softwareRenderer ? 512 : 4096, renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -68, right: 68, top: 68, bottom: -68, near: 1, far: 320 });
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00018;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  // Software WebGL keeps the same materials and light, but skips costly screen
  // passes so movement and fixed-step physics remain responsive in that mode.
  let composer: EffectComposer | undefined;
  let ao: GTAOPass | undefined;
  if (!softwareRenderer) {
    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    ao = new GTAOPass(scene, camera);
    ao.blendIntensity = .68;
    ao.normalMaterial.side = THREE.DoubleSide;
    ao.updateGtaoMaterial({ radius: .85, thickness: 1.1, distanceExponent: 1.5, distanceFallOff: .9, scale: .9, samples: 12 });
    ao.updatePdMaterial({ radius: 5, samples: 12, rings: 2, lumaPhi: 8, depthPhi: 2, normalPhi: 3 });
    composer.addPass(ao);
    // GTAO's normal override cannot sample cutout alpha. Exclude leaf sprays and
    // ground decals from that pass so their rectangles never create dark halos.
    // Their ordinary color and shadow passes still retain the actual cutouts.
    const renderAO = ao.render.bind(ao);
    let excluded: THREE.Object3D[] | undefined;
    ao.render = (...args) => {
      if (!excluded) {
        excluded = [];
        scene.traverse(object => { if (object.userData.excludeFromAO) excluded!.push(object); });
      }
      const visible = excluded.filter(object => object.visible);
      visible.forEach(object => { object.visible = false; });
      try { renderAO(...args); } finally { visible.forEach(object => { object.visible = true; }); }
    };
    composer.addPass(new OutputPass());
  }

  function resize(width: number, height: number) {
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(width, height);
    // Contact shading can use a smaller buffer while the color image stays sharp.
    const ratio = renderer.getPixelRatio();
    ao?.setSize(Math.ceil(width * ratio * .75), Math.ceil(height * ratio * .75));
  }
  resize(innerWidth, innerHeight);
  const focus = new THREE.Vector3();
  return {
    quality: softwareRenderer ? 'compatible' : 'detailed',
    render(dt: number) {
      // Quantizing shadow movement prevents sub-texel shimmer as the player walks.
      const texel = 136 / shadowSize;
      focus.set(Math.round(camera.position.x / texel) * texel, 0, Math.round(camera.position.z / texel) * texel);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDirection, 160);
      renderer.info.reset();
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    resize,
    dispose() {
      composer?.passes.forEach(pass => pass.dispose());
      composer?.dispose(); environment.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      sun.shadow.dispose();
    },
  };
}
