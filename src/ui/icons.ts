/** Original workshop pictograms, drawn for Junkyard Drivers. */
const drawings = {
  engine: '<path d="M7 10h13l4 5h4v11h-7l-4-4H7V10Zm3 0V6h10v4M3 14h4M3 12v8M13 6V3m-3 0h6M28 17h2v7h-2"/><path d="M11 14h8m-8 4h5"/>',
  wheel: '<circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="2.5"/><path d="m16 7 0 6.5m8.6-.3-6.2 2m3 8.1-3.8-5.2m-6.9 5.2 3.8-5.2m-7.1-4.9 6.2 2"/>',
  paint: '<ellipse cx="16" cy="9" rx="10" ry="3"/><path d="M6 9v17c0 4 20 4 20 0V9M9 16h14M9 22h14M10 7V4h12v3"/><path d="M6 12C-1 12 0 25 6 25"/>',
  wrench: '<path d="m24 4-5 5 4 4 5-5c2 6-4 12-10 9L8 28a3 3 0 0 1-4-4l11-10C12 8 18 2 24 4Z"/><circle cx="6.5" cy="25.5" r=".7"/>',
  arrow: '<path d="M4 16h23M19 8l8 8-8 8"/>',
  tag: '<path d="M4 4h12l13 13-12 12L4 16V4Z"/><circle cx="10" cy="10" r="2"/><path d="m15 14 7 7m-10-4 5 5"/>',
  pause: '<path stroke-width="5" d="M11 7v18M21 7v18"/>',
  check: '<path d="m5 17 7 7L27 7"/>',
  close: '<path d="m7 7 18 18M25 7 7 25"/>',
  route: '<path d="M6 26V9h20v17H14V16h5"/><circle cx="6" cy="26" r="3"/><path d="m15 12 4 4-4 4"/>',
  warning: '<path d="M16 3 30 28H2L16 3Z"/><path d="M16 11v8m0 4v1"/>',
  bolt: '<path d="M18 2 6 18h9l-2 12 13-17h-9l1-11Z"/>',
  badge: '<circle cx="16" cy="16" r="14"/><circle cx="16" cy="16" r="5"/><path d="M4 16h7m10 0h7M16 21v7M7 6l5 5m8 0 5-5"/>',
  shop: '<path d="M3 12h26L25 4H7l-4 8Zm2 0v16h22V12M12 28V17h8v11M9 4l-2 8m9-8v8m7-8 2 8"/>',
  camera: '<path d="M4 9h6l2-3h8l2 3h6v17H4V9Z"/><circle cx="16" cy="17" r="5.5"/><path d="M24 12h1"/>',
  lamp: '<path d="M13 8c-5 0-9 3.6-9 8s4 8 9 8h2V8h-2Z"/><path d="M19 9l9-2m-9 7h10m-10 5 9 2m-9 3 7 3"/>',
  horn: '<path d="M4 13h5l9-6v18l-9-6H4v-6Z"/><path d="M22 12c1.5 1 2.4 2.4 2.4 4s-.9 3-2.4 4m3-12c3 2 4.6 4.8 4.6 8s-1.6 6-4.6 8"/>',
  medal: '<path d="M10 3 16 13 22 3M12.6 3l3.4 6 3.4-6"/><circle cx="16" cy="21" r="8"/><path d="m16 16.5 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4 1.4-2.9Z"/>',
  find: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="4"/><path d="M16 4v8m0 8v8M4 16h8m8 0h8M7.5 7.5l5.6 5.6m5.8 5.8 5.6 5.6m0-17-5.6 5.6m-5.8 5.8-5.6 5.6"/>',
  book: '<path d="M5 5h10c1 0 1 1 1 2v20c0-1-1-2-2-2H5V5Zm22 0H17c-1 0-1 1-1 2v20c0-1 1-2 2-2h9V5Z"/><path d="M8 10h5m-5 4h5m6-4h5m-5 4h5"/>',
  clock: '<circle cx="16" cy="16" r="12"/><path d="M16 8v8l5 4"/>',
  map: '<path d="m4 8 8-3 8 3 8-3v19l-8 3-8-3-8 3V8Z"/><path d="M12 5v19m8-16v19"/>',
  gauge: '<path d="M5 22a11 11 0 1 1 22 0"/><path d="m16 22 6-9"/><circle cx="16" cy="22" r="1.6"/>',
  turbo: '<circle cx="13" cy="18" r="9.5"/><circle cx="13" cy="18" r="2.6"/><path d="M13 8.5h16v7h-8"/><path d="M13 15.4V11m2.3 5.3 3.6-2.6m-3.6 5.9 3.6 2.6M13 20.6V25m-2.3-4.7-3.6 2.6m3.6-5.9-3.6-2.6"/>',
  exhaust: '<path d="M2 16h5l3-4h10l3 4v4l-3 4H10l-3-4H2v-4Z"/><path d="M23 15h7v2.5h-7m0 1.5h7V21.5h-7"/><path d="M12 15v6m3.5-6v6M19 15v6"/>',
  nitro: '<path d="M11 29V14c0-3.4 2-5 5-5s5 1.6 5 5v15H11Z"/><path d="M14 9V5.5h4V9M12.5 3.5h7M11 18h10m-10 6h10"/><path d="m25 3 1.2 2.8L29 7l-2.8 1.2L25 11l-1.2-2.8L21 7l2.8-1.2L25 3Z"/>',
  cash: '<path d="M3 8h26v16H3V8Z"/><circle cx="16" cy="16" r="4.5"/><path d="M7 8c0 2.2-1.8 4-4 4m22-4c0 2.2 1.8 4 4 4M7 24c0-2.2-1.8-4-4-4m22 4c0-2.2 1.8-4 4-4"/>',
  rare: '<path d="m16 3 3.7 8.2 8.8 1-6.5 6 1.8 8.8L16 22.6 8.2 27l1.8-8.8-6.5-6 8.8-1L16 3Z"/>',
} as const;

export type IconName = keyof typeof drawings;

export function icon(name: IconName): string {
  return `<svg class="ui-icon icon-${name}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${drawings[name]}</svg>`;
}

/** Small catalog illustrations with three deliberately distinct side profiles. */
export function vehicleStamp(shellId: string): string {
  const body = shellId === 'bison'
    ? '<path d="M13 48 19 35l62-4 24-18h49l27 19 42 6 6 13-4 8h-21m-27 0H66m-27 0H16l-3-11Z"/><path d="m87 31 20-14h19v14H87Zm45-14h20l21 15h-41V17ZM77 35v18m98-18 1 18M18 43h38m132-7h23"/>'
    : shellId === 'wren'
      // Hot hatch: a short nose, a long roof and a tailgate that drops almost straight down.
      ? '<path d="m22 49 6-15 46-5 24-17h70l26 21 20 5 6 12-4 7h-12m-27 0H66m-27 0H26l-4-8Z"/><path d="m78 29 23-14h28v14H78Zm57-14h30l20 16h-50V15ZM72 33v20m118-19 4 19m-58-38v38M26 44h26m-22-10 4-4m150-20h14l3 4"/>'
      : shellId === 'packhorse'
        // Pickup: a tall bonnet, an upright cab, and a long flat bed behind it.
        ? '<path d="M12 49V30l8-3 52-2 8-16h46l6 16h86v22l-4 6h-10m-27 0H66m-27 0H16l-4-5Z"/><path d="m82 25 5-12h17v12H82Zm27-12h13l5 12h-18V13ZM76 27v26m56-28v28m6-24h78M132 38h80M14 38h10m180-13V15"/>'
    : shellId === 'veloce'
      ? '<path d="m11 49 31-13 52-5 29-17h37l29 21 31 4 10 14-5 6h-21m-27 0H66m-27 0H15l-4-10Z"/><path d="m102 31 23-13h30l20 15-73-2ZM96 35l-8 18m80-16 12 3-5 10-23 2m-4-15 2 15M22 48l43-9m140-4h17v5M189 35l-1-10h30v13"/>'
      : '<path d="m11 47 11-12 48-4 32-19h53l27 20 39 5 9 14-5 8h-21m-27 0H66m-27 0H15l-4-12Z"/><path d="m80 31 25-15h23v15H80Zm53-15h20l20 16h-40V16ZM74 35v19m97-19 4 19m-89-17h14m88-3h31M16 44h37"/>';
  return `<svg class="vehicle-stamp" viewBox="0 0 240 76" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><path opacity=".4" stroke-dasharray="3 4" d="M5 68h230M6 6v58m228-58v58"/>${body}<circle cx="52" cy="55" r="14"/><circle cx="52" cy="55" r="7"/><circle cx="190" cy="55" r="14"/><circle cx="190" cy="55" r="7"/><path d="M52 45v20m-10-10h20m128-10v20m-10-10h20"/></svg>`;
}
