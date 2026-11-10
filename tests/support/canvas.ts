/**
 * A stand-in for the browser canvas, so the scenery builders can run under
 * Node. Painted textures come out blank, which is fine: the tests that use
 * this look at where things are placed, not at what is drawn on them.
 */
function context(canvas: object) {
  const gradient = { addColorStop() { /* nothing to paint */ } };
  const pixels = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(Math.max(1, Math.round(width) * Math.round(height)) * 4) });
  const known: Record<string | symbol, unknown> = {
    canvas,
    getImageData: (_x: number, _y: number, width: number, height: number) => pixels(width, height),
    createImageData: (width: number | { width: number; height: number }, height?: number) => typeof width === 'number' ? pixels(width, height ?? width) : pixels(width.width, width.height),
    measureText: (text: string) => ({ width: String(text).length * 9, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => ({}),
  };
  // Every other drawing call is accepted and ignored; every style assignment is remembered.
  return new Proxy(known, {
    get: (target, key) => key in target ? target[key] : () => undefined,
    set: (target, key, value) => { target[key] = value; return true; },
  });
}

function canvas() {
  const element: Record<string, unknown> = { width: 300, height: 150, style: {}, toDataURL: () => '', addEventListener() { /* never fires */ }, removeEventListener() { /* never fires */ } };
  let drawing: unknown;
  element.getContext = (kind: string) => kind === '2d' ? (drawing ??= context(element)) : null;
  return element;
}

/** Install the stand-in. Returns a function that removes it again. */
export function installCanvasStandIn(): () => void {
  const scope = globalThis as Record<string, unknown>;
  const previous = scope.document;
  scope.document = {
    createElement: (tag: string) => tag === 'canvas' ? canvas() : { style: {} },
    createElementNS: (_namespace: string, tag: string) => tag === 'canvas' ? canvas() : { style: {} },
  };
  return () => { if (previous === undefined) delete scope.document; else scope.document = previous; };
}
