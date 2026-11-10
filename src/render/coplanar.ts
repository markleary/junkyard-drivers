/**
 * Two surfaces drawn in the same plane have the same depth at every pixel, so
 * which one shows is decided by rounding and changes as the camera moves: the
 * ground appears to tear. This finds such pairs in the baked scenery so they
 * can be fixed where they are placed, before anyone sees them flicker.
 */
export type Vec3 = [number, number, number];

export interface Face {
  /** Unit normal, pointing out of the solid. */
  normal: Vec3;
  /** Corners in order around the face, in world space. */
  corners: Vec3[];
  /** Everything that decides what the face looks like. Two faces with the same look can share a plane unseen. */
  look: string;
  /** Polygon offset of the material. A face pulled further toward the viewer always wins, so it never fights. */
  bias: number;
  /** False for decals that only test depth: two of those blend rather than fight. */
  writesDepth: boolean;
  doubleSided: boolean;
  /** Index of the solid this face belongs to, or -1. */
  owner: number;
  /** What it is: material, tint and shape. */
  label: string;
  /** Where it was placed and how big, for the report. */
  place: string;
}

/** A box that light cannot pass through. Faces buried inside one are never seen. */
export interface Solid {
  /** World-to-local transform, column-major. The box is the unit cube centred on the local origin. */
  inverse: number[];
  min: Vec3;
  max: Vec3;
}

export interface Audit { faces: Face[]; solids: Solid[] }

export interface Overlap {
  a: Face;
  b: Face;
  /** Shared area in square metres. */
  area: number;
  /** Distance between the two planes in metres. */
  gap: number;
  /** A point in the shared area that nothing covers. */
  at: Vec3;
}

export interface OverlapOptions {
  /** Planes closer than this count as the same plane. */
  gap?: number;
  /** Ignore shared areas smaller than this, in square metres. */
  minArea?: number;
  /** Shared areas wholly inside one of these are hidden and not reported. */
  solids?: Solid[];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

type Point2 = [number, number];

function signedArea(polygon: Point2[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function cut(a: Point2, b: Point2, sa: number, sb: number): Point2 {
  const t = sa / (sa - sb);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Sutherland-Hodgman: the part of `subject` inside the convex, counter-clockwise `clip`. */
function clipConvex(subject: Point2[], clip: Point2[]): Point2[] {
  let output = subject;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const side = (p: Point2) => ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const current = input[j], previous = input[(j + input.length - 1) % input.length];
      const sc = side(current), sp = side(previous);
      if (sc >= 0) {
        if (sp < 0) output.push(cut(previous, current, sp, sc));
        output.push(current);
      } else if (sp >= 0) output.push(cut(previous, current, sp, sc));
    }
  }
  return output;
}

function inside(point: Vec3, solid: Solid): boolean {
  if (point[0] < solid.min[0] || point[0] > solid.max[0] || point[1] < solid.min[1] || point[1] > solid.max[1] || point[2] < solid.min[2] || point[2] > solid.max[2]) return false;
  const m = solid.inverse;
  const x = m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12];
  const y = m[1] * point[0] + m[5] * point[1] + m[9] * point[2] + m[13];
  const z = m[2] * point[0] + m[6] * point[1] + m[10] * point[2] + m[14];
  return Math.abs(x) < .5 && Math.abs(y) < .5 && Math.abs(z) < .5;
}

interface Prepared {
  face: Face;
  offset: number;
  min: Vec3;
  max: Vec3;
}

function prepare(face: Face, normal: Vec3): Prepared {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const corner of face.corners) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], corner[axis]);
    max[axis] = Math.max(max[axis], corner[axis]);
  }
  return { face, offset: dot(normal, face.corners[0]), min, max };
}

/** A cheap first test: bounding boxes that do not touch along an axis lying near the plane cannot overlap. */
function separated(a: Prepared, b: Prepared, normal: Vec3): boolean {
  for (let axis = 0; axis < 3; axis++) {
    // A face has no extent along its own normal, so that axis says nothing.
    if (Math.abs(normal[axis]) > .5) continue;
    if (a.max[axis] <= b.min[axis] || b.max[axis] <= a.min[axis]) return true;
  }
  return false;
}

/** Faces that share a plane, overlap where they can be seen, look different, and are not separated by a polygon offset. */
export function findCoplanarOverlaps(faces: Face[], options: OverlapOptions = {}): Overlap[] {
  const gap = options.gap ?? .0008, minArea = options.minArea ?? .01, solids = options.solids ?? [];
  // Group by facing direction. A double-sided face can fight on either side.
  const groups = new Map<string, { normal: Vec3; items: Prepared[] }>();
  const add = (face: Face, normal: Vec3) => {
    const key = normal.map(value => Math.round(value * 500)).join(',');
    let group = groups.get(key);
    if (!group) { group = { normal, items: [] }; groups.set(key, group); }
    group.items.push(prepare(face, group.normal));
  };
  for (const face of faces) {
    add(face, face.normal);
    if (face.doubleSided) add(face, [-face.normal[0], -face.normal[1], -face.normal[2]]);
  }

  const found: Overlap[] = [];
  const seen = new Set<string>();
  const index = new Map<Face, number>();
  faces.forEach((face, i) => index.set(face, i));
  for (const { normal, items } of groups.values()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.offset - b.offset);
    // Any two axes perpendicular to the normal give flat coordinates within the plane.
    const helper: Vec3 = Math.abs(normal[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = cross(helper, normal), ul = Math.hypot(...u);
    u[0] /= ul; u[1] /= ul; u[2] /= ul;
    const v = cross(normal, u);
    const flatten = (face: Face): Point2[] => {
      const polygon = face.corners.map(corner => [dot(corner, u), dot(corner, v)] as Point2);
      return signedArea(polygon) < 0 ? polygon.reverse() : polygon;
    };
    const lift = (point: Point2, height: number): Vec3 => [u[0] * point[0] + v[0] * point[1] + normal[0] * height, u[1] * point[0] + v[1] * point[1] + normal[1] * height, u[2] * point[0] + v[2] * point[1] + normal[2] * height];
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length && items[j].offset - a.offset < gap; j++) {
        const b = items[j];
        if (a.face === b.face || a.face.look === b.face.look) continue;
        if (a.face.bias !== b.face.bias) continue;
        if (!a.face.writesDepth && !b.face.writesDepth) continue;
        if (separated(a, b, normal)) continue;
        const shared = clipConvex(flatten(a.face), flatten(b.face));
        const area = shared.length < 3 ? 0 : Math.abs(signedArea(shared));
        if (area < minArea) continue;
        const ia = index.get(a.face)!, ib = index.get(b.face)!;
        const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Look out from the shared area, at its middle and toward each corner. A point is hidden when something
        // solid lies directly on it (a floor covering) or a hand's width in front of it (the underside of a slab
        // resting on the ground). If every point is hidden, the pair cannot be seen and is not reported.
        let cu = 0, cv = 0;
        for (const point of shared) { cu += point[0]; cv += point[1]; }
        cu /= shared.length; cv /= shared.length;
        const probes: Point2[] = [[cu, cv]];
        for (const point of shared) for (const t of [.35, .7, .93]) probes.push([cu + (point[0] - cu) * t, cv + (point[1] - cv) * t]);
        const top = Math.max(a.offset, b.offset);
        const covered = (point: Vec3) => solids.some((solid, k) => k !== a.face.owner && k !== b.face.owner && inside(point, solid));
        const open = probes.find(point => !covered(lift(point, top + .001)) && !covered(lift(point, top + .05)));
        if (!open) continue;
        found.push({ a: a.face, b: b.face, area, gap: b.offset - a.offset, at: lift(open, top) });
      }
    }
  }
  return found.sort((x, y) => y.area - x.area);
}
