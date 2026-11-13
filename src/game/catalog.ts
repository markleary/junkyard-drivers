export type ShellId = 'hachiro' | 'bison' | 'veloce' | 'wren' | 'packhorse';
export type MountFamily = 'I4' | 'V8' | 'V12';
export type PartKind = 'engine' | 'wheels' | 'paint' | 'turbo' | 'exhaust' | 'nitro';
/** Tuning parts bolt on to a car that already has its engine. A car carries at most one of each. */
export type UpgradeKind = 'turbo' | 'exhaust' | 'nitro';
/** Salvage racks, the parts counter, or tucked away somewhere in the yard for whoever goes looking. */
export type PartSource = 'yard' | 'store' | 'hidden';
/** How a shop groups its stock. The three tuning kinds share one page of the catalog. */
export type ShopCategory = 'engine' | 'wheels' | 'paint' | 'tuning';
export type ExhaustNote = 'sport' | 'race';

export interface Shell {
  id: ShellId;
  name: string;
  era: string;
  description: string;
  price: number;
  mount: MountFamily;
  mass: number;
  rare?: boolean;
  /** Not on display: it turns up in one of the yard's hiding places. */
  hidden?: boolean;
}

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  source: PartSource;
  mount?: MountFamily;
  /** Rated horsepower; the vehicle model converts this into driven wheel force. */
  power?: number;
  /** Raycast tire friction multiplier; higher values resist lateral slip. */
  grip?: number;
  color?: string;
  /** Turbocharger: the share of engine power added at full boost. */
  boost?: number;
  /** Turbocharger: seconds for the boost to build once the throttle opens. */
  lag?: number;
  /** Exhaust: the share of engine power it frees up. */
  flow?: number;
  /** Exhaust: how far the sound departs from stock. */
  note?: ExhaustNote;
  /** Nitrous: horsepower added while the button is held. */
  shot?: number;
  /** Nitrous: seconds of boost in a full bottle. */
  burn?: number;
  rare?: boolean;
  price: number;
  description: string;
}

export interface Listing {
  id: string;
  kind: 'shell' | 'part';
  itemId: string;
  price: number;
}

export const SHELLS: Shell[] = [
  { id: 'hachiro', name: 'Hachiro Kestrel', era: '1986 · Japanese sport coupe', mount: 'I4', mass: 1080, price: 1400,
    description: 'A light eighties sport coupe with crisp, angular bodywork. Needs an I4 engine and any wheel set. An easy first restoration.' },
  { id: 'bison', name: 'Bison Roadmaster', era: '1971 · American muscle', mount: 'V8', mass: 1480, price: 2800,
    description: 'A long hood, broad shoulders, and room for a big V8. Needs a V8 engine and any wheel set.' },
  { id: 'veloce', name: 'Veloce Sirocco', era: '1993 · Mid-engine exotic', mount: 'V12', mass: 1260, price: 12500, rare: true,
    description: 'A rare Italian-inspired wedge hidden in the back lot. Needs a V12 engine and any wheel set.' },
  { id: 'wren', name: 'Hachiro Wren R', era: '1984 · Works rally hatchback', mount: 'I4', mass: 940, price: 4600, rare: true, hidden: true,
    description: 'A short, upright hot hatch built to qualify for the rally stages, with spot lamps and a roof spoiler. Hardly any were made. Needs an I4 engine and any wheel set.' },
  { id: 'packhorse', name: 'Dunmore Packhorse', era: '1964 · American half-ton pickup', mount: 'V8', mass: 1640, price: 5400, rare: true, hidden: true,
    description: 'A farm truck with a tall cab, a chrome grille and a long bed under canvas. Heavy, and worth the trouble. Needs a V8 engine and any wheel set.' },
];

// Existing salvage IDs remain stable so saved purchases and installed parts keep working.
const YARD_PARTS: Omit<Part, 'source'>[] = [
  { id: 'i4-stock', name: 'K-1600 stock I4', kind: 'engine', mount: 'I4', power: 110, price: 650, description: 'I4 mount · dependable naturally aspirated starter engine · 110 hp.' },
  { id: 'i4-performance', name: 'K-2000 turbo I4', kind: 'engine', mount: 'I4', power: 195, price: 2200, description: 'I4 mount · turbo upgrade · 195 hp, 77% more power than the stock I4.' },
  { id: 'v8-stock', name: 'Ironblock 350 V8', kind: 'engine', mount: 'V8', power: 170, price: 950, description: 'V8 mount · broad, easy torque · 170 hp.' },
  { id: 'v8-performance', name: 'Ironblock 427 V8', kind: 'engine', mount: 'V8', power: 290, price: 3400, description: 'V8 mount · high-output upgrade · 290 hp, 71% more power than the stock V8.' },
  { id: 'v12-stock', name: 'Sirocco 3.5 V12', kind: 'engine', mount: 'V12', power: 260, price: 4200, description: 'V12 mount · original mid-engine powerplant · 260 hp.' },
  { id: 'v12-performance', name: 'Sirocco Corsa V12', kind: 'engine', mount: 'V12', power: 420, price: 7800, description: 'V12 mount · race-tuned upgrade · 420 hp, 62% more power than the stock V12.' },
  ...[1, 2, 3].map((n): Omit<Part, 'source'> => ({
    id: `street-${n}`, name: `Touring street set ${String.fromCharCode(64 + n)}`, kind: 'wheels', grip: 1.8, price: 480,
    description: 'Universal fit · four wheels and street tires · predictable everyday grip (1.8).',
  })),
  ...[1, 2, 3].map((n): Omit<Part, 'source'> => ({
    id: `sport-${n}`, name: `Apex sport set ${String.fromCharCode(64 + n)}`, kind: 'wheels', grip: 3, price: 1200,
    description: 'Universal fit · four alloy wheels and sport tires · 67% more lateral grip (3.0).',
  })),
  { id: 'paint-saffron', name: 'Saffron yellow', kind: 'paint', color: '#e7ad36', price: 120, description: 'Reusable satin-metallic paint. Bright warm yellow, mixed in the workshop.' },
  { id: 'paint-oxide', name: 'Signal red', kind: 'paint', color: '#bd4432', price: 120, description: 'Reusable satin-metallic paint. A deep, warm red.' },
  { id: 'paint-teal', name: 'Petrol blue', kind: 'paint', color: '#397d87', price: 120, description: 'Reusable satin-metallic paint. Cool blue-green with a polished finish.' },
  { id: 'paint-ivory', name: 'Workshop ivory', kind: 'paint', color: '#e4dfcb', price: 120, description: 'Reusable satin-metallic paint. Warm off-white with a polished finish.' },
];

const STORE_PARTS: Omit<Part, 'source'>[] = [
  { id: 'crate-i4-stock', name: 'K-1800 crate I4', kind: 'engine', mount: 'I4', power: 130, price: 1800, description: 'Factory-new engine · I4 mount · 130 hp. Smooth, naturally aspirated street tune.' },
  { id: 'crate-i4-performance', name: 'K-2200 turbo crate I4', kind: 'engine', mount: 'I4', power: 230, price: 4100, description: 'Factory-new engine · I4 mount · 230 hp. Turbocharged performance tune for stronger acceleration.' },
  { id: 'crate-v8-stock', name: 'Ironblock 360 crate V8', kind: 'engine', mount: 'V8', power: 200, price: 2600, description: 'Factory-new engine · V8 mount · 200 hp. Broad torque for a dependable muscle-car build.' },
  { id: 'crate-v8-performance', name: 'Ironblock 440 crate V8', kind: 'engine', mount: 'V8', power: 320, price: 5900, description: 'Factory-new engine · V8 mount · 320 hp. High-output crate engine for stronger acceleration.' },
  { id: 'crate-v12-stock', name: 'Sirocco 3.8 crate V12', kind: 'engine', mount: 'V12', power: 280, price: 7200, description: 'Factory-new engine · V12 mount · 280 hp. A fresh mid-engine powerplant for the Sirocco.' },
  { id: 'crate-v12-performance', name: 'Sirocco Corsa R crate V12', kind: 'engine', mount: 'V12', power: 440, price: 12400, description: 'Factory-new engine · V12 mount · 440 hp. The store’s most powerful V12 performance package.' },
  ...[1, 2, 3].map((n): Omit<Part, 'source'> => ({
    id: `new-touring-${n}`, name: `Roadline new touring set ${String.fromCharCode(64 + n)}`, kind: 'wheels', grip: 1.8, price: 850,
    description: 'Factory-new · universal fit · four wheels and street tires · predictable everyday grip (1.8).',
  })),
  ...[1, 2, 3].map((n): Omit<Part, 'source'> => ({
    id: `new-sport-${n}`, name: `Roadline new sport set ${String.fromCharCode(64 + n)}`, kind: 'wheels', grip: 3, price: 1650,
    description: 'Factory-new · universal fit · four alloy wheels and sport tires · 67% more lateral grip than touring tires (3.0).',
  })),
  { id: 'paint-cobalt', name: 'Cobalt blue', kind: 'paint', color: '#285eaa', price: 180, description: 'Store-exclusive reusable paint · deep cobalt blue with a polished metallic finish.' },
  { id: 'paint-silver', name: 'Sterling silver', kind: 'paint', color: '#b7c0c5', price: 180, description: 'Store-exclusive reusable paint · cool silver with a polished metallic finish.' },
  { id: 'paint-forest', name: 'Pine green', kind: 'paint', color: '#285b43', price: 180, description: 'Store-exclusive reusable paint · deep forest green with a polished metallic finish.' },
  { id: 'turbo-street', name: 'Whistler T25 turbo kit', kind: 'turbo', boost: .22, lag: .45, price: 2400,
    description: 'Bolt-on turbocharger · fits any engine · up to 22% more power once the boost builds. A small turbine, quick to wake up.' },
  { id: 'turbo-race', name: 'Whistler T40 race turbo', kind: 'turbo', boost: .38, lag: .85, price: 4600,
    description: 'Bolt-on turbocharger · fits any engine · up to 38% more power. A big turbine: wait for it, then hold on.' },
  { id: 'exhaust-sport', name: 'Longtail sport exhaust', kind: 'exhaust', flow: .04, note: 'sport', price: 780,
    description: 'Free-flowing system · fits any car · 4% more power and a deeper, harder voice.' },
  { id: 'exhaust-race', name: 'Longtail straight-through pipes', kind: 'exhaust', flow: .07, note: 'race', price: 1450,
    description: 'No silencers at all · fits any car · 7% more power. Loud, and it spits on the overrun.' },
  { id: 'nitro-75', name: 'Bluebottle 75-shot nitro kit', kind: 'nitro', shot: 75, burn: 4, price: 1900,
    description: 'Nitrous oxide injection · fits any engine · 75 extra horsepower for four seconds while the button is held. The bottle refills between bursts.' },
  { id: 'nitro-150', name: 'Bluebottle 150-shot nitro kit', kind: 'nitro', shot: 150, burn: 3.5, price: 3300,
    description: 'Twin-stage nitrous oxide injection · fits any engine · 150 extra horsepower for three and a half seconds. Use it in a straight line.' },
];

/**
 * Rare salvage. None of it is on a rack or in the catalog: each piece lies in one of the yard's hiding
 * places (see game/stash.ts) and is bought on the spot from its tag. There is no nitrous here: that only comes new.
 */
const HIDDEN_PARTS: Omit<Part, 'source'>[] = [
  { id: 'rare-wheels', name: 'Comet magnesium racing set', kind: 'wheels', grip: 3.6, rare: true, price: 2600,
    description: 'Universal fit · four magnesium wheels on cut racing slicks, off a works car · the most grip in the yard (3.6).' },
  { id: 'rare-turbo', name: 'Whistler T31 rally turbo', kind: 'turbo', boost: .3, lag: .55, rare: true, price: 1700,
    description: 'Works rally turbocharger · fits any engine · up to 30% more power, and it builds boost sooner than its size suggests.' },
  { id: 'rare-exhaust', name: 'Sidewinder side pipes', kind: 'exhaust', flow: .06, note: 'race', rare: true, price: 620,
    description: 'Chromed side pipes off a drag car · fit any car · 6% more power, straight through and very loud.' },
  { id: 'rare-i4', name: 'K-2000 Works twin-cam I4', kind: 'engine', mount: 'I4', power: 245, rare: true, price: 3400,
    description: 'I4 mount · a rally team’s spare engine, still in its crate frame · 245 hp, more than any I4 on a rack or a shelf.' },
  { id: 'rare-v8', name: 'Ironblock 454 Super Stock V8', kind: 'engine', mount: 'V8', power: 345, rare: true, price: 5200,
    description: 'V8 mount · a drag-strip engine pulled from a wreck · 345 hp, more than any V8 on a rack or a shelf.' },
  { id: 'rare-v12', name: 'Sirocco GTC competition V12', kind: 'engine', mount: 'V12', power: 465, rare: true, price: 13900,
    description: 'V12 mount · one of a handful built for endurance racing · 465 hp, more than any V12 on a rack or a shelf.' },
];

export const PARTS: Part[] = [
  ...YARD_PARTS.map((part): Part => ({ ...part, source: 'yard' })),
  ...STORE_PARTS.map((part): Part => ({ ...part, source: 'store' })),
  ...HIDDEN_PARTS.map((part): Part => ({ ...part, source: 'hidden' })),
];

export const UPGRADE_KINDS: UpgradeKind[] = ['turbo', 'exhaust', 'nitro'];
export const isUpgrade = (kind: PartKind): kind is UpgradeKind => kind === 'turbo' || kind === 'exhaust' || kind === 'nitro';
export const SHOP_CATEGORIES: ShopCategory[] = ['engine', 'wheels', 'paint', 'tuning'];
export const categoryOf = (kind: PartKind): ShopCategory => isUpgrade(kind) ? 'tuning' : kind;

/** Physical shops show only their own listings; ownership is still global inventory. */
export function getPartsForSale(source: PartSource, kind?: PartKind): Part[] {
  return PARTS.filter(part => part.source === source && (!kind || part.kind === kind));
}

/** One page of a shop's catalog. */
export function getCategoryStock(source: PartSource, category: ShopCategory): Part[] {
  return PARTS.filter(part => part.source === source && categoryOf(part.kind) === category);
}

export const LISTINGS: Listing[] = [
  ...SHELLS.map((shell): Listing => ({ id: `shell-${shell.id}`, kind: 'shell', itemId: shell.id, price: shell.price })),
  ...PARTS.map((part): Listing => ({ id: `part-${part.id}`, kind: 'part', itemId: part.id, price: part.price })),
];

/** The colour each shell wears as found. None of them matches a paint that can be bought. */
export const DEFAULT_PAINT: Record<ShellId, string> = {
  hachiro: '#83908a', bison: '#8a5c42', veloce: '#8d715d', wren: '#8f8a6e', packhorse: '#6f8478',
};

export function getShell(id: string): Shell {
  const shell = SHELLS.find((item) => item.id === id);
  if (!shell) throw new Error('Unknown car shell.');
  return shell;
}

export function getCatalogPart(id: string): Part {
  const part = PARTS.find((item) => item.id === id);
  if (!part) throw new Error('Unknown part.');
  return part;
}
