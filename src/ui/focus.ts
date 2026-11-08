const actionAttributes = ['data-action', 'data-buy', 'data-category', 'data-select', 'data-install', 'data-paint', 'id'];

function controls(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
    .filter(element => element.getClientRects().length > 0);
}

/** Keep the same control and scroll position when a purchase/build redraws a sheet. */
export function renderOverlay(container: HTMLElement, markup: string, initial = '#panel-title') {
  const active = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : null;
  const attribute = active && actionAttributes.find(name => active.hasAttribute(name));
  const value = attribute ? active!.getAttribute(attribute) : null;
  const oldIndex = active ? controls(container).indexOf(active) : -1;
  const slot = active?.closest<HTMLElement>('[data-slot]')?.dataset.slot;
  const scrollPositions = [container, ...container.querySelectorAll<HTMLElement>('.build-scroll, .inventory')].map(element => element.scrollTop);
  container.innerHTML = markup;
  [container, ...container.querySelectorAll<HTMLElement>('.build-scroll, .inventory')].forEach((element, index) => { element.scrollTop = scrollPositions[index] ?? 0; });
  const match = attribute && value !== null ? container.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]:not(:disabled)`) : null;
  const installedHeading = attribute === 'data-install' && slot ? container.querySelector<HTMLElement>(`[data-slot="${slot}"] h3`) : null;
  const candidates = controls(container);
  const fallback = oldIndex >= 0 ? candidates[Math.min(oldIndex, candidates.length - 1)] : null;
  const target = match ?? installedHeading ?? container.querySelector<HTMLElement>(initial) ?? fallback ?? candidates[0];
  target?.focus({ preventScroll: true });
  installedHeading?.scrollIntoView({ block: 'nearest' });
}

/** Menus use native button activation and scrolling; only Tab needs explicit routing. */
export function containTab(event: KeyboardEvent, container: HTMLElement) {
  if (event.code !== 'Tab') return;
  event.preventDefault();
  const candidates = controls(container);
  if (!candidates.length) return;
  const index = candidates.indexOf(document.activeElement as HTMLElement);
  if (index < 0 && document.activeElement && container.contains(document.activeElement)) {
    // Installed-part headings receive confirmation focus. Continue from that
    // position in the sheet rather than jumping back to its first control.
    const direction = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
    const adjacent = (event.shiftKey ? [...candidates].reverse() : candidates).find(element => document.activeElement!.compareDocumentPosition(element) & direction);
    if (adjacent) { adjacent.focus(); return; }
  }
  const next = index < 0 ? (event.shiftKey ? candidates.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + candidates.length) % candidates.length;
  candidates[next].focus();
}
