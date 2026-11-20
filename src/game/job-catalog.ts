import type { ShellId, UpgradeKind } from './catalog';

export interface RestorationJob {
  id: string;
  title: string;
  customer: string;
  brief: string;
  /** Completed commissions needed before this request can be accepted. */
  unlocksAfter: number;
  payout: number;
  maxInvestment: number;
  shells: ShellId[];
  enginePower?: { min?: number; max?: number };
  minGrip?: number;
  requiredUpgrades?: UpgradeKind[];
  forbiddenUpgrades?: UpgradeKind[];
  paintId?: string;
  /** A fresh full loop is always required; some customers also specify a time. */
  maxLap?: number;
}

/** Authored workshop requests: all prices and requirements are agreed before work starts. */
export const JOBS: RestorationJob[] = [
  {
    id: 'first-wheels', title: 'First wheels', customer: 'Mara Ellis', unlocksAfter: 0,
    brief: 'My daughter needs her first car. A modest Kestrel in warm cream, easy to drive and affordable to put together. Keep the tuning parts on the shelf.',
    shells: ['hachiro'], enginePower: { min: 85, max: 130 }, forbiddenUpgrades: ['turbo', 'exhaust', 'nitro'],
    paintId: 'paint-cream', maxInvestment: 3000, payout: 4100,
  },
  {
    id: 'sunday-v8', title: 'Dad’s Sunday V8', customer: 'Leon Ward', unlocksAfter: 0,
    brief: 'Dad drove a burgundy Roadmaster when I was little. I want that unhurried V8 feeling back: a sensible engine, a clean coat of paint and no bolt-on tuning.',
    shells: ['bison'], enginePower: { min: 170, max: 210 }, forbiddenUpgrades: ['turbo', 'exhaust', 'nitro'],
    paintId: 'paint-burgundy', maxInvestment: 5200, payout: 6800,
  },
  {
    id: 'family-estate', title: 'The family wagon', customer: 'Nora & Kit', unlocksAfter: 0,
    brief: 'We found the old holiday photographs. Can you bring us a cream Wayfarer like the one in them? Small engine, simple wheels, ready for another long summer.',
    shells: ['estate'], enginePower: { min: 85, max: 130 }, forbiddenUpgrades: ['turbo', 'exhaust', 'nitro'],
    paintId: 'paint-cream', maxInvestment: 4300, payout: 5700,
  },
  {
    id: 'weekend-sprite', title: 'A little weekend escape', customer: 'Ari Bell', unlocksAfter: 1,
    brief: 'An Alder Sprite for the back roads, please. Enough power to have fun and tires that hold on, without a turbo or a nitrous bottle. Prove it can make a tidy lap.',
    shells: ['sprite'], enginePower: { min: 110, max: 195 }, minGrip: 2.5,
    forbiddenUpgrades: ['turbo', 'nitro'], maxInvestment: 7000, payout: 9100, maxLap: 85,
  },
  {
    id: 'shop-courier', title: 'Back on the rounds', customer: 'Holloway Auto Parts', unlocksAfter: 2,
    brief: 'Our old delivery van deserves another shift. Build a Courier with a stout V8 and sensible tires. We need dependable pulling power, not boost bottles or turbo plumbing.',
    shells: ['courier', 'orchard'], enginePower: { min: 210, max: 290 }, minGrip: 1.65,
    forbiddenUpgrades: ['turbo', 'nitro'], maxInvestment: 8200, payout: 10500,
  },
  {
    id: 'quiet-surprise', title: 'A quiet surprise', customer: 'Jo Mercer', unlocksAfter: 3,
    brief: 'A Kestrel or Wayfarer that looks ordinary and wakes up on boost. Fit a strong I4, a turbo and grippy tires. Keep the standard exhaust and leave out the nitrous.',
    shells: ['hachiro', 'estate'], enginePower: { min: 195 }, minGrip: 2.5,
    requiredUpgrades: ['turbo'], forbiddenUpgrades: ['exhaust', 'nitro'], maxInvestment: 11000, payout: 14200, maxLap: 75,
  },
  {
    id: 'rally-return', title: 'Back to the special stage', customer: 'Willow Creek Motor Club', unlocksAfter: 4,
    brief: 'We are looking for a Wren R for our club display. Find the little rally hatch, give it a lively engine and proper grip, then show us a brisk lap without nitrous.',
    shells: ['wren'], enginePower: { min: 195 }, minGrip: 2.5,
    forbiddenUpgrades: ['nitro'], maxInvestment: 13000, payout: 16800, maxLap: 75,
  },
  {
    id: 'working-classic', title: 'A working classic', customer: 'Orchard Lane Nursery', unlocksAfter: 5,
    brief: 'Our nursery needs a cream Packhorse for the weekend stall. A stronger V8 and a touring exhaust would suit it nicely. Keep it useful: no turbo or nitrous.',
    shells: ['packhorse'], enginePower: { min: 210, max: 290 }, requiredUpgrades: ['exhaust'],
    forbiddenUpgrades: ['turbo', 'nitro'], paintId: 'paint-cream', maxInvestment: 10800, payout: 13900,
  },
  {
    id: 'exotic-encore', title: 'One more encore', customer: 'Celia Voss', unlocksAfter: 6,
    brief: 'The Sirocco was the poster on my workshop wall. Find one, restore it in silver and give its V12 the power and tires it deserves. A convincing test lap will seal the deal.',
    shells: ['veloce'], enginePower: { min: 420 }, minGrip: 3,
    paintId: 'paint-silver', maxInvestment: 37000, payout: 47500, maxLap: 75,
  },
];

export function getJob(id: string): RestorationJob | undefined { return JOBS.find(job => job.id === id); }
