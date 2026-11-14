# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Junkyard Drivers is a single-player browser game (desktop and tablet): find one of eight car shells in a salvage yard, build it from compatible parts, drive a timed loop through a seeded town, and fulfill customer restoration commissions. TypeScript, Vite, vanilla Three.js and Rapier 3D; no framework, no backend. It deploys as a static site to GitHub Pages from `main`. `README.md` is long and is the detailed reference: controls, a per-file responsibility table ("Code and assets"), quality tiers, and the measured acceptance history.

## Commands

Node 24, npm.

```sh
npm run dev                # Vite dev server (default port 5173)
npm run check              # tsc --noEmit, then all Vitest unit checks (a few seconds)
npm test                   # Vitest only
npx vitest run tests/state.test.ts            # one unit file
npx vitest run tests/state.test.ts -t "name"  # one unit test by name
npm run build              # typecheck + production build into dist/
npm run test:browser       # full Playwright suite (24 tests, minutes, real-time driving)
npm run test:browser:ci    # only the three tests tagged @deployment
npx playwright test tests/browser/menus.spec.ts -g "title text"   # one browser test
```

There is no linter or formatter; `tsc` in strict mode is the only static check.

### Browser tests

- `playwright.config.ts` builds the production site with `VITE_BASE_PATH=/junkyard-drivers/` and serves it with `vite preview` on port 4173, so the tests run against the built game under a Pages-style subpath, not the dev server.
- Outside CI it uses `reuseExistingServer`, which attaches to whatever already answers on 4173, including a stale build or another project's preview. If every test fails waiting for `#begin`, check what is listening there. To be certain, start your own preview on another port and point the suite at it: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port>/junkyard-drivers/ npx playwright test` (keep the trailing slash). Setting `PLAYWRIGHT_BASE_URL` also disables the built-in web server, which is how the published site is tested.
- The full suite needs GPU rendering (the config enables ANGLE Metal on macOS). CI runs on software rendering and only has time for the `@deployment` subset; a new test that drives or walks in real time should not get that tag.
- Tests assert no console errors, no failed requests, and no off-origin requests. Anything the game loads must ship in `dist`.
- Test runs rewrite tracked captures and JSON under `artifacts/` (top level, `artifacts/tablet`, `artifacts/overhaul-after/play` and `artifacts/salvage`), so expect a dirty working tree afterwards.

### Evidence scripts

`scripts/*.mjs` drive a real browser against a running server (`VISUAL_BASE_URL`, default `http://127.0.0.1:5173/`) and write measurements into `artifacts/overhaul-after`. The README table lists what each one records. Large PNG captures are git-ignored; the JSON beside them is tracked.

`scripts/project-car-review.mjs` captures the project-shell row and separate restored Wayfarer, Sprite and Courier fixtures at the Garage, with renderer/error measurements. It accepts `VISUAL_OUTPUT_DIR`; its fixtures seed storage only at startup and its review hooks only change camera, hour and quality. `scripts/lap-calibration.mjs` includes stock/upgraded runs for all eight shells; arguments such as `sprite:fast` or `estate,sprite,courier` filter its runs, and `LAP_OUTPUT` optionally writes the results to JSON.

`scripts/car-quality-review.mjs` compares the Hachiro/Packhorse baseline with the three project cars using identical garage cameras, light and shell-only/restored startup fixtures. It writes JPGs and JSON under `artifacts/car-quality-review`; `VISUAL_OUTPUT_DIR`, `CAR_REVIEW_CARS`, `CAR_REVIEW_DETAILS=0` and `CAR_REVIEW_TIERS=0` control the run. Painted body panels need nondegenerate UVs before batching, which otherwise supplies all-zero coordinates; `tests/cars.test.ts` checks the Courier cargo walls for this regression.

## Architecture

### Layers

The dependency direction is one-way: `game/` and `world/` are plain data and pure functions with no Three.js or DOM imports; `render/`, `physics/`, `audio/`, `ui/` build on them; `src/main.ts` is the only place they meet.

- `src/game/`: catalog, purchase and build operations, progress. Operations such as `purchase`, `install`, `recordLap` take a state and return a new one. State holds IDs and plain data only.
- `src/world/`: the seeded town layout (`generateTown(seed)`), fixed yard features and their keep-clear corridors, ground kind at a point, and time of day as numbers. Roads are generated first; buildings, lots and scenery are placed around them. Rendering, colliders, find placement, the lap route and the minimap all derive from this one layout.
- `src/render/`: turns the layout into meshes and colliders. See "Scenery" below.
- `src/physics/`: Rapier raycast vehicle, drivetrain (gear and rpm, for the dash and sound only), walking character.
- `src/main.ts`: one module of mutable game-loop state: input, mode (`foot` or `drive`), panels, cameras, HUD updates, photo mode, and `boot()`. `frame()` advances physics in fixed 60 Hz steps (`FIXED_DT`) through an accumulator, then does per-frame visual updates. Opening any panel pauses simulation and clears held inputs.
- `src/ui/templates.ts`: every menu is an HTML string rendered from state; `main.ts` handles clicks by `data-action` attributes and re-renders. `ui/touch.ts` owns pointers independently per control.

Keyboard, touch and gamepad are merged into the same intents inside `step()` in `main.ts`; a new control has to be wired for all three there (and in `touch-markup.ts` for a touch button).

While a menu is open, controller D-pad up/down moves focus through enabled buttons, A activates the focused button, and B closes. `ui/focus.ts` owns focus traversal and scrolls the chosen control into view. Menus retain ordinary Tab/Shift+Tab and Enter/Space support.

### Two saves

- `junkyard-drivers-save-v1` (`game/state.ts`): purchases, inventory, installed parts, paint, town seed. Its format is frozen at what the first release wrote; do not add fields to it. Catalog ids are part of that format: a save is rejected whole if it names a listing the build does not know, so never rename or remove one, and expect an older build to start a new game on a save that holds newer parts.
- `junkyard-drivers-progress-v1` (`game/progress.ts`): budget, laps, medals, finds, finishes and stripes, settings, hour, everything the dealer, tuning parts and rare salvage need (`fitted`, `proof`, `sales`, `stash`, `restock`), and customer commissions (`jobs`). New persistent data goes here. Its parser repairs damaged fields one at a time instead of rejecting the record.

Available funds equal the budget minus the catalog cost of current receipts. A purchase only writes the collection save. A dealer sale removes its receipts and updates the budget to reflect the full payout. `VITE_STARTING_FUNDS` sets the opening balance for new games.

Both loaders take an injectable storage object, which is how the unit tests exercise them.

### Tuning parts, rare salvage and the dealer

These three features are built around the frozen save rather than into it:

- A turbocharger, exhaust or nitrous kit is an ordinary catalog part and inventory instance. `install` refuses them; which car one is bolted to is `progress.fitted[carId]`, changed only through `game/upgrades.ts`. `reconcileFitted` drops fittings whose car or instance no longer exists, and `buildTuning` is the one place a build is turned into power, boost, nitrous and exhaust note for physics and audio.
- Rare parts and the two rare shells are ordinary listings with `source: 'hidden'` / `hidden: true`, bought where they lie. Where that is comes from `stashLayout(progress.stash, progress.restock)` in `game/stash.ts`; the hiding places are data in `world/yard.ts` (`PART_SPOTS`, `SHELL_SPOTS`). `tests/stash.test.ts` holds each place clear of the `KEEP_CLEAR` routes and floods the built yard with a walker-sized body to prove every one can be reached, so add or move a place there first and let that test judge it. `seedPlacing` finds a seed that puts a piece in a place, for browser tests.
- `game/dealer.ts` is pure: outlay, lap proof against `MEDAL_TIMES`, offer range, and an offer drawn from a session seed that `main.ts` rolls once per page load. `completeSale` removes the car, its parts and their receipts from the purchase save (so they can be bought again), clears that car's `proof` and `fitted`, logs `sales`, and bumps `restock` for rare pieces so they reappear elsewhere. The offer sheet shows one figure; the range is deliberately not displayed.
- The ordinary Wayfarer, Sprite and Courier project shells stand at `PROJECT_SHELLS` positions in `world/yard.ts`, used by `main.ts`. The yard footprint and physics flood checks protect their access just as they protect rare salvage. A new shell also needs a `BODIES` entry in `render/cars.ts`, a profile in `ui/icons.ts`, progress shell IDs, and medal times measured with `scripts/lap-calibration.mjs`.
- Every ordinary yard rack exposes Engines, Wheels, Paint and Tuning tabs. The yard now includes economy and twin-carb I4s, a utility V8, classic and rally wheels, a small turbo, a touring exhaust and two vintage paints. Nitrous remains exclusive to Holloway. Keep enough independent yard engines and wheels to complete all shells at once, and preserve full-catalog affordability under the $150,000 default; both are unit-tested.

### Customer restoration jobs

`game/job-catalog.ts` holds nine authored customer requests. `game/jobs.ts` is pure: acceptance/cancellation, checklist assessment, exact-build road-test proof, reputation rank and delivery. The board opens from the workbench, pause menu or logbook; it is a DOM panel and pauses simulation like the other sheets. Only one request can be active. Completed request IDs unlock later requests and derive the workshop rank. Releasing a request has no cost and keeps the collection.

- `assessJob` is the single source for the board, objective and handover. Budget means catalog investment in the finished car, including paint and fitted tuning; it is not cash advanced to the player. Engine-power constraints use the engine's rated power before tuning. All requirements appear before acceptance.
- `beginJobLap` snapshots the active job, acceptance revision and build signature at the first checkpoint. `recordJobLap` accepts a completed loop only when the same accepted job and matching qualifying build are still present. It uses actual elapsed time, not rounded display time. Accepting halfway through a lap, releasing and reaccepting, or reusing a prior dealer lap cannot supply proof.
- The signature binds car, engine and wheel instance IDs, fitted tuning, paint, finish and stripes. Call `reconcileJobs` after every collection/build/style change or sale so changing a build and changing it back cannot recover old proof. Call it when loading too. `progress.jobs` holds active ID, completed IDs, proof and revision; malformed fields are repaired individually.
- `completeJob` verifies the checklist again, reuses `completeSale` removal/restock behavior, substitutes the agreed fixed payment, and keeps ordinary dealer-sales totals separate. The customer takes the car and all fitted parts; reusable paint stays owned. Main only permits delivery while stopped in the dealer bay. Keep that location gate in the interaction layer and business rules in `game/jobs.ts`.
- Tests must cover achievable briefs, once-only payouts, save repair, stale/mismatched proof, unlocks, and rare restocking. `tests/cars.test.ts` constructs every catalog model in salvage/restored states without a real DOM, using the shared canvas stand-in.

### Scenery: builder, cells, and the coplanar check

`render/world.ts` runs the scene builders in `render/scene/` (ground, yard, garage, store, town, landscape) against one `WorldBuilder` (`render/builder.ts`). Scenery code never creates meshes directly. It calls `b.box / cylinder / quad / geometry / instance / solidBox ...` (usually through the `Part` and helper functions in `scene/kit.ts`, with colours from the palette `C`), and `builder.build()` bakes everything into one mesh per material per 44 m map cell with colour carried per vertex, instances repeats per cell, and creates the fixed colliders (`collide: true` or the `solid*` calls). Moving things are the exception: they register a callback in `ctx.animated`.

Two different-looking surfaces placed in exactly the same plane z-fight (visible ground flicker). `tests/coplanar.test.ts` builds the whole world under Node for five seeds, using a canvas stand-in (`tests/support/canvas.ts`) and the builder's optional `audit` argument, and fails with a list of every such overlap and its coordinates. When adding or moving scenery, expect this test to catch slabs, paint or trim that share a height. Fix it where the piece is placed (offset one of them, or use an overlay or marking material with polygon offset); keep colliders unchanged. Because of this test, everything reachable from `createWorld` must run without a real DOM or WebGL context.

Yard obstacles are data in `world/yard.ts`, and `tests/yard.test.ts` holds them clear of the `KEEP_CLEAR` walking routes. The browser tests walk and drive fixed coordinates, so moving yard features, the garage, the store, or the loop route can break them.

### Quality tiers

`render/quality.ts` defines `high`, `medium`, `low` and `compatible`. Auto steps down one tier after sustained slow frames and never back up. A detected software renderer always gets `compatible`, which draws straight to the canvas with no post-processing passes; `render/lighting.ts` owns the HDR pipeline for the other tiers. New visual features need to behave in all four.

### Audio

`audio/audio.ts` exposes `GameAudio`. Every sound has two implementations on one Web Audio graph: a recording from `src/audio/samples/*.mp3` (picked up by `import.meta.glob` in `sampled.ts`) and a synthesized stand-in that plays until the clip decodes, or permanently if it cannot. A new sound needs both. Engine recordings come as an idle and a rev loop per family, once for the standard exhaust and once for a modified one (`engine-<family>[-sport]-idle|rev`), all levelled to the same loudness with the rev loops at the same firing pitch per family; what an exhaust adds in level is set in `SampledEngine`. Clips are fetched only after the first click, public methods never throw, and `tests/audio.test.ts` runs the module on a fake Web Audio graph. The mix was set from measurements (`scripts/audio-review.mjs`), not by ear.

### QA hooks

With `?qa=1` in the URL, `main.ts` exposes `window.__JD` (a read-only snapshot: state, position, mode, lap, renderer stats) and `window.__JD_QA` (review camera, hour, quality, ray pick). The browser tests and evidence scripts read `__JD` to observe, but play through real keyboard, mouse and touch events. Keep it that way: the hooks never move the player or change a save.

## Constraints worth knowing

- No runtime network dependency: no CDN, API, remote asset or `.env` value is needed to run or build. Rapier's WASM is embedded by the `-compat` package and fonts are bundled. `VITE_*` variables are public build configuration.
- Asset URLs must work under a subpath (`VITE_BASE_PATH`, e.g. `/junkyard-drivers/`). Import assets from source (as the audio clips and fonts are) or use `%BASE_URL%` in `index.html`; root-relative paths break on Pages.
- `.github/workflows/pages.yml` deploys on every push to `main` after `npm run check` and the `@deployment` browser tests.
- The README states exact counts and measurements (unit checks, browser tests, build sizes). When a change alters one, update the README rather than leaving a stale figure.
- New third-party code or assets need an entry in `THIRD_PARTY_NOTICES.md` and `public/THIRD_PARTY_NOTICES.txt`.
