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
} as const;

export type IconName = keyof typeof drawings;

export function icon(name: IconName): string {
  return `<svg class="ui-icon icon-${name}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${drawings[name]}</svg>`;
}

/** Small catalog illustrations with three deliberately distinct side profiles. */
export function vehicleStamp(shellId: string): string {
  const body = shellId === 'bison'
    ? '<path d="M13 48 19 35l62-4 24-18h49l27 19 42 6 6 13-4 8h-21m-27 0H66m-27 0H16l-3-11Z"/><path d="m87 31 20-14h19v14H87Zm45-14h20l21 15h-41V17ZM77 35v18m98-18 1 18M18 43h38m132-7h23"/>'
    : shellId === 'veloce'
      ? '<path d="m11 49 31-13 52-5 29-17h37l29 21 31 4 10 14-5 6h-21m-27 0H66m-27 0H15l-4-10Z"/><path d="m102 31 23-13h30l20 15-73-2ZM96 35l-8 18m80-16 12 3-5 10-23 2m-4-15 2 15M22 48l43-9m140-4h17v5M189 35l-1-10h30v13"/>'
      : '<path d="m11 47 11-12 48-4 32-19h53l27 20 39 5 9 14-5 8h-21m-27 0H66m-27 0H15l-4-12Z"/><path d="m80 31 25-15h23v15H80Zm53-15h20l20 16h-40V16ZM74 35v19m97-19 4 19m-89-17h14m88-3h31M16 44h37"/>';
  return `<svg class="vehicle-stamp" viewBox="0 0 240 76" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><path opacity=".4" stroke-dasharray="3 4" d="M5 68h230M6 6v58m228-58v58"/>${body}<circle cx="52" cy="55" r="14"/><circle cx="52" cy="55" r="7"/><circle cx="190" cy="55" r="14"/><circle cx="190" cy="55" r="7"/><path d="M52 45v20m-10-10h20m128-10v20m-10-10h20"/></svg>`;
}
