import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { surfaceMaterial } from './surfaces';
import { createEngineModel, createWheelModel, createPaintCan } from './parts';
import { createFoliage, createGroundMark } from './vegetation';
import { createWindowMaterials, createPitchedRoof, createTankLettering } from './architecture';
import { getPartsForSale } from '../game/catalog';
import { AUTO_PARTS_STORE, YARD_BOUNDS, distanceToRoad, randomFromSeed, type TownLayout, type Point } from '../world/layout';

export interface WorldInteractable {
  id: string;
  kind: 'workbench' | 'listing' | 'rack' | 'store';
  listingId?: string;
  position: THREE.Vector3;
  label: string;
}

export interface WorldView {
  interactables: WorldInteractable[];
  garagePosition: THREE.Vector3;
  spawn: THREE.Vector3;
  updateListings: (purchased: string[]) => void;
}

export function createWorld(scene: THREE.Scene, world: RAPIER.World, layout: TownLayout): WorldView {
  const root = new THREE.Group();
  root.name = 'Town, scrapyard and workshop';
  scene.add(root);
  const rng = randomFromSeed(layout.seed ^ 0x8549);
  const mat = (color: number, roughness = .8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const materials = {
    grass: surfaceMaterial('grass', 0x78806a, 4), gravel: surfaceMaterial('gravel', 0xa2957e, 2.7), asphalt: surfaceMaterial('asphalt', 0x6c7172, 3.8), concrete: surfaceMaterial('concrete', 0xbcb9ae, 3.5), curb: surfaceMaterial('concrete', 0xc5c1b6, 3.5),
    yellow: mat(0xd7b866), white: mat(0xd4d5c6), steel: surfaceMaterial('metal', 0x7d8988, 2.3, .67, .45), darkSteel: mat(0x303b3d, .6, .55), ceiling: mat(0x454b49, .95, .02),
    rust: surfaceMaterial('rust', 0x996b50, 1.7, .97, .1), rustLight: surfaceMaterial('rust', 0xb18a68, 1.7, .97, .08), cream: surfaceMaterial('concrete', 0xc9c5b3, 4), orange: mat(0xb96a38),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x51696e, roughness: .13, metalness: .18, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.2 }), wood: surfaceMaterial('wood', 0x81705b, 2), rubber: mat(0x242a28), green: mat(0x4a613e), green2: mat(0x718254),
    blue: mat(0x657f85), tower: mat(0xa9beb8, .5, .5), red: mat(0x963e32), lamp: new THREE.MeshStandardMaterial({ color: 0xffe5ac, emissive: 0xf5b85c, emissiveIntensity: .4 }),
    leafLight: mat(0x788558), leafDark: mat(0x405336), dirt: mat(0x665c48), oil: mat(0x37352f, .5), patch: surfaceMaterial('asphalt', 0x626562, 3.8), brick: surfaceMaterial('brick', 0xb08773, .9),
    route: new THREE.MeshStandardMaterial({ color: 0xe8ad4d, roughness: .88, emissive: 0x8b531d, emissiveIntensity: .12 }),
    compacted: surfaceMaterial('gravel', 0x857c68, 2.7), storeBlue: mat(0x284d60, .78), cardboard: surfaceMaterial('wood', 0xc0a275, 1.4),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const leaves = createFoliage();
  const leafGeo = leaves.geometry;
  const markGeo = new THREE.PlaneGeometry(1, 1); markGeo.rotateX(-Math.PI / 2);
  const groundMarks = { oil: createGroundMark('oil'), dust: createGroundMark('dust'), tracks: createGroundMark('tracks') };
  const windows = createWindowMaterials();
  const roofGeo = createPitchedRoof();
  const roofMaterial = surfaceMaterial('metal', '#4d5756', 1.2, .8, .25);
  const tireGeo = new THREE.TorusGeometry(.36, .12, 8, 16);
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
  const temp = new THREE.Object3D();
  function instance(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const key = `${geo.uuid}:${material.uuid}`;
    let b = batches.get(key);
    if (!b) { b = { geometry: geo, material, matrices: [] }; batches.set(key, b); }
    temp.position.set(x, y, z); temp.rotation.set(rx, ry, rz); temp.scale.set(sx, sy, sz); temp.updateMatrix();
    b.matrices.push(temp.matrix.clone());
  }
  // The part factories share baked geometry. Fold their placed meshes into the
  // same instance batches as the scenery instead of drawing every bolt or can.
  function display(model: THREE.Group, x: number, y: number, z: number, yaw = 0, scale = 1) {
    model.position.set(x, y, z); model.rotation.y = yaw; model.scale.setScalar(scale); model.updateMatrixWorld(true);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometry: object.geometry, material: object.material, matrices: [] }; batches.set(key, batch); }
      batch.matrices.push(object.matrixWorld.clone());
    });
  }
  function groundMark(kind: keyof typeof groundMarks, x: number, y: number, z: number, w: number, d: number, yaw = 0) {
    instance(markGeo, groundMarks[kind], x, y, z, w, 1, d, 0, yaw);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, collision = false, yaw = 0) {
    instance(boxGeo, material, x, y, z, w, h, d, 0, yaw);
    if (collision) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z).setRotation(q).setFriction(.85));
    }
  }
  function cylinder(x: number, y: number, z: number, radius: number, height: number, material: THREE.Material, collision = false) {
    instance(cylGeo, material, x, y, z, radius, height, radius);
    if (collision) world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, y, z));
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    temp.position.copy(a).add(b).multiplyScalar(.5);
    temp.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, b.clone().sub(a).normalize());
    temp.scale.set(radius, a.distanceTo(b), radius); temp.updateMatrix();
    const key = `${cylGeo.uuid}:${material.uuid}`;
    let batch = batches.get(key);
    if (!batch) { batch = { geometry: cylGeo, material, matrices: [] }; batches.set(key, batch); }
    batch.matrices.push(temp.matrix.clone());
  }
  function sign(text: string, x: number, y: number, z: number, width: number, height: number, options: { color?: string; bg?: string; yaw?: number; sub?: string } = {}) {
    const canvas = document.createElement('canvas');
    // Wide fascia signs still need enough vertical pixels for the subtitle and
    // border insets; otherwise their lettering overlaps the bottom border.
    canvas.height = Math.max(128, Math.round(1024 * height / width));
    canvas.width = Math.round(canvas.height * width / height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = options.bg ?? '#283b36'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cfb889'; ctx.lineWidth = 9; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = options.color ?? '#e9ddbf';
    ctx.font = `900 ${Math.min(canvas.height * (options.sub ? .38 : .52), canvas.width / Math.max(3, text.length) * 1.48)}px sans-serif`;
    ctx.fillText(text, canvas.width / 2, canvas.height * (options.sub ? .4 : .5));
    if (options.sub) {
      ctx.font = `600 ${Math.min(canvas.height * .16, 42)}px sans-serif`;
      ctx.fillStyle = '#d8cba8'; ctx.fillText(options.sub, canvas.width / 2, canvas.height * .77);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: .9 });
    // Box faces: +X, -X, +Y, -Y, +Z, -Z. Print only on the outward face;
    // the opaque metal back prevents mirrored text when walking behind a sign.
    const backing = materials.darkSteel;
    const depth = .06;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [backing, backing, backing, backing, face, backing]);
    mesh.position.set(x, y, z); mesh.rotation.y = options.yaw ?? 0;
    mesh.translateZ(-depth / 2); // Keep the printed face at its original wall/post anchor.
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  function postSign(text: string, x: number, z: number, width = 4, options: { sub?: string; yaw?: number; bg?: string } = {}) {
    cylinder(x, 1.8, z, .065, 3.6, materials.darkSteel, true);
    const yaw = options.yaw ?? 0;
    sign(text, x + Math.sin(yaw) * .14, 3.2, z + Math.cos(yaw) * .14, width, 1.3, options);
  }

  // Shared low-profile geometry and collider make the entire drivable surface continuous.
  box(55, -.45, 70, 330, .9, 320, materials.grass, true);
  box((YARD_BOUNDS.minX + YARD_BOUNDS.maxX) / 2, .005, (YARD_BOUNDS.minZ + YARD_BOUNDS.maxZ) / 2, YARD_BOUNDS.maxX - YARD_BOUNDS.minX, .03, YARD_BOUNDS.maxZ - YARD_BOUNDS.minZ, materials.gravel);
  // Compacted salvage lanes connect the rack aisle to the much larger back lot.
  box(-60, .023, -2, 40, .004, 7, materials.compacted);
  box(-47, .023, -24, 7, .004, 46, materials.compacted);
  box(-69, .023, -24, 7, .004, 44, materials.compacted);
  box(-45, .023, -35, 65, .004, 7, materials.compacted);
  box(-20, .02, -15, 18, .08, 18, materials.concrete, true);
  for (const road of layout.roads) {
    const horizontal = road.a.z === road.b.z;
    const length = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
    const cx = (road.a.x + road.b.x) / 2, cz = (road.a.z + road.b.z) / 2;
    box(cx, .026, cz, horizontal ? length + road.width : road.width, .052, horizontal ? road.width : length + road.width, materials.asphalt, true);
    if (road.id.includes('garage') || road.id.includes('gate')) continue;
    // Individual sidewalk slabs leave the full junction and driveway unobstructed.
    for (let offset = 6; offset < length - 5; offset += 4) {
      const t = offset / length;
      const x = THREE.MathUtils.lerp(road.a.x, road.b.x, t), z = THREE.MathUtils.lerp(road.a.z, road.b.z, t);
      for (const side of [-1, 1]) {
        const px = horizontal ? x : x + side * (road.width / 2 + 1.65);
        const pz = horizontal ? z + side * (road.width / 2 + 1.65) : z;
        if (layout.roads.some(other => other !== road && distanceToRoad({ x: px, z: pz }, other) < other.width / 2 + 2.5)) continue;
        box(px, .08, pz, horizontal ? 3.95 : 3, .16, horizontal ? 3 : 3.95, materials.concrete, true);
        box(horizontal ? x : x + side * (road.width / 2 + .12), .12, horizontal ? z + side * (road.width / 2 + .12) : z, horizontal ? 3.95 : .24, .24, horizontal ? .24 : 3.95, materials.curb, true);
      }
    }
    for (let offset = 10; offset < length - 8; offset += 9) {
      const t = offset / length;
      box(THREE.MathUtils.lerp(road.a.x, road.b.x, t), .056, THREE.MathUtils.lerp(road.a.z, road.b.z, t), horizontal ? 4 : .14, .006, horizontal ? .14 : 4, materials.yellow);
    }
    for (const side of [-1, 1]) box(cx + (horizontal ? 0 : side * (road.width / 2 - .5)), .057, cz + (horizontal ? side * (road.width / 2 - .5) : 0), horizontal ? length - 12 : .12, .006, horizontal ? .12 : length - 12, materials.white);
    // Repairs and narrow sealed cracks add wear while keeping the road surface flat.
    for (let d = 19; d < length - 12; d += 37) {
      const t = d / length, side = rng() > .5 ? 1 : -1;
      const px = THREE.MathUtils.lerp(road.a.x, road.b.x, t) + (horizontal ? 0 : side * 2.6);
      const pz = THREE.MathUtils.lerp(road.a.z, road.b.z, t) + (horizontal ? side * 2.6 : 0);
      box(px, .054, pz, horizontal ? 3.6 : 1.4, .002, horizontal ? 1.4 : 3.6, materials.patch);
      for (let segment = 0; segment < 4; segment++) {
        const offset = (segment - 1.5) * .58;
        box(px + (horizontal ? offset : .12 * Math.sin(segment * 2)), .057, pz + (horizontal ? .12 * Math.sin(segment * 2) : offset), .025, .002, .67, materials.darkSteel, false, (horizontal ? Math.PI / 2 : 0) + Math.sin(segment) * .27);
      }
    }
  }

  // Workshop: large open doorway, an accessible workbench, and visible restoration bay.
  box(-20, 2.6, -24, 18, 5.2, .35, materials.cream, true);
  box(-29, 2.6, -15, .35, 5.2, 18, materials.cream, true);
  box(-11, 2.6, -15, .35, 5.2, 18, materials.cream, true);
  box(-27.6, 2.6, -6, 2.8, 5.2, .4, materials.cream, true);
  box(-12.4, 2.6, -6, 2.8, 5.2, .4, materials.cream, true);
  box(-20, 4.85, -6, 12.4, .7, .4, materials.darkSteel, true);
  box(-20, 5.28, -15, 19, .35, 19, materials.ceiling, true);
  for (let x = -29; x <= -11; x += .65) box(x, 5.49, -15, .12, .12, 19, materials.steel);
  for (let z = -23; z < -6; z += .7) {
    box(-28.76, 2.7, z, .035, 4.8, .035, materials.steel);
    box(-11.24, 2.7, z, .035, 4.8, .035, materials.steel);
  }
  sign('GARAGE', -20, 4.28, -5.42, 8.3, 1.05, { sub: 'RESTORE · REBUILD · REPEAT' });
  sign('BUILT, NOT BOUGHT.', -20, 3.5, -23.79, 8, 1.3, { bg: '#7c4432' });
  sign('01', -14.1, 2.7, -23.77, 1, 1.3);
  box(-27.3, .55, -15, 1.6, 1.1, 4, materials.darkSteel, true);
  box(-27.3, 1.14, -15, 1.85, .16, 4.1, materials.wood);
  box(-28.74, 2.3, -15, .06, 1.8, 4, materials.wood);
  for (let i = 0; i < 8; i++) {
    box(-28.64, 2.35, -16.5 + i * .43, .1, .45 + i % 3 * .1, .08, materials.steel);
    box(-27.1, 1.3, -16.5 + i * .38, .35, .16, .16, i % 2 ? materials.rust : materials.steel);
  }
  sign('WORKBENCH', -27, 2.7, -12.9, 2.6, .65, { bg: '#855b32' });
  box(-12, 1, -20.5, 1.3, 2, 2.5, materials.red, true);
  for (let i = 0; i < 6; i++) box(-12.71, .35 + i * .29, -20.5, .02, .02, 2.1, materials.steel);
  for (const x of [-24, -16]) {
    box(x, .09, -14, .12, .015, 13, materials.yellow);
    box(x, 4.5, -15, .2, .12, 8, materials.lamp);
  }
  box(-20, .09, -20.5, 8, .015, .12, materials.yellow);
  const garageLight = new THREE.PointLight(0xffe8c4, 12, 18, 1.4); garageLight.position.set(-20, 4, -14); root.add(garageLight);

  // Workshop details sit against walls and outside the walk-in/driving corridor.
  for (let i = 0; i < 5; i++) {
    box(-28.66, 1.1 + i * .51, -19.5, .14, .045, 3.2, materials.steel);
    for (let j = 0; j < 4; j++) cylinder(-28.25, 1.28 + i * .51, -20.65 + j * .65, .14, .32, i % 2 ? materials.red : materials.cream);
  }
  box(-27.8, .24, -22.2, 1.3, .44, 1.3, materials.wood);
  for (let i = 0; i < 4; i++) box(-27.8, .47, -22.68 + i * .32, 1.4, .08, .24, materials.wood);
  for (const z of [-21.4, -18.5]) {
    box(-11.25, .72, z, .18, 1.4, .15, materials.darkSteel);
    box(-11.38, .12, z, .6, .1, .7, materials.darkSteel);
  }
  const hose = new THREE.Mesh(new THREE.TorusGeometry(.42, .045, 6, 24), materials.rubber);
  hose.position.set(-28.65, 2.5, -10.5); hose.rotation.y = Math.PI / 2; hose.castShadow = true; root.add(hose);
  groundMark('oil', -20.1, .065, -13.2, 3.4, 3.8, .25);
  groundMark('oil', -27, .065, -15.3, 1.5, 2.8, .9);
  groundMark('tracks', -20, .065, -8.6, 3.1, 8);
  for (const [x, z, yaw] of [[-47, -18, 0], [-69, -24, 0], [-62, -2, Math.PI / 2], [-42, -35, Math.PI / 2]]) groundMark('tracks', x, .03, z, 3.8, 19, yaw);
  for (const [x, z] of [[-25.3, 12], [-14.7, 5], [-43, 2], [-68, -8], [-62, 24]]) groundMark('dust', x, .059, z, 9, 7, x * .2);
  // Drain grate and floor expansion joints are paint-thin, so collision remains level.
  box(-20, .064, -5, 8, .002, .4, materials.darkSteel);
  for (let x = -23.8; x < -16; x += .2) box(x, .067, -5, .055, .003, .37, materials.steel);
  for (const x of [-25, -15]) box(x, .062, -15, .018, .002, 17, materials.dirt);
  box(-20, .062, -17, 17, .002, .018, materials.dirt);

  // Corrugated salvage-yard perimeter. The wide gate aligns with the road graph.
  function fence(ax: number, az: number, bx: number, bz: number) {
    const len = Math.hypot(bx - ax, bz - az), horizontal = az === bz;
    box((ax + bx) / 2, 1.1, (az + bz) / 2, horizontal ? len : .14, 2.2, horizontal ? .14 : len, materials.steel, true);
    for (let t = 0; t <= len; t += 1.1) {
      const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len;
      box(x, 1.12, z, horizontal ? .07 : .2, 2.25, horizontal ? .2 : .07, materials.darkSteel);
    }
    for (let t = 0; t <= len; t += 4) cylinder(ax + (bx - ax) * t / len, 1.25, az + (bz - az) * t / len, .07, 2.5, materials.darkSteel);
  }
  fence(YARD_BOUNDS.minX, YARD_BOUNDS.minZ, YARD_BOUNDS.maxX, YARD_BOUNDS.minZ);
  fence(YARD_BOUNDS.minX, YARD_BOUNDS.minZ, YARD_BOUNDS.minX, YARD_BOUNDS.maxZ);
  fence(YARD_BOUNDS.maxX, YARD_BOUNDS.minZ, YARD_BOUNDS.maxX, YARD_BOUNDS.maxZ);
  fence(YARD_BOUNDS.minX, 30, -27, 30); fence(-13, 30, YARD_BOUNDS.maxX, 30);
  for (const x of [-27, -13]) box(x, 2.8, 30, .25, 5.6, .25, materials.darkSteel, true);
  box(-20, 5.6, 30, 14.6, .24, .3, materials.darkSteel);
  sign('JUNKYARD DRIVERS', -20, 5.1, 30.2, 12.5, 1.4, { sub: 'SECOND CHANCES. FIRST DRIVES.' });
  sign('JUNKYARD DRIVERS', -20, 5.1, 29.8, 12.5, 1.4, { sub: 'SECOND CHANCES. FIRST DRIVES.', yaw: Math.PI });
  postSign('PARTS  ←', -31, 21, 5, { sub: 'ENGINES · WHEELS · PAINT' });
  postSign('GARAGE  ↑', -11, 19, 4.5, { sub: 'YOUR NEXT CHAPTER' });
  postSign('NEW PARTS  ↑', -10, 28, 5.6, { sub: 'WALK THROUGH THE GATE · HOLLOWAY AUTO' , yaw: Math.PI });

  // Three physical racks; one inspect action opens each clearly labeled stock category.
  const rackPositions = [{ id: 'rack-engines', z: 2, name: 'ENGINES', subtitle: 'I4 / V8 / V12' }, { id: 'rack-wheels', z: 8, name: 'WHEELS', subtitle: 'STREET / SPORT' }, { id: 'rack-paint', z: 14, name: 'PAINT', subtitle: 'A FRESH START' }];
  for (const rack of rackPositions) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, .85, 2.2).setTranslation(-37.5, .85, rack.z));
    // Open-front steel frames expose the stock from the aisle; the former solid
    // cabinet mesh covered the same parts the player was trying to inspect.
    for (const x of [-38.6, -36.2]) for (const z of [rack.z - 2.2, rack.z + 2.2]) box(x, 1.25, z, .1, 2.5, .1, materials.darkSteel);
    box(-38.67, 1, rack.z, .06, 1.7, 4.4, materials.darkSteel);
    for (const y of [.2, 1, 1.8]) box(-37.4, y, rack.z, 2.7, .12, 4.6, materials.steel);
    sign(rack.name, -35.98, 2.32, rack.z, 4, .75, { yaw: Math.PI / 2, sub: rack.subtitle });
    if (rack.id === 'rack-engines') {
      for (const [i, family] of (['i4', 'v8', 'v12'] as const).entries()) for (const y of [.26, 1.06]) display(createEngineModel(family, { condition: 'salvage', performance: y > 1 }), -36.8, y, rack.z - 1.4 + i * 1.4, Math.PI / 2, .76);
    } else if (rack.id === 'rack-wheels') {
      for (let i = 0; i < 4; i++) for (const y of [.26, 1.06]) display(createWheelModel(y > 1 ? 'sport' : 'street', { condition: 'salvage' }), -36.6, y, rack.z - 1.4 + i * .93, Math.PI / 2, .9);
    } else {
      const paints = getPartsForSale('yard', 'paint');
      for (const [i, paint] of paints.entries()) for (const y of [.26, 1.06]) display(createPaintCan(paint.color!, paint.name, { condition: 'salvage' }), -36.7, y, rack.z - 1.5 + i * 3 / Math.max(1, paints.length - 1), Math.PI / 2);
    }
  }

  // A discoverable pocket behind weathered sheet-metal scrap, west of the workshop.
  for (let i = 0; i < 3; i++) {
    const x = -39 + i * 3.5;
    box(x, .5, -10.2, 3.3, 1, 3.1, i % 2 ? materials.rustLight : materials.rust, true, .08 * (i - 1));
    box(x + .25, 1.35, -10.4, 2.8, .7, 2.6, materials.rust, true, -.15);
    for (let j = 0; j < 4; j++) box(x - 1 + j * .65, 1.75, -10.4, .45, .15, 2.3, materials.darkSteel, false, .1);
  }
  for (let i = 0; i < 7; i++) {
    const z = -28 + i * 2.4;
    box(-43, .4, z, 1.3, .8, 1.8, i % 2 ? materials.rust : materials.steel, true, (rng() - .5) * .3);
    instance(tireGeo, materials.rubber, -42.9, 1.02, z, 1, 1, 1, Math.PI / 2);
  }
  sign('SALVAGE / ROW 03', -40, 2.5, -29.8, 3.6, .7, { bg: '#604c3c' });
  for (const [x, z] of [[-10, 24], [-10, -29], [-42, 24], [-32, -28]]) {
    cylinder(x, .5, z, .48, 1, materials.rust, true);
    cylinder(x, 1.02, z, .49, .04, materials.darkSteel);
  }
  // Ground variation uses small original geometry rather than downloaded textures.
  for (let i = 0; i < 85; i++) {
    const x = -43 + rng() * 34, z = -30 + rng() * 58;
    if (x > -29 && x < -11 && z < -6) continue;
    if (Math.abs(x + 20) < 5.2) continue;
    box(x, .035, z, .2 + rng() * .5, .025, .12 + rng() * .4, i % 3 ? materials.gravel : materials.rustLight, false, rng() * Math.PI);
  }

  // Small weeds take root along the perimeter and under storage, away from paths.
  const bladeGeo = new THREE.ConeGeometry(.055, 1, 3);
  for (let i = 0; i < 190; i++) {
    const side = i % 3;
    const x = side === 0 ? YARD_BOUNDS.minX + .45 + rng() * .45 : side === 1 ? YARD_BOUNDS.maxX - .65 + rng() * .3 : YARD_BOUNDS.minX + 2 + rng() * 76;
    const z = side === 2 ? YARD_BOUNDS.minZ + .6 + rng() * .45 : YARD_BOUNDS.minZ + 2 + rng() * 79;
    for (let blade = 0; blade < 3; blade++) {
      const height = .14 + rng() * .26;
      instance(bladeGeo, blade % 2 ? materials.green : materials.leafLight, x + rng() * .16, height / 2, z + rng() * .16, 1, height, 1, .2 * (rng() - .5), rng() * 6, .3 * (rng() - .5));
    }
  }
  // Salvage has recognizable ribbed panels, rims and lengths of old pipe.
  for (let i = 0; i < 9; i++) {
    const x = -39 + i % 3 * 3.5, z = -10.2 + Math.floor(i / 3) * .38;
    box(x, 1.86 + (i % 2) * .13, z, 2.65, .05, .6, i % 2 ? materials.rustLight : materials.steel, false, .18 * Math.sin(i));
  }
  for (const [x, z] of [[-42, 20], [-10, -26]]) {
    for (let i = 0; i < 3; i++) instance(cylGeo, materials.rust, x + i * .23, .14, z, .1, 2.8, .1, Math.PI / 2, .2);
    for (let i = 0; i < 3; i++) instance(tireGeo, materials.rubber, x, .12 + i * .24, z + 2.3, 1.2, 1.2, 1.2, Math.PI / 2);
  }

  // The back lot reads as sorted salvage: bent body panels, tangled chassis rails,
  // tires, drums and bundled pipe rather than identical solid scrap cubes.
  const crushedGeo = new THREE.IcosahedronGeometry(1, 0);
  const crushedPosition = crushedGeo.attributes.position;
  for (let i = 0; i < crushedPosition.count; i++) {
    const x = crushedPosition.getX(i), y = crushedPosition.getY(i), z = crushedPosition.getZ(i);
    crushedPosition.setXYZ(i, x * (1 + .22 * Math.sin(y * 12 + z * 9)), y * (1 + .18 * Math.sin(z * 15 + x * 8)), z);
  }
  crushedGeo.computeVertexNormals();
  const sheetGeo = new THREE.PlaneGeometry(1, 1, 3, 2);
  sheetGeo.rotateX(-Math.PI / 2);
  const sheetPosition = sheetGeo.attributes.position;
  for (let i = 0; i < sheetPosition.count; i++) sheetPosition.setY(i, .1 * Math.sin(sheetPosition.getX(i) * 8) + .07 * Math.cos(sheetPosition.getZ(i) * 11));
  sheetGeo.computeVertexNormals();
  const scrapColors = [materials.rust, materials.rustLight, materials.steel, materials.darkSteel, materials.blue];
  const sheetColors = scrapColors.map(material => { const sheet = material.clone(); sheet.side = THREE.DoubleSide; return sheet; });
  function scrapHeap(x: number, z: number, width: number, depth: number, height: number, count = 24) {
    // A tapered convex proxy matches the solid core; scattered edges stay outside
    // all walking lanes so an invisible box never closes an aisle.
    const points: number[] = [];
    for (const [y, scale] of [[.03, .46], [height * .57, .32]]) {
      for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; points.push(Math.cos(angle) * width * scale, y, Math.sin(angle) * depth * scale); }
    }
    points.push(0, height, 0);
    const collider = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (collider) world.createCollider(collider.setTranslation(x, 0, z).setFriction(.9));
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2, spread = Math.sqrt(rng()) * .43;
      const px = x + Math.cos(angle) * width * spread, pz = z + Math.sin(angle) * depth * spread;
      const mound = Math.max(.15, 1 - spread * 1.95), y = .25 + height * mound * rng();
      instance(crushedGeo, scrapColors[i % 4], px, y, pz, .6 + rng() * .7, .2 + rng() * .5, .45 + rng() * .75, rng() * .4, rng() * 6, rng() * .4);
      instance(sheetGeo, sheetColors[i % sheetColors.length], px, y + .5, pz, 1.4 + rng() * 1.6, 1, .8 + rng() * 1.2, (rng() - .5) * .7, rng() * 6, (rng() - .5) * .5);
      if (i % 3 === 0) {
        const a = new THREE.Vector3(px - .8, y + .35, pz - .5), b = new THREE.Vector3(px + 1.1, y + .65, pz + .4);
        beam(a, b, .055, materials.darkSteel);
      }
    }
    for (let i = 0; i < 7; i++) instance(tireGeo, i % 3 ? materials.rubber : materials.steel, x + (rng() - .5) * width * .7, .4 + rng() * height * .5, z + (rng() - .5) * depth * .7, 1.2, 1.2, 1.2, rng() * 3, rng() * 3, rng() * 3);
  }
  for (const [x, z, width, depth, height] of [
    [-77, 17, 11, 14, 3.2], [-57, 17, 11, 12, 2.9],
    [-78, -17, 10, 13, 3.5], [-57, -17, 11, 12, 3.1],
    [-78, -44, 9, 10, 2.8], [-57, -44, 11, 9, 3.4],
    [-35, -44, 12, 9, 2.7], [-17, -44, 11, 10, 3.1],
  ]) scrapHeap(x, z, width, depth, height);

  // Open, buckled vehicle frames add a recognizable scale among the metal heaps.
  function strippedFrame(x: number, z: number, yaw: number, paint: THREE.Material) {
    const local = (dx: number, dy: number, dz: number, w: number, h: number, d: number, material: THREE.Material, extraYaw = 0) => {
      box(x + dx * Math.cos(yaw) + dz * Math.sin(yaw), dy, z - dx * Math.sin(yaw) + dz * Math.cos(yaw), w, h, d, material, false, yaw + extraYaw);
    };
    const collider = RAPIER.ColliderDesc.cuboid(1.05, .65, 2.3).setTranslation(x, .65, z).setRotation(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
    world.createCollider(collider);
    for (const side of [-1, 1]) {
      local(side * .82, .46, 0, .18, .2, 4.5, materials.darkSteel);
      local(side * .98, .8, 0, .08, .65, 3.7, paint);
      for (const dz of [-.9, .9]) local(side * .85, 1.35, dz, .09, .65, .1, materials.rust);
    }
    local(0, .55, 0, 1.6, .08, 3.8, materials.rust);
    local(0, 1.7, -.1, 1.8, .09, 2.2, paint, .06);
    local(0, .9, 1.75, 1.9, .14, 1.1, paint, -.07);
    for (const dz of [-1.5, 1.5]) local(0, .42, dz, 2.2, .1, .12, materials.steel);
    local(0, .85, -2.1, 1.95, .4, .12, materials.rust);
    for (const side of [-1, 1]) for (const dz of [-1.5, 1.5]) {
      const px = x + side * 1.01 * Math.cos(yaw) + dz * Math.sin(yaw), pz = z - side * 1.01 * Math.sin(yaw) + dz * Math.cos(yaw);
      instance(tireGeo, materials.rubber, px, .42, pz, 1, 1, 1, .1, Math.PI / 2 + yaw, .05);
    }
  }
  strippedFrame(-59, 5.8, -.14, materials.blue);
  strippedFrame(-76, 4.8, .13, materials.rustLight);
  strippedFrame(-56, -28, -.2, materials.red);
  strippedFrame(-35, -28.5, .15, materials.rust);

  // Sorted recycling bins retain visibly open tops and piles sitting inside them.
  for (const [x, z, paint] of [[-83, -3, materials.green], [-61, -7.8, materials.blue]] as const) {
    box(x, .15, z, 3.3, .3, 4.8, paint, true);
    for (const side of [-1, 1]) {
      box(x + side * 1.6, .85, z, .12, 1.4, 4.8, paint, true);
      box(x, .85, z + side * 2.35, 3.2, 1.4, .12, paint, true);
    }
    for (let i = 0; i < 8; i++) instance(sheetGeo, sheetColors[i % 3], x + (rng() - .5) * 2.1, 1 + rng() * .5, z + (rng() - .5) * 3.2, 1.3, 1, .9, rng() * .4, rng() * 6, rng() * .2);
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5 - row; col++) instance(cylGeo, materials.rust, -81 + col * .46 + row * .23, .25 + row * .4, -30, .2, 5.8, .2, Math.PI / 2);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.2, .6, 2.9).setTranslation(-80, .6, -30));
  // Narrow retaining rails hold the pipe bundle at its edges.
  for (const z of [-32.6, -27.4]) box(-80, .25, z, 3.4, .5, .16, materials.rust);
  postSign('SALVAGE AISLES', -46, 22, 6.5, { sub: 'BODY PANELS · SCRAP METAL · DONOR CARS' });
  postSign('ROW 04', -51.3, -31, 3.1, { sub: 'SORTED METAL' });
  for (let i = 0; i < 130; i++) {
    const x = YARD_BOUNDS.minX + 1 + rng() * 79, z = YARD_BOUNDS.minZ + .8 + rng() * 81;
    if (Math.abs(x + 20) < 6 || (x > -41 && z > -31 && z < 23)) continue;
    instance(crushedGeo, i % 4 ? materials.gravel : materials.rust, x, .05, z, .05 + rng() * .16, .025 + rng() * .05, .05 + rng() * .15, 0, rng() * 6);
  }

  // Holloway Auto Parts: a nearby walk-in destination with a clear threshold,
  // stocked shelves and a physical sales counter. The center aisle stays open.
  const store = AUTO_PARTS_STORE;
  box(store.x, .02, store.z, store.w, .08, store.d, materials.concrete, true);
  box(store.x, .02, 29, 26, .08, 10, materials.concrete, true);
  box(-3, .02, 34, 30, .08, 3.4, materials.concrete, true);
  box(store.x, 2.3, 4, 22, 4.6, .3, materials.cream, true);
  for (const x of [1, 23]) box(x, 2.3, 14, .3, 4.6, 20, materials.cream, true);
  // Front glazing flanks a four-meter door opening. No collider crosses the door.
  for (const x of [5.5, 18.5]) {
    box(x, .55, 24, 9, 1.1, .3, materials.storeBlue, true);
    box(x, 2.2, 24, 9, 2.2, .12, materials.glass, true);
    for (const dx of [-4.4, 0, 4.4]) box(x + dx, 2.2, 24.08, .09, 2.2, .12, materials.cream);
  }
  box(12, 4.03, 24, 22, 1.14, .3, materials.storeBlue, true);
  box(12, 4.73, 14, 22.7, .26, 20.7, materials.ceiling, true);
  box(12, 3.48, 25.05, 22.6, .18, 2.3, materials.storeBlue);
  box(12, 4.03, 26.14, 22.6, 1.1, .12, materials.storeBlue);
  sign('HOLLOWAY AUTO PARTS', 12, 4.05, 26.24, 18.5, .98, { bg: '#284d60', sub: 'NEW ENGINES · WHEELS · PAINT' });
  sign('OPEN', 15.2, 2.15, 24.18, 1.45, .6, { bg: '#8c472e' });
  for (const x of [9.8, 14.2]) box(x, 1.75, 24, .12, 3.5, .4, materials.darkSteel, true);
  sign('NEW PARTS  →', -5.2, 2.2, 31, 5.2, .9, { bg: '#284d60', sub: 'HOLLOWAY AUTO · 35 m' });
  for (let x = -13; x < 11; x += 4) {
    box(x, .067, 34, 1.15, .008, .09, materials.white);
    box(x + .35, .068, 34.2, .1, .009, .63, materials.white, false, -.75);
    box(x + .35, .068, 33.8, .1, .009, .63, materials.white, false, .75);
  }
  for (const x of [3, 21]) {
    for (const z of [11.5, 18]) {
      world.createCollider(RAPIER.ColliderDesc.cuboid(1.05, 1.3, 2).setTranslation(x, 1.3, z));
      box(x + (x < 12 ? -1 : 1) * 1.02, 1.3, z, .06, 2.6, 4, materials.darkSteel);
      for (const dx of [-1.02, 1.02]) for (const dz of [-1.95, 1.95]) box(x + dx, 1.3, z + dz, .07, 2.6, .07, materials.darkSteel);
      for (const y of [.3, 1.05, 1.8, 2.5]) box(x, y, z, 2.25, .08, 4.2, materials.steel);
      for (let i = 0; i < 4; i++) for (const y of [.65, 1.4, 2.15]) {
        if (x === 3 && z === 11.5 && y === 2.15) continue; // Open display shelf for the crate V8.
        box(x, y, z - 1.5 + i, 1.8, .55, .8, i % 3 ? materials.cardboard : materials.storeBlue);
        box(x + (x < 12 ? 1 : -1) * .91, y, z - 1.5 + i, .015, .2, .45, materials.white);
      }
    }
  }
  box(12, .58, 8, 8, 1.16, 1.65, materials.storeBlue, true);
  box(12, 1.22, 8, 8.25, .13, 1.9, materials.wood);
  box(14.7, 1.47, 8, .75, .35, .65, materials.darkSteel);
  box(14.7, 1.8, 7.92, .7, .45, .08, materials.glass);
  sign('PARTS COUNTER', 12, 2.75, 4.19, 9.5, .9, { bg: '#284d60', sub: 'I4 · V8 · V12 / STREET · SPORT' });
  for (const x of [6.2, 17.8]) {
    box(x, .2, 6.1, 2.5, .4, 2.4, materials.wood);
    for (const z of [5.3, 6.9]) box(x, .43, z, 2.55, .06, .19, materials.wood);
    display(createEngineModel(x < 12 ? 'i4' : 'v12', { condition: 'new', performance: true }), x, .46, 6.1, .12, 1.15);
    sign(x < 12 ? 'CRATE ENGINES' : 'FACTORY FRESH', x, 2, 6.9, 3, .55, { bg: '#284d60' });
  }
  display(createEngineModel('v8', { condition: 'new' }), 3.2, 1.84, 11.5, Math.PI / 2, .7);
  // Merchandise near the windows makes the new-stock shop recognizable from outside.
  for (const x of [5.7, 18.3]) {
    box(x, .14, 21.8, 3.2, .28, 1.55, materials.storeBlue, true);
    for (let i = 0; i < 3; i++) {
      display(createWheelModel(x < 12 ? 'street' : 'sport', { condition: 'new' }), x - 1 + i, .28, 21.8, x < 12 ? -.2 : .2, 1.18);
    }
  }
  const newPaints = getPartsForSale('store', 'paint');
  for (const [i, paint] of newPaints.entries()) {
    display(createPaintCan(paint.color!, paint.name), 9.5 + i * .65, 1.285, 8, 0, 1.1);
  }
  for (const x of [6.5, 17.5]) box(x, 4.48, 14, .3, .1, 12, materials.lamp);
  const shopLight = new THREE.PointLight(0xe3efff, 10, 23, 1.4); shopLight.position.set(12, 3.2, 14); root.add(shopLight);

  // Town buildings have dimensional storefronts, roof details and separate glazing.
  const names = ['MERCER HARDWARE', 'LAST STOP DINER', 'FOUND & FIXED', 'MILLER GROCERY', 'WILLOW LAUNDRY', 'CORNER COFFEE', 'POST OFFICE', 'THE FOUNDRY'];
  layout.buildings.forEach((b, i) => {
    const wall = surfaceMaterial(b.style % 2 ? 'concrete' : 'brick', b.color, b.style % 2 ? 4 : .9);
    box(b.x, b.h / 2, b.z, b.w, b.h, b.d, wall, true);
    box(b.x, .22, b.z, b.w + .6, .44, b.d + .6, materials.concrete, true);
    if (b.style === 0) {
      const height = Math.min(2.6, b.w * .14);
      instance(roofGeo, roofMaterial, b.x, b.h, b.z, b.w + .7, height, b.d + .7);
      const points = new Float32Array([-(b.w + .7) / 2,0,-(b.d + .7) / 2,(b.w + .7) / 2,0,-(b.d + .7) / 2,0,height,-(b.d + .7) / 2,-(b.w + .7) / 2,0,(b.d + .7) / 2,(b.w + .7) / 2,0,(b.d + .7) / 2,0,height,(b.d + .7) / 2]);
      const roofCollider = RAPIER.ColliderDesc.convexHull(points);
      if (roofCollider) world.createCollider(roofCollider.setTranslation(b.x, b.h, b.z));
      box(b.x, b.h + height, b.z, .16, .1, b.d + .85, materials.steel);
    } else {
      box(b.x, b.h + .18, b.z, b.w + .65, .36, b.d + .65, materials.cream);
      box(b.x, b.h + .4, b.z, b.w - .5, .16, b.d - .5, materials.darkSteel);
      for (const s of [-1, 1]) {
        box(b.x + s * (b.w / 2 - .12), b.h + .61, b.z, .3, .54, b.d, wall);
        box(b.x, b.h + .61, b.z + s * (b.d / 2 - .12), b.w, .54, .3, wall);
        box(b.x, b.h + .91, b.z + s * (b.d / 2 - .12), b.w + .2, .07, .48, materials.cream);
      }
      box(b.x + b.w * .23, b.h + .8, b.z + b.d * .14, 2, .7, 2, materials.steel);
      for (let fin = 0; fin < 7; fin++) box(b.x + b.w * .23 - .86 + fin * .28, b.h + 1.18, b.z + b.d * .14, .08, .04, 1.75, materials.darkSteel);
    }
    box(b.x - b.w * .24, b.h + 1, b.z - b.d * .18, 1.1, 1.5, 1.1, materials.brick);
    box(b.x - b.w * .24, b.h + 1.8, b.z - b.d * .18, 1.35, .16, 1.35, materials.darkSteel);
    for (const side of [-1, 1]) {
      box(b.x + side * (b.w / 2 - .24), b.h / 2, b.z + b.d / 2 + .12, .48, b.h, .22, materials.cream);
      box(b.x + side * (b.w / 2 - .24), b.h / 2, b.z - b.d / 2 - .12, .48, b.h, .22, materials.cream);
      box(b.x, 3.3, b.z + side * (b.d / 2 + .12), b.w, .16, .2, materials.cream);
      // Rainwater fittings and masonry courses break up otherwise blank walls.
      cylinder(b.x + side * (b.w / 2 - .45), b.h / 2, b.z + b.d / 2 + .27, .065, b.h, materials.darkSteel);
      box(b.x + side * (b.w / 2 + .18), b.h - .06, b.z, .2, .18, b.d + .6, materials.steel);
      for (let course = 4.2; course < b.h - 1; course += 3) box(b.x, course, b.z + side * (b.d / 2 + .04), b.w, .1, .09, materials.cream);
    }
    for (let y = 2.2; y < b.h - 1; y += 3) {
      for (let x = b.x - b.w / 2 + 2.2; x < b.x + b.w / 2 - 1; x += 3.4) for (const s of [-1, 1]) {
        box(x, y, b.z + s * (b.d / 2 + .02), 1.55, 1.65, .08, materials.darkSteel);
        box(x, y + .06, b.z + s * (b.d / 2 + .07), 1.3, 1.38, .05, windows[(Math.round(x) + i + 400) % 4]);
        box(x, y -.85, b.z + s * (b.d / 2 + .14), 1.8, .13, .4, materials.cream);
        box(x, y + .06, b.z + s * (b.d / 2 + .105), .045, 1.39, .018, materials.cream);
        box(x, y + .08, b.z + s * (b.d / 2 + .11), 1.31, .04, .018, materials.cream);
      }
      for (let z = b.z - b.d / 2 + 2.2; z < b.z + b.d / 2 - 1; z += 3.4) for (const s of [-1, 1]) {
        box(b.x + s * (b.w / 2 + .04), y, z, .08, 1.65, 1.55, materials.darkSteel);
        box(b.x + s * (b.w / 2 + .09), y + .06, z, .04, 1.38, 1.3, windows[(i + Math.round(z)) % 4]);
        box(b.x + s * (b.w / 2 + .14), y - .85, z, .4, .13, 1.8, materials.cream);
      }
    }
    const southFace = b.z > 44 && b.z < 145;
    const signZ = b.z + (southFace ? -1 : 1) * (b.d / 2 + .15);
    if (i < 12) sign(names[i % names.length], b.x, Math.min(b.h - .8, 4), signZ, Math.min(12, b.w - 1), .9, { bg: i % 2 ? '#405653' : '#754a36', yaw: southFace ? Math.PI : 0 });
    for (const s of [-1, 1]) {
      box(b.x, 1.4, b.z + s * (b.d / 2 + .08), 1.3, 2.8, .12, materials.darkSteel);
      box(b.x, 1.6, b.z + s * (b.d / 2 + .16), .95, 2, .05, materials.glass);
      box(b.x + .38, 1.25, b.z + s * (b.d / 2 + .2), .035, .35, .035, materials.steel);
      if (i < 12) {
        instance(boxGeo, i % 2 ? materials.green : materials.rustLight, b.x, 3.03, b.z + s * (b.d / 2 + .58), 4.3, .1, 1.15, s * .17);
        box(b.x, 2.91, b.z + s * (b.d / 2 + 1.09), 4.3, .25, .05, i % 2 ? materials.green : materials.rustLight);
        for (let stripe = 0; stripe < 9; stripe++) instance(boxGeo, materials.cream, b.x - 2 + stripe * .48, 3.09, b.z + s * (b.d / 2 + .58), .21, .012, 1.14, s * .17);
      }
    }
  });

  for (let i = 0; i < layout.trees.length; i++) {
    const p = layout.trees[i], height = 5.3 + rng() * 3.7, radius = 1.7 + rng();
    cylinder(p.x, height * .27, p.z, .16 + radius * .025, height * .54, materials.wood, true);
    const foliage = leaves.materials;
    // A visible branching framework supports many overlapping, uneven crowns.
    for (let branch = 0; branch < 5; branch++) {
      const angle = branch * Math.PI * .4 + rng() * .4;
      const reach = radius * (.45 + rng() * .3);
      const x = p.x + Math.cos(angle) * reach, z = p.z + Math.sin(angle) * reach;
      const y = height * (.53 + rng() * .16);
      beam(new THREE.Vector3(p.x, height * .34, p.z), new THREE.Vector3(x, y, z), .06 + rng() * .04, materials.wood);
      instance(leafGeo, foliage[(i + branch) % 4], x, y + .5, z, radius * .63, radius * .65, radius * .58, rng() * .7, rng() * 6, rng() * .3);
      instance(leafGeo, foliage[(i + branch + 1) % 4], x + .3 * Math.cos(angle), y + radius * .55, z + .3 * Math.sin(angle), radius * .43, radius * .46, radius * .46, 0, rng() * 6);
    }
    instance(leafGeo, foliage[i % 3], p.x + .15, height * .82, p.z, radius * .6, radius * .66, radius * .62, 0, rng() * 6);
  }
  // Quiet rolling hills sit beyond the barriers, softened by the scene's distance fog.
  // Their footprint never reaches the driving area, so they need no collision proxies.
  const hillGeo = new THREE.SphereGeometry(1, 28, 14);
  const hillMaterial = mat(0x75857b, 1);
  const hills = [
    [-70, -14, -147, 78, 34, 61], [48, -18, -173, 100, 48, 73], [160, -18, -149, 75, 35, 57],
    [-179, -14, 45, 68, 36, 112], [-175, -17, 174, 63, 43, 86],
    [282, -20, 40, 73, 50, 105], [277, -19, 176, 65, 40, 91],
    [-30, -17, 284, 90, 46, 62], [105, -21, 294, 107, 47, 73], [210, -18, 285, 76, 37, 60],
  ];
  const hillInstances = new THREE.InstancedMesh(hillGeo, hillMaterial, hills.length);
  hills.forEach(([x, y, z, sx, sy, sz], i) => {
    temp.position.set(x, y, z); temp.rotation.set(0, 0, 0); temp.scale.set(sx, sy, sz); temp.updateMatrix();
    hillInstances.setMatrixAt(i, temp.matrix);
  });
  hillInstances.computeBoundingSphere(); root.add(hillInstances);

  // Layered crowns and exposed trunks read as a tree line rather than a row of pyramids.
  const pineGeo = new THREE.ConeGeometry(1, 1, 16);
  for (let i = 0; i < 35; i++) {
    const x = -90 + i * 9, z = 215 + rng() * 12;
    const height = 10 + rng() * 5, radius = 2.6 + rng() * 1.2;
    cylinder(x, 2, z, .16, 4, materials.wood);
    for (const [cy, sy, r] of [[.35,.46,1],[.49,.40,.84],[.62,.34,.65],[.73,.28,.48],[.84,.27,.29]]) instance(pineGeo, i % 2 ? materials.green : materials.leafDark, x, height * cy, z, radius * r, height * sy, radius * r, 0, i * .73);
  }

  const { x: tx, z: tz } = layout.landmark;
  for (const dx of [-3.6, 3.6]) for (const dz of [-3.6, 3.6]) box(tx + dx, 9, tz + dz, .45, 18, .45, materials.darkSteel, true);
  for (const y of [4, 9, 14]) {
    box(tx, y, tz - 3.6, 7.5, .25, .25, materials.steel);
    box(tx, y, tz + 3.6, 7.5, .25, .25, materials.steel);
    box(tx - 3.6, y, tz, .25, .25, 7.5, materials.steel);
    box(tx + 3.6, y, tz, .25, .25, 7.5, materials.steel);
    for (const side of [-1, 1]) for (const flip of [-1, 1]) {
      beam(new THREE.Vector3(tx - 3.6 * flip, y - 3.6, tz + side * 3.6), new THREE.Vector3(tx + 3.6 * flip, y, tz + side * 3.6), .055, materials.steel);
      beam(new THREE.Vector3(tx + side * 3.6, y - 3.6, tz - 3.6 * flip), new THREE.Vector3(tx + side * 3.6, y, tz + 3.6 * flip), .055, materials.steel);
    }
  }
  const tankProfile = [[0,14.7],[2.8,14.9],[4.8,15.5],[5.35,16.1],[5.4,16.3],[5.4,21.45],[5.15,21.85],[4.6,22.2],[3,22.65],[0,22.9]].map(([r, y]) => new THREE.Vector2(r, y));
  instance(new THREE.LatheGeometry(tankProfile, 64), materials.tower, tx, 0, tz);
  world.createCollider(RAPIER.ColliderDesc.cylinder(2.75, 5.4).setTranslation(tx, 18.8, tz));
  const ringGeo = new THREE.TorusGeometry(5.43, .055, 6, 64); ringGeo.rotateX(Math.PI / 2);
  for (const y of [16.35, 18.9, 21.4]) instance(ringGeo, materials.steel, tx, y, tz);
  const railGeo = new THREE.TorusGeometry(5.65, .04, 6, 64); railGeo.rotateX(Math.PI / 2);
  for (const y of [16, 16.7]) instance(railGeo, materials.darkSteel, tx, y, tz);
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12;
    cylinder(tx + Math.cos(angle) * 5.65, 16.36, tz + Math.sin(angle) * 5.65, .035, .9, materials.darkSteel);
  }
  cylinder(tx, 23.1, tz, .42, .45, materials.steel);
  const tankLettering = createTankLettering(); tankLettering.position.set(tx, 19.3, tz); root.add(tankLettering);
  for (let y = 0; y < 16; y += .45) box(tx - 3.85, y, tz - 3.7, .75, .06, .12, materials.steel);
  for (const x of [tx - 4.22, tx - 3.48]) box(x, 8, tz - 3.7, .055, 16.8, .07, materials.darkSteel);

  // Street lighting and painted wayfinding follow the exact generated route.
  for (const road of layout.roads.filter(r => !r.id.includes('garage') && !r.id.includes('gate'))) {
    const length = Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
    const horizontal = road.a.z === road.b.z;
    for (let d = 16; d < length - 10; d += 35) {
      const x = THREE.MathUtils.lerp(road.a.x, road.b.x, d / length) + (horizontal ? 0 : 8);
      const z = THREE.MathUtils.lerp(road.a.z, road.b.z, d / length) + (horizontal ? 8 : 0);
      cylinder(x, 3.8, z, .09, 7.6, materials.darkSteel, true);
      box(x, 7.6, z, horizontal ? .16 : 2.6, .16, horizontal ? 2.6 : .16, materials.darkSteel);
      box(x - (horizontal ? 0 : 1.15), 7.52, z - (horizontal ? 1.15 : 0), .45, .16, .7, materials.lamp);
    }
  }
  function arrow(x: number, z: number, yaw: number) {
    const heading = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // Paint the travel lane, clear of the dashed centerline and its junctions.
    x += right.x * 2.4; z += right.z * 2.4;
    box(x, .054, z, .36, .002, 3.4, materials.route, false, yaw);
    for (const side of [-1, 1]) box(x + heading.x * 1.15 + right.x * side * .59, .054, z + heading.z * 1.15 + right.z * side * .59, .3, .002, 1.8, materials.route, false, yaw + side * .75);
  }
  for (let i = 0; i < layout.loop.length - 1; i++) {
    const a = layout.loop[i], b = layout.loop[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    for (let d = 10; d < length - 6; d += 27) arrow(THREE.MathUtils.lerp(a.x, b.x, d / length), THREE.MathUtils.lerp(a.z, b.z, d / length), yaw);
  }
  postSign('TEST LOOP  →', -9, 37, 4.6, { sub: 'FOLLOW THE AMBER ARROWS', yaw: Math.PI });
  postSign('GARAGE  ←', -9, 49, 4, { sub: 'WILLOW CREEK SALVAGE' });
  const corners: Point[] = [layout.loop[2], layout.loop[3], layout.loop[4]];
  const cornerSignYaws = [-Math.PI / 2, Math.PI, Math.PI / 2];
  corners.forEach((p, i) => postSign(`LOOP ${i + 1}/3`, p.x + 8, p.z + 8, 3.4, { sub: 'BACK TO THE GARAGE', yaw: cornerSignYaws[i] }));

  // Matching low barriers bound the playable map without hidden collision walls.
  for (const z of [-65, 211]) box(54, .55, z, 300, 1.1, .6, materials.concrete, true);
  for (const x of [-95, 203]) box(x, .55, 73, .6, 1.1, 276, materials.concrete, true);
  for (const b of batches.values()) {
    const instanced = new THREE.InstancedMesh(b.geometry, b.material, b.matrices.length);
    b.matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
    instanced.instanceMatrix.needsUpdate = true; instanced.castShadow = true; instanced.receiveShadow = true;
    if (b.material.userData.excludeFromAO) instanced.userData.excludeFromAO = true;
    if (b.material.transparent) instanced.castShadow = false;
    if ([materials.route, materials.yellow, materials.white].includes(b.material as THREE.MeshStandardMaterial)) {
      instanced.castShadow = false;
      instanced.userData.excludeFromAO = true;
    }
    instanced.computeBoundingSphere(); root.add(instanced);
  }
  const interactables: WorldInteractable[] = [
    { id: 'workbench', kind: 'workbench', position: new THREE.Vector3(-26.4, 1.2, -15), label: 'the workbench' },
    { id: 'store-counter', kind: 'store', position: new THREE.Vector3(AUTO_PARTS_STORE.counter.x, 1.35, AUTO_PARTS_STORE.counter.z + 1), label: 'Holloway Auto Parts · new parts' },
    ...rackPositions.map(r => ({ id: r.id, kind: 'rack' as const, position: new THREE.Vector3(-35.8, 1.3, r.z), label: `${r.name.toLowerCase()}` })),
  ];
  return { interactables, garagePosition: new THREE.Vector3(-20, .72, -13), spawn: new THREE.Vector3(-20, 1, 26), updateListings: () => {} };
}
