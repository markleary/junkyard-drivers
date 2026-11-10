# Junkyard Drivers

A single-player browser game for desktop and tablets about finding a forgotten car, rebuilding it, and taking its first drive through a small town. Built with TypeScript, Vite, vanilla Three.js/WebGL, and Rapier 3D. Funds are unlimited: the challenge is exploring the yard and assembling a compatible build. Once a car runs there is a timed test loop with medals, twelve lost pieces of motoring history to find around the yard and town, earned paint finishes and stripes, a day that turns to night, and a photo mode.

[Play Junkyard Drivers](https://markleary.github.io/junkyard-drivers/) in a browser, including iPad Safari. Touch controls appear automatically on tablets. Saves belong to each browser and device.

## Play locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. A WebGL 2-capable browser and WebAssembly support are required. Use a keyboard and mouse on desktop, or the on-screen controls on a touch device. Click **Enter the yard** to begin. Desktop play captures the mouse; if capture is unavailable, hold the left mouse button to look. Touch play never requests mouse capture.

No API key, account, backend, or `.env` file is needed to run or build the game. `.env` and `.env.*` are ignored by Git. Never commit credentials or put secrets in `VITE_*` variables, which are public build configuration.

## Controls

| Action | Control |
| --- | --- |
| Walk | WASD or arrow keys |
| Look on foot | Mouse |
| Inspect a shell, browse a rack, use the workbench, enter a car | E near the item while looking toward it |
| Accelerate | W or Up |
| Brake, then reverse | S or Down |
| Steer | A/D or Left/Right |
| Handbrake | Space |
| Recover a stuck or overturned car to the Garage apron | R, or **Recover to Garage** |
| Exit the car | Stop near the Garage and press E |
| Change camera: chase, wide, bonnet | C |
| Look back | Hold B |
| Headlamps: automatic at dusk, on, off | L |
| Horn | Hold H |
| Zoom the map in or out | M |
| Photo mode | P, or **Photo mode** in the pause menu |
| Pause / release mouse | Escape or the pause button |
| Resume | **Resume game** in the pause menu |

### Controller

A standard-layout gamepad works alongside the keyboard with no setup. Left stick walks and steers; right stick looks around on foot. Right trigger accelerates; left trigger brakes, then reverses. A is the handbrake, X interacts or exits, Y recovers the car, RB changes camera, LB looks back, D-pad up cycles the headlamps, D-pad down zooms the map, pressing the left stick sounds the horn, View opens photo mode, Start pauses, and B closes a sheet or leaves photo mode. Knocks and medals rumble where the browser supports it.

### iPad and tablet controls

Touch controls appear automatically on touch-capable devices. Landscape is recommended; portrait is also supported. **Pause → Touch controls** overrides detection, including on a tablet with an attached keyboard. The controls use the same workshop styling as the rest of the interface.

| Action | Touch control |
| --- | --- |
| Walk / run | Drag the left thumbstick; push to its edge to run |
| Look on foot | Drag the scene with a second finger |
| Inspect, browse, open the workbench, or enter a completed car | Tap the contextual action on the right while looking toward the item |
| Steer | Move the left thumbstick sideways; release to center |
| Accelerate | Hold **Accelerate** |
| Brake, then reverse | Hold **Brake / Reverse** |
| Handbrake | Hold **Handbrake** |
| Recover | Tap **Recover to Garage** |
| Exit the car | Stop near the Garage and tap **Exit car** |
| Camera, headlamps, horn | Tap **View**, **Lamps** or **Horn** beside the thumbstick while driving |
| Photo mode | **Pause**, then **Photo mode**. Drag to orbit, pinch to zoom |
| Pause / resume | Tap **Pause**, then **Resume game** |
| Browse and build | Tap buttons; swipe the catalog or build sheet to scroll |

Steering and pedals accept separate fingers, as do walking and camera look. Menus have larger touch targets and account for device safe areas. Opening a panel pauses simulation and clears held inputs. Focus loss, orientation changes, and cancelled gestures release controls; rotating the device pauses play. The pause menu also holds the logbook, photo mode, sound, the marked-loop HUD, graphics quality, the time of day, the map, camera motion, and a confirmed **New game…** reset.

To test from an iPad on the same Wi-Fi network, run `npm run dev` and open Vite's **Network** URL on the iPad; `localhost` on the iPad refers to the iPad itself.

## First restoration

On a tablet, use the contextual action button wherever these steps mention E.

1. Start at the scrapyard entrance. The **PARTS** and **GARAGE** signs identify the two workshop areas.
2. Walk toward the oxidized Hachiro Kestrel coupe and press E. Inspect its price and I4 mount requirement, then buy it. The shell moves to the Garage.
3. Browse the engine rack and buy the **K-1600 stock I4**. Browse the wheel rack and buy **Touring street set A**. Buy **Saffron yellow** from the paint rack.
4. Walk into the physical Garage and press E at the workbench. Select the Kestrel, install its engine and wheel set, and choose the purchased paint. The live car view reflects the build. Missing components are listed, and an incomplete car cannot be driven.
5. Close the panel, approach the finished car in its bay, and press E. Drive out through the gate. Follow the amber road arrows around the town; the route card shows the next checkpoint, a running lap time, and the time to beat. At ordinary town speeds the loop takes roughly a minute.
6. Return to the Garage, brake to a stop, and press E to exit. Use the workbench again to change the build.

The job note in the corner keeps four stamps for the selected car: shell, engine, wheels, and first drive.

## After the first drive

- **Test loop.** Passing the yard gate starts a stopwatch. Each car has bronze, silver and gold times: Kestrel 1:12 / 0:58 / 0:52, Roadmaster 1:11 / 0:57 / 0:52, Sirocco 1:09 / 0:55 / 0:50. Bronze is a tidy lap in a stock build; gold wants the best engine and tires, or better lines than most. Pull back into the yard and out through the gate again for another attempt. Best laps, distance driven and top speed are kept for each car.
- **Lost & found.** Twelve hubcaps, plates and oil cans are hidden around the yard, behind the parts store and across town: seven within a short walk of the workshop, five further out. Each stands in a column of amber light; walk or drive up to it to collect it. Found pieces hang on the workshop wall, and the logbook gives a hint for each one still missing.
- **Finishes and stripes.** Three, six and ten finds unlock metallic, matte and pearl paint. Bronze, silver and gold medals unlock ivory, black and gold twin stripes. Apply them in slot 04 of the build sheet; each car remembers its own.
- **A day that passes.** The yard opens in the late afternoon. The clock runs through dusk, night and morning in about half an hour of play; floodlights, street lamps, shop windows and headlamps come on after dark. The pause menu can hold the time at morning, midday, golden hour, dusk or night instead.
- **Photo mode.** Freezes play and hides the instruments. Orbit and zoom the camera, step the hour earlier or later, choose a filter (natural, postcard, faded print, black and white), and save a PNG.
- **Logbook.** The second page of the pause sheet lists lap records and medals, distance and top speed for each car, all twelve finds, and what has been unlocked.
- **Map and instruments.** A small survey map turns with your heading and marks the next checkpoint. The speedometer pod adds a tachometer strip, the current gear, and a lamp tell-tale.

The Bison Roadmaster uses a V8. Explore behind the scrap row west of the Garage to discover the rare Veloce Sirocco, which uses a V12. Each engine family has stock and performance variants. All wheel sets fit all three cars; three street sets and three sport sets support restoring the full collection.

The salvage yard covers 81 × 83 meters, with open aisles between scrap-metal heaps, stripped donor frames, recycling bins, and bundled pipe. The original shell displays, parts racks, Garage, and rare-car pocket remain accessible.

For factory-new parts, walk out through the yard gate and follow **NEW PARTS →** along the concrete path to **Holloway Auto Parts**. Walk through the open entrance and press **E** at the sales counter. Switch between Engines, Wheels & tires, and Paint to buy from 15 separate listings: six crate engines, six wheel sets, and three reusable colors. The counter shows each mount family, power or grip, and price before purchase. Carry purchases back to the Garage workbench to install them. Store stock is separate from the salvage racks; existing saves and purchases are preserved.

Purchasing a listing twice cannot create duplicate inventory. Each engine or wheel-set instance belongs to at most one car. Installing a replacement returns the previously installed part to available inventory. Paint purchases unlock reusable colors; each car remembers its own applied color. Engine power affects driven-wheel force; tire grip affects Rapier wheel friction and lateral slip.

## Interface

The interface borrows from salvage inventory tags, workshop job cards, and printed parts catalogs: oxidized red enamel, warm paper, typewritten specifications, and condensed trade lettering. Cars have original profile illustrations on their inspection tags. The Garage uses a numbered build sheet and paint-chip samples; Holloway uses a blue parts-counter catalog. The driving HUD combines a speed instrument (needle, tachometer strip, gear) with a route card that carries the lap stopwatch, and a round survey map in the same steel bezel. Medals, finds and unlocks arrive as stamped cards under the header. The logbook is a second page of the pause sheet. Menus hide the surrounding HUD, and ordinary play keeps the center of the scene clear. Menus support Tab/Shift+Tab navigation and native Space/Enter button activation, with focus retained when parts or settings change.

## Saves

Purchases, inventory, installed part IDs, paint, and the generated-town seed autosave to this browser's `localStorage` under `junkyard-drivers-save-v1`. Reloading restores you safely on foot with owned cars accessible at the Garage. Driving position is deliberately not saved. A new game uses the reproducible default seed; malformed or unsupported saves fall back to a fresh game. Browser storage is per origin, so a local development save and a published-site save are separate. The optional touch-controls preference is stored separately under `junkyard-drivers-touch-controls` and does not change the game save format.

Lap records, distance and top speed, finds, each car's finish and stripes, settings, and the time of day are stored under a second key, `junkyard-drivers-progress-v1`. Keeping them apart leaves the purchase and build save exactly as the first release wrote it, so existing collections load unchanged. Damaged fields in that record fall back to defaults one at a time. **New game…** clears both records and keeps your settings.

## Checks and production build

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

`check` runs TypeScript and focused Vitest checks for inventory ownership, compatibility, save validation, vehicle tuning, road connectivity/clearance across multiple seeds, touch-pointer ownership/cancellation, yard and town-lot clearance, the progress record (medals, finishes, stripes, repair of damaged saves), the lap state machine, the gearbox, daylight continuity, find placement, the audio module on a stand-in Web Audio graph, and the baked scenery itself: the whole town is built under Node for five seeds and the check fails if two different-looking surfaces overlap in one plane, which is what makes ground flicker. Browser checks exercise desktop controls, native multi-touch input at tablet sizes, production asset loading, and the features added after the first drive (finds, logbook, finishes, cameras, lamps, photo mode, a timed lap, stripes, night and quality settings). Test output is the source of truth for the current checkout.

`npm run test:browser:ci` runs the three `@deployment` checks: production startup and pause/input clearing, the readable graphics-error screen, and independent touch gestures/cancellation/orientation handling. GitHub's software-rendered runner uses these focused browser checks alongside all 188 unit/physics checks. The full 16-test suite remains `npm run test:browser`; run its real-time restoration and driving playthroughs on a machine with graphics acceleration and against the public URL after deployment. The first full-suite CI attempt reached the job's 20-minute limit, while its startup/menu and touch-lifecycle checks passed. Failed CI browser runs preserve traces and screenshots as workflow artifacts.

Run just the tablet acceptance with `npx playwright test tests/browser/touch.spec.ts`. It uses Chromium's native touch event dispatch, including simultaneous steering and pedals. For a separate Safari-engine smoke on macOS, install WebKit with `npx playwright install webkit`, start the local preview, then run `node scripts/tablet-webkit.mjs`. `VISUAL_BASE_URL` selects another preview address; `PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH` can select an installed WebKit executable. WebKit taps are native, while its movement probe uses synthetic PointerEvents; this is not a substitute for testing on a physical iPad.

Evidence scripts sit beside the tests. Each drives a real browser against `npm run dev -- --port 5173` (or the address in `VISUAL_BASE_URL`) and writes into `artifacts/overhaul-after` unless told otherwise:

| Script | What it records |
| --- | --- |
| `node scripts/visual-review.mjs [--mobile] [--quality low] [--views a,b]` | 39 fixed camera views with frame timing, draw calls, triangles and memory |
| `node scripts/pixel-metrics.mjs <folder>` | Colour entropy, edge density, contrast and dominant-colour share for a folder of captures |
| `node scripts/audio-review.mjs` | Loop seams, engine sweeps, the held horn and footstep slicing, rendered offline; then whether the game decodes and uses the clips |
| `node scripts/lap-calibration.mjs` | Lap times for each car, stock and upgraded, at two paces |
| `node scripts/startup-timing.mjs [url]` | Time to a usable start button and frame rate on the GPU and on software rendering |
| `node scripts/graphics-fallback.mjs` | The software-rendering smoke check |
| `node scripts/flicker-check.mjs [url]` | Surfaces fighting for the same pixels: the share of the frame that flips when the camera moves a few millimetres, with a still-camera baseline |

The review camera, clock and quality hooks these use exist only under `?qa=1`. They observe and frame; they never move the player or change a save. The PNGs that `visual-review.mjs` and `flicker-check.mjs` write are ignored by git because of their size; the JSON beside them is tracked.

To verify the published game without starting a local server:

```sh
PLAYWRIGHT_BASE_URL=https://markleary.github.io/junkyard-drivers/ \
PLAYWRIGHT_ARTIFACT_DIR=artifacts/live-tablet \
npx playwright test tests/browser/touch.spec.ts
```

Keep the trailing slash in the public base URL. Live captures are saved separately from the local acceptance evidence.

To build and preview under a GitHub Pages repository subpath:

```sh
VITE_BASE_PATH=/junkyard-drivers/ npm run build
VITE_BASE_PATH=/junkyard-drivers/ npm run preview
```

Then open the preview URL with `/junkyard-drivers/` appended. Keep the leading and trailing slash when setting `VITE_BASE_PATH`. Vite's default base is `/` for ordinary local development. The browser-test configuration uses a Pages-style subpath to catch root-relative resource errors.

## GitHub Pages setup

The source repository is [markleary/junkyard-drivers](https://github.com/markleary/junkyard-drivers). GitHub Actions publishes its `main` branch at [markleary.github.io/junkyard-drivers](https://markleary.github.io/junkyard-drivers/). The site is public and does not require the computer running the local development server.

To configure another repository or fork:

1. Create or choose a GitHub repository and push these files to its `main` branch. Keep `.env` excluded.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Run **Deploy to GitHub Pages** from Actions, or push to `main`.
4. Open the URL reported by the workflow's deployment environment after it succeeds. A repository site normally uses `https://OWNER.github.io/REPOSITORY/`.

The workflow installs locked dependencies, runs all focused checks and the three Chromium deployment checks, builds `dist` with the repository's base path, uploads the Pages artifact, and deploys it. It runs automatically on `main` pushes and supports manual dispatch. If the repository uses another default branch, update the workflow's `push.branches` entry to that branch. A repository named `OWNER.github.io` uses `/`; other repositories use `/REPOSITORY/`. For custom domains, set the build base to `/` and configure the domain through Pages settings.

The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Code and assets

| Area | Responsibility |
| --- | --- |
| `src/game/catalog.ts` | Fictional shells, mount families, parts, prices, and tuning values |
| `src/game/state.ts` | Pure purchase/build operations and versioned save validation |
| `src/game/progress.ts` | Lap records, medals, finds, finishes and stripes, settings; its own versioned save |
| `src/game/finds.ts` / `src/game/trial.ts` | Where the twelve finds sit for a given town; the timed-lap state machine |
| `src/world/layout.ts` | Seeded road graph, road-safe buildings, lots (fuel station, used-car lot, park), trees, and the test-loop route |
| `src/world/yard.ts` / `src/world/surface.ts` | Yard features with their clear corridors; what is underfoot at a point |
| `src/world/daylight.ts` | Time of day as plain numbers: sun and moon, sky, fog and light colours, the clock |
| `src/render/world.ts` + `src/render/scene/` | Ground and roads, salvage yard, workshop, parts store, town, landscape, and the shared prop kit |
| `src/render/builder.ts` | Bakes static scenery into one mesh per material per map cell, instances repeats, and creates colliders |
| `src/render/cars.ts` / `src/render/wrecks.ts` | The three player cars (finishes, stripes, lamps, opening bonnet, engine bay) and six scenery body styles |
| `src/render/parts.ts` | Shared detailed engine, wheel, and paint-can display models |
| `src/render/lighting.ts` / `src/render/atmosphere.ts` | HDR render pipeline and grading; sky dome, sun and moon light, sun-tinted fog, reflections |
| `src/render/surfaces.ts` / `src/render/materials.ts` | Procedural albedo, normal and roughness maps; flat, glass, and lamp-glow materials |
| `src/render/vegetation.ts` / `src/render/architecture.ts` | Trees, conifers, hedges, grass and ground marks; pitched roofs and tower lettering |
| `src/render/vfx.ts` / `src/render/finds.ts` | Dust, smoke, exhaust, sparks and skid marks; find markers and the trophy wall |
| `src/render/quality.ts` | Quality tiers and the frame-time budget that steps down automatically |
| `src/physics/vehicle.ts` / `src/physics/drivetrain.ts` | Dynamic Rapier chassis with four raycast suspension wheels; gears and engine speed for the dash and sound |
| `src/physics/character.ts` | Grounded walking gravity, curb stepping, and safe position resets |
| `src/audio/` | Bundled recordings with a synthesized stand-in for every one: engines, tires, ambience, tools, horn, footsteps |
| `src/input/gamepad.ts` | Standard-layout controller mapped to the same intents as the keyboard |
| `src/main.ts` | First-person character, driving cameras, interactions, DOM menus, and the game loop |
| `src/ui/templates.ts` | Salvage tags, parts catalogs, build sheets, pause sheet, logbook, banners, and HUD markup |
| `src/ui/minimap.ts` | The survey map, printed once and turned under a fixed arrow |
| `src/ui/touch.ts` | Independent pointer ownership, analog thumbstick, drag-look, pedals, and input cancellation |
| `src/ui/touch-markup.ts` / `src/ui/touch.css` | Tablet controls, safe-area HUD, and touch menu layouts |
| `src/ui/icons.ts` / `src/ui/fonts.css` | Original workshop illustrations and locally bundled interface lettering |

Gameplay state contains IDs and plain data, separate from Three.js objects. The town's roads are generated before lots and scenery. Static scenery is baked into one mesh per material for each 44 m map cell, with colour carried per vertex; repeated props are instanced per cell. Physical road surfaces and every collider derive from the same layout used for rendering. Physics advances at 60 Hz independently of rendering.

Cars use crowned body panels, rolled wheel arches, panel seams, separate glazing, fluted lamp lenses, brake hardware, tire tread, and molded sidewall lettering. The same bodies change from oxidized paint and exposed hubs to a finished build in gloss, metallic, matte or pearl, with optional twin stripes. The bonnet (the rear deck on the mid-engined Sirocco) lifts at the workbench to show the fitted engine. Headlamps, brake lamps and reversing lamps light, and two real beams ride with the car after dark. Fixed detailing is merged within each car assembly while suspension and steering remain animated.

Open salvage racks expose detailed I4, V8, and V12 engines, wheel sets, and labeled paint cans. Factory-new counterparts appear at Holloway Auto Parts. The yard adds stacked shells, freight boxes, scrap heaps, donor cars, a gantry crane with a swinging hook, a baling press, a site office and floodlights, all placed from data that unit checks hold clear of every walking route. The town has shopfronts with awnings and lit windows, houses, street lamps, utility poles and wires, street furniture, a fuel station, a used-car lot and a park with a bandstand; beyond the barriers the ground rises into wooded hills. Fourteen surface kinds (asphalt, concrete, gravel, dirt, grass, brick, plaster, metal, corrugated sheet, rust, wood, roofing, bark, tile) are generated as albedo, normal and roughness maps and projected at one world scale, so nothing tiles visibly or stretches.

Hardware rendering draws the scene into a multisampled half-float buffer, adds ambient occlusion and bloom, then tone maps (ACES), grades and vignettes in a single final pass. A sky dome with drifting cloud, sun, moon and stars sets the key light, a fog that warms toward the sun, the hemisphere fill and a reflection environment that is re-baked as the hour moves. Foliage sways, windows light at night, and dust, tire smoke, exhaust, sparks and skid marks follow the driving.

| Quality | Canvas pixel ratio cap | Antialiasing | Sun shadows | Ambient occlusion | Bloom | Real lamp lights at night |
| --- | --- | --- | --- | --- | --- | --- |
| High (desktop default) | 1.5 | 4x | 4096 | yes | yes | 4 |
| Medium (touch default) | 1.25 | 4x | 2048 | no | yes | 2 |
| Low | 1.0 | none | 1024 | no | no | 0 |
| Compatible (software WebGL) | 0.6 | none | off | no | no | 0 |

**Graphics: Auto** starts at the default for the device and steps down one tier only after a sustained slow stretch; it never steps back up by itself. A detected software renderer always uses the compatible tier, which renders the same world straight to the canvas with no screen passes, no reflection cube, and colour maps only. The DOM interface stays sharp at native density in every tier, and gameplay and saves are identical.

All models, signs and surface textures are original procedural work included in this source. Sound comes from 47 short recordings in `src/audio/samples` (about 1.9 MB), generated for this game from written prompts with the ElevenLabs sound-effects API, then trimmed, levelled, filtered and loop-sealed locally; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). They are fetched from the game's own files after the first click, and a Web Audio synthesizer written for the game covers every sound until they have decoded, or for good if they cannot. The interface bundles Latin WOFF2 files for Barlow Condensed and IBM Plex Mono; body text uses the operating system’s sans-serif stack. Font files are served locally with the game and their Open Font License notices ship with the build. The Rapier compatibility package embeds its physics WASM in the bundled JavaScript, so it makes no runtime CDN or external WASM request. The production site needs only the files in `dist`; no remote model, texture, audio, or API service is contacted at run time. This does not add an offline service worker.

Three.js and Rapier dependency credits and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The static build includes full runtime license text at `THIRD_PARTY_NOTICES.txt`.

## Proof-of-concept scope

This is a compact, single-player desktop and tablet game, with no traffic AI, multiplayer, mechanical damage, or account system. Touch layouts target iPad-sized screens; small phones are not the primary target. The fictional cars are inspired by broad automotive eras and carry original names and badges. ElevenLabs was used once, during development, to generate the bundled recordings; the game itself never calls it, and no key is needed to run or build.

## Verified acceptance: November 10, 2026 (visual and gameplay overhaul)

Everything in this section was measured on the working tree with the commands shown, on an Apple M4 Pro, except the **Deployment** paragraph, which was recorded after the merge. The full evidence report, with the design brief, budgets and a scored before/after comparison, is [artifacts/overhaul-after/report.md](artifacts/overhaul-after/report.md).

**Checks.** `npm run check` passes TypeScript and **179 unit checks**. `npm run test:browser` builds the production site, serves it under `/junkyard-drivers/`, and passes **16 Chromium tests**: the 13 that predate the overhaul, unchanged, and 3 new ones. The original tests still walk the same routes, use the same controls and selectors, and compare the same save format, which is the evidence that the yard layout, colliders, input handling and saves were preserved through a complete rewrite of the renderer, the world and the game loop.

**New features through real input.** The first new test collects three finds on foot, reads them back from the logbook, applies the metallic finish they unlock, and reloads to the same record. The second gets into the car while standing in front of its bonnet, cycles cameras and headlamps, uses photo mode, watches the gearbox change up, drives a full timed lap on the keyboard (61.5 seconds in the final run, bronze), fits the stripes that medal unlocks, then switches to night and medium quality and confirms the lamps come on by themselves. The third runs at tablet size with native touch: one tap per switch step, every instrument and control on screen with none overlapping, 44 px targets, and photo mode from the pause sheet. Captures: [find](artifacts/overhaul-after/play/find-banner.png), [logbook](artifacts/overhaul-after/play/logbook.png), [lap card](artifacts/overhaul-after/play/lap-banner.png), [stripes](artifacts/overhaul-after/play/stripes.png), [photo mode](artifacts/overhaul-after/play/photo-mode.png), [night](artifacts/overhaul-after/play/night-drive.png), [tablet](artifacts/overhaul-after/play/tablet-driving.png).

**Medal times from measured laps.** `node scripts/lap-calibration.mjs` drives each car through real key events at a tidy and a quick pace, in a stock build and with the best engine and tires ([results](artifacts/overhaul-after/lap-calibration.json)):

| Car | Stock, tidy | Stock, quick | Upgraded, quick | Bronze / silver / gold |
| --- | ---: | ---: | ---: | --- |
| Kestrel | 65.4 s | 53.6 s | 50.2 s | 72 / 58 / 52 |
| Roadmaster | 64.9 s | 52.8 s | 50.1 s | 71 / 57 / 52 |
| Sirocco | 62.7 s | 50.7 s | 48.9 s | 69 / 55 / 50 |

The scripted driver follows a fixed line with tight corners, so a person using the whole road can go quicker; gold is set a couple of seconds behind its best lap rather than at a guess.

**Graphics, before and after.** `node scripts/visual-review.mjs` captures 39 fixed views at 1440x900 in the high tier; the measurements are kept beside the report ([after](artifacts/overhaul-after/), [before](artifacts/overhaul-before/), [per-view renderer figures](artifacts/overhaul-after/visual-review.json)). The 72 images themselves (116 MB with the tablet and before sets) are not in the repository: git ignores them, the script regenerates the current ones, and the previous build's pictures of the shared views are in [artifacts/graphics-after/](artifacts/graphics-after/). On the 17 views shared with the previous build:

| Measure | Before | After |
| --- | ---: | ---: |
| Colour entropy (bits) | 4.79 | 6.00 |
| Edge density | 0.186 | 0.303 |
| Dominant colour share | 0.170 | 0.088 |
| Luminance contrast (p95 minus p5) | 173.8 | 143.8 |
| Mean draw calls per frame, all passes | 940 | 702 |
| Mean triangles per frame, all passes | 1,147,000 | 580,000 |

Every view held 60 fps (vsync-limited) with a 95th-percentile frame interval of 16.8 ms and 2.7 to 4.1 ms of main-thread work per frame; draw calls ranged from 398 to 1,382 and triangles from 108,000 to 961,000. After a full look round and a forced collection the JavaScript heap is about 108 MB; sampled without one, as the capture files do, it reads 131 to 188 MB (the previous build's first view read about 50 MB). Fifteen of the views repeated at 1180x820 with touch and a device scale factor of 2 ([tablet measurements](artifacts/overhaul-after/mobile/)) also held 60 fps in the medium tier, on the same Mac. These are emulated tablet viewports: physical iPad performance has not been measured.

**Software rendering.** With Chromium forced onto SwiftShader at 960x600 the game selects the compatible tier and runs with no errors ([probe](artifacts/overhaul-after/software-fallback.json)). Software rendering is CPU-bound and this machine was shared with other work, so the numbers moved: about a dozen runs measured 15 to 24 fps, and one taken under heavy load measured 8. On the production build the **Enter the yard** button is usable 5.9 to 6.2 seconds after navigation in three runs ([startup timing](artifacts/overhaul-after/startup-timing.json)), against 0.9 second on the GPU. The same two probes against the previously published build, loaded from its public address the same day, gave 10.9 fps and 10.0 seconds. Hosted CI runners are slower than this machine; how the first deployment run went is under **Deployment** below.

**Sound.** `node scripts/audio-review.mjs` renders the recorded voices offline in a real browser ([report](artifacts/overhaul-after/audio-review.json)): all 47 clips decode; no loop seam stands out from the clip around it (at most 0.4 dB above the clip's usual change between 40 ms windows, and no sample step at a seam above 1.14 times an ordinary one); across each engine's rev range no level step was larger than 2.7 dB in four runs of the check (the loops start at a random point, so the figure moves by up to a decibel between runs), the note brightens with revs (steadily for the I4 and V12, from mid revs for the V8), and it falls 7 to 10 dB off the throttle; a held horn stays within 0.4 dB and is silent after release; footsteps are cut into 7, 7 and 4 separate footfalls for gravel, hard ground and grass. In the game, the clips are requested from the game's own origin only after the first click, and road, ambience, footstep and horn voices switch from the synthesizer to recordings once they decode. Nobody has auditioned the mix by ear in this session; levels and filtering were set from measurements.

**Build.** `npm run build`: game code 377 kB (135 kB gzip), Three.js 543 kB (141 kB gzip), physics 2.24 MB (835 kB gzip, unchanged), styles 68 kB, and 44 audio files totalling about 1.9 MB that load after the first click (the three smallest clips are inlined in the script). The production build was checked separately: all 47 clips decode there.

**Safari engine.** `node scripts/tablet-webkit.mjs` was re-run against this build with Playwright's WebKit 27.2 ([result](artifacts/tablet/webkit-smoke.json), [capture](artifacts/tablet/webkit-on-foot.png)): it starts, loads the physics WebAssembly, renders in the medium tier, accepts native taps and pointer movement, clears held input on pause, and resizes to portrait, with no JavaScript errors or failed requests. This is WebKit on a Mac, not Safari on an iPad.

**Independent visual review.** A reviewer with no build context scored the complete capture set against a ten-category rubric: the previous build averaged 1.35 out of 3 and this one 2.30, with a list of eight concrete defects. Those were worked on (black sign backs, crushed shadows on the racks, sheet text cut at scroll edges, hidden signs, crude scenery cars, map letters turning with the map, flat night windows, a stale Safari capture) and a second reviewer, also with no context, scored the result 2.35: every category at 2 or above, "met, but only just" against the rubric's premium line of 2.3, with six further defects of which the quick ones were then fixed without another review. The weakest areas by both reviews are the scenery cars, flat-coloured hero surfaces, and effects that barely show in still captures. Scores, findings and what was done about each are in the evidence report.

**Deployment.** Merging to `main` (merge commit `2903341`) ran the [Pages workflow](https://github.com/markleary/junkyard-drivers/actions/runs/42803546161) in 5 minutes 34 seconds with every step passing: the 179 unit checks, the three `@deployment` browser checks on GitHub's software-rendered runner (4 minutes 10 seconds, including that step's own production build), the Pages build and the deploy. Afterwards all 55 files served at the public address matched the local production build byte for byte, which is the build the 16 browser tests ran on. Against the public address, `node scripts/startup-timing.mjs https://markleary.github.io/junkyard-drivers/` measured the **Enter the yard** button usable after 0.9 second on the GPU (60 fps, high tier) and 5.8 seconds on software rendering (19.7 fps, compatible tier), with no page errors, and the published-game check under "Checks and production build" passed 3 of 3 tablet touch tests, including a full lap by touch in 57.0 seconds, with no errors, failed requests or off-origin requests.

**After release: ground that flickered.** A player reported the ground tearing while walking, most clearly where the concrete path crosses the parts store forecourt. The two slabs had their tops at exactly the same height, so which one each pixel showed was decided by rounding and changed as the camera moved. `npm run check` now builds the whole town under Node for five seeds and fails if two different-looking surfaces overlap in one plane ([test](tests/coplanar.test.ts)). It found about two dozen places in the scenery code where they did: the forecourt, the yard lane where it meets the street, pavement slabs that cross at corners, road paint laid over road paint, shop bulkheads behind their door frames, lapped fence sheets and smaller trim. All are fixed where the pieces are placed, with every collider unchanged. `node scripts/flicker-check.mjs` moves the camera 6 mm and counts the pixels that change ([after](artifacts/overhaul-after/flicker/flicker-check.json), [before](artifacts/overhaul-after/flicker/before-fix.json)): in the walking view at the reported spot 3.9% of the frame flipped before the fix and 0.5% after, against 0.3% with the camera still (swaying plants and film grain); looking down on the overlap, 15.0% before and 0.3% after. With the fix, `npm run check` passes 188 unit checks and the full browser suite passes 16 of 16 on the production build.

**Not verified.** A physical iPad or phone; a physical game controller (the mapping is implemented against the standard layout and exercised only by code review); Safari itself.

## Earlier verification: November 8, 2026

The paragraphs below describe the release before the overhaul and are kept as history. Screenshots in `artifacts/graphics-*`, `artifacts/polish-*`, `artifacts/ui-*` and `artifacts/expanded-yard` show the previous look. The top-level captures and those in `artifacts/tablet` are rewritten by every browser test run, so they now show the current build.


The implemented build passed **141 focused checks**, **13 Chromium browser tests** (ten desktop and three tablet), and the separate **WebKit smoke** below. The browser suite builds the production site and serves it at `/junkyard-drivers/`; it checks for JavaScript errors, failed requests, and external runtime requests.

The full game test starts with empty storage and sends keyboard and relative mouse input through the ordinary controls. It walks the yard, buys and restores the Kestrel, applies saffron paint, drives the marked town loop, returns and exits at the Garage, swaps engine and tire instances, discovers and restores the Sirocco, drives and recovers it, and reloads to verify the same purchases, assignments, paint, and road layout. Incomplete builds and incompatible engines are blocked. Separate menu tests cover actual browser mouse movement, pause/resume, focus-loss input clearing, confirmed/cancelled reset, a small desktop window, and a readable WebGL failure screen. The isolated reset and full-inventory layout tests use prepared save fixtures; the restoration and store playthroughs start fresh.

The walking regression repeatedly leaves the asphalt, stops on the yard surface, and returns at ordinary walking speed, then crosses the Garage concrete threshold both ways. A separate fresh-save store playthrough walks through the gate to Holloway Auto Parts, purchases a new crate engine, sport wheels, and cobalt paint, returns to the Garage to install them, drives and recovers the finished car, and reloads the saved build. Unit checks cover grounded movement, curbs and barriers, store inventory ownership, old-save compatibility, and yard/store/approach clearance across multiple seeds.

Screenshots of the expansion: [salvage aisles](artifacts/expanded-yard/salvage-aisles.png), [store exterior](artifacts/auto-parts-exterior.png), [store counter](artifacts/auto-parts-interior.png), and [store-built car](artifacts/store-built-car.png). The expanded yard and store measured approximately 60 FPS at 1440×900 on the same Apple M4 Pro in the [visual performance check](artifacts/expanded-yard/performance.json).

Actual Rapier measurements with identical four-second throttle input:

| Measurement | Stock / street | Upgrade / sport |
| --- | ---: | ---: |
| Kestrel speed after four seconds | 8.49 m/s (30.5 km/h) | 13.71 m/s (49.4 km/h) |
| Residual lateral speed after the same skid test | 5.77 m/s | 2.03 m/s |

The tire comparison starts both cars with the same sideways/forward velocity and simulates 20 fixed steps; sport tires leave about **65% less sideways speed** than street tires in that test.

Captured during the control-driven playthrough: [scrapyard](artifacts/scrapyard.png), [finished Garage car](artifacts/garage.png), [car in town](artifacts/town.png), [rare find](artifacts/rare-find.png), and [return to the Garage](artifacts/returned.png). The final desktop marked-loop run took **60.0 seconds** using the normal driving inputs. The machine-readable result is [browser-acceptance.json](artifacts/browser-acceptance.json).

The interface review captured 15 states, including 800×600 layouts: [admission ticket](artifacts/ui-after/startup.png), [inspection tag](artifacts/ui-after/inspect.png), [parts catalog](artifacts/ui-after/store.png), [Garage build sheet](artifacts/ui-after/garage.png), and [driving instruments](artifacts/ui-after/driving.png). The [visual report](artifacts/ui-after/ui-review.json) recorded no JavaScript errors, failed requests, or external runtime requests. Browser checks also verify keyboard focus retention, native Space/Enter activation, modal Tab navigation, and full-inventory engine, wheel, and paint changes at 800×600. Garage visual fixtures use an isolated prepared collection.

The tablet acceptance uses native Chromium touch input at 1180×820, 820×1180, and 1024×768. Its fresh-save playthrough buys, restores, paints, and drives the Kestrel around the marked loop in **56.9 seconds**, then recovers, reverses, exits, and reloads the same build and town. It records zero keyboard events, mouse-capture requests, JavaScript errors, failed requests, or external runtime requests. Separate checks cover simultaneous walking/look and steering/pedals, actions with another finger held, cancelled gestures, lost capture, pause/focus/orientation clearing, and native build-sheet scrolling with a full inventory. Action taps suppress the browser's extra compatibility click even when opening a panel changes the element underneath the finger.

Tablet evidence: [on foot](artifacts/tablet/on-foot-landscape.png), [Garage](artifacts/tablet/garage-landscape.png), [driving](artifacts/tablet/driving-landscape.png), [portrait build sheet](artifacts/tablet/garage-portrait.png), [1024×768 layout](artifacts/tablet/on-foot-1024.png), and [touch acceptance report](artifacts/tablet/touch-acceptance.json). These are emulated tablet viewports on macOS; physical iPad performance and Safari browser-chrome behavior have not been measured.

The separate [WebKit 27.2 smoke](artifacts/tablet/webkit-smoke.json) also passed under `/junkyard-drivers/`: startup, physics WASM, rendering, native start/pause/resume taps, input clearing, and a settled portrait canvas matching its viewport. It recorded no JavaScript errors or failed requests. Its movement probe uses synthetic PointerEvents; the complete native multi-touch playthrough is the Chromium test above.

On macOS the browser test enables ANGLE Metal so Chromium uses the GPU instead of its much slower software fallback. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium executable; normally `npx playwright install chromium` supplies it. CI uses a smaller viewport for software rendering. The polished game was observed at approximately 60 FPS at 1440×900 on an Apple M4 Pro. The latest [forced SwiftShader probe](artifacts/graphics-after/software-fallback.json) on the same machine measured 11.5 FPS in automatic compatibility mode at a 960×600 viewport and reached on-foot mode without JavaScript errors or failed requests; hardware acceleration is recommended for smooth play. Performance on other machines is not measured.

Repeatable visual comparisons are in [polish-before](artifacts/polish-before/) and [polish-after](artifacts/polish-after/), including the [Garage](artifacts/polish-after/garage-fixture.png), [town](artifacts/polish-after/town-fixture.png), and [rendering measurements](artifacts/polish-after/visual-report.json). Those visual comparisons use an isolated prepared save for consistent camera views; the separate acceptance run above starts fresh.

The second graphics pass uses 17 matching camera fixtures in [graphics-before](artifacts/graphics-before/) and [graphics-after](artifacts/graphics-after/): all three restored cars and close-ups, unrestored shells, salvage racks, store displays, Garage, street, and water tower. Its capture script injected a camera and read-only rendering observations into the temporary test browser response (that script has since been retired in favour of `scripts/visual-review.mjs`). See the [rendering report](artifacts/graphics-after/graphics-review.json) for per-view frame timing, draw calls, triangles, and memory. The added model detail increases geometry and texture memory; batching reduces draw calls. Short 1440×900 captures remained at approximately 60 FPS on the Apple M4 Pro, with 95th-percentile frame intervals of 16.7–16.8ms. These measurements are limited to that machine and those views.

Deployment uses the [Pages workflow](https://github.com/markleary/junkyard-drivers/actions/workflows/pages.yml). Each push to `main` runs the focused checks and browser deployment checks before publishing `dist`; the workflow's deployment environment records the result and public URL. Full restoration and driving acceptance is a separate GPU-backed verification.
