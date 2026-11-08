# Junkyard Drivers

A single-player browser game for desktop and tablets about finding a forgotten car, rebuilding it, and taking its first drive through a small town. Built with TypeScript, Vite, vanilla Three.js/WebGL, and Rapier 3D. Funds are unlimited: the challenge is exploring the yard and assembling a compatible build.

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
| Pause / release mouse | Escape or the pause button |
| Resume | **Resume game** in the pause menu |

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
| Pause / resume | Tap **Pause**, then **Resume game** |
| Browse and build | Tap buttons; swipe the catalog or build sheet to scroll |

Steering and pedals accept separate fingers, as do walking and camera look. Menus have larger touch targets and account for device safe areas. Opening a panel pauses simulation and clears held inputs. Focus loss, orientation changes, and cancelled gestures release controls; rotating the device pauses play. The pause menu also controls sound, the marked-loop HUD, and a confirmed **New game…** reset.

To test from an iPad on the same Wi-Fi network, run `npm run dev` and open Vite's **Network** URL on the iPad; `localhost` on the iPad refers to the iPad itself.

## First restoration

On a tablet, use the contextual action button wherever these steps mention E.

1. Start at the scrapyard entrance. The **PARTS** and **GARAGE** signs identify the two workshop areas.
2. Walk toward the oxidized Hachiro Kestrel coupe and press E. Inspect its price and I4 mount requirement, then buy it. The shell moves to the Garage.
3. Browse the engine rack and buy the **K-1600 stock I4**. Browse the wheel rack and buy **Touring street set A**. Buy **Saffron yellow** from the paint rack.
4. Walk into the physical Garage and press E at the workbench. Select the Kestrel, install its engine and wheel set, and choose the purchased paint. The live car view reflects the build. Missing components are listed, and an incomplete car cannot be driven.
5. Close the panel, approach the finished car in its bay, and press E. Drive out through the gate. Follow the amber road arrows around the town; the route HUD tracks the loop and return. At ordinary town speeds the loop takes roughly a minute.
6. Return to the Garage, brake to a stop, and press E to exit. Use the workbench again to change the build.

The Bison Roadmaster uses a V8. Explore behind the scrap row west of the Garage to discover the rare Veloce Sirocco, which uses a V12. Each engine family has stock and performance variants. All wheel sets fit all three cars; three street sets and three sport sets support restoring the full collection.

The salvage yard covers 81 × 83 meters, with open aisles between scrap-metal heaps, stripped donor frames, recycling bins, and bundled pipe. The original shell displays, parts racks, Garage, and rare-car pocket remain accessible.

For factory-new parts, walk out through the yard gate and follow **NEW PARTS →** along the concrete path to **Holloway Auto Parts**. Walk through the open entrance and press **E** at the sales counter. Switch between Engines, Wheels & tires, and Paint to buy from 15 separate listings: six crate engines, six wheel sets, and three reusable colors. The counter shows each mount family, power or grip, and price before purchase. Carry purchases back to the Garage workbench to install them. Store stock is separate from the salvage racks; existing saves and purchases are preserved.

Purchasing a listing twice cannot create duplicate inventory. Each engine or wheel-set instance belongs to at most one car. Installing a replacement returns the previously installed part to available inventory. Paint purchases unlock reusable colors; each car remembers its own applied color. Engine power affects driven-wheel force; tire grip affects Rapier wheel friction and lateral slip.

## Interface

The interface borrows from salvage inventory tags, workshop job cards, and printed parts catalogs: oxidized red enamel, warm paper, typewritten specifications, and condensed trade lettering. Cars have original profile illustrations on their inspection tags. The Garage uses a numbered build sheet and paint-chip samples; Holloway uses a blue parts-counter catalog. The driving HUD combines a speed instrument with a small route card. Menus hide the surrounding HUD, and ordinary play keeps the center of the scene clear. Menus support Tab/Shift+Tab navigation and native Space/Enter button activation, with focus retained when parts or settings change.

## Saves

Purchases, inventory, installed part IDs, paint, and the generated-town seed autosave to this browser's `localStorage` under `junkyard-drivers-save-v1`. Reloading restores you safely on foot with owned cars accessible at the Garage. Driving position is deliberately not saved. A new game uses the reproducible default seed; malformed or unsupported saves fall back to a fresh game. Browser storage is per origin, so a local development save and a published-site save are separate. The optional touch-controls preference is stored separately under `junkyard-drivers-touch-controls` and does not change the game save format.

## Checks and production build

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

`check` runs TypeScript and focused Vitest checks for inventory ownership, compatibility, save validation, vehicle tuning, road connectivity/clearance across multiple seeds, and touch-pointer ownership/cancellation. Browser checks exercise desktop controls, native multi-touch input at tablet sizes, and production asset loading. Test output is the source of truth for the current checkout.

Run just the tablet acceptance with `npx playwright test tests/browser/touch.spec.ts`. It uses Chromium's native touch event dispatch, including simultaneous steering and pedals. For a separate Safari-engine smoke on macOS, install WebKit with `npx playwright install webkit`, start the local preview, then run `node scripts/tablet-webkit.mjs`. `VISUAL_BASE_URL` selects another preview address; `PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH` can select an installed WebKit executable. WebKit taps are native, while its movement probe uses synthetic PointerEvents; this is not a substitute for testing on a physical iPad.

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

The workflow installs locked dependencies, runs checks and Chromium browser tests, builds `dist` with the repository's base path, uploads the Pages artifact, and deploys it. It runs automatically on `main` pushes and supports manual dispatch. If the repository uses another default branch, update the workflow's `push.branches` entry to that branch. A repository named `OWNER.github.io` uses `/`; other repositories use `/REPOSITORY/`. For custom domains, set the build base to `/` and configure the domain through Pages settings.

The workflow follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Code and assets

| Area | Responsibility |
| --- | --- |
| `src/game/catalog.ts` | Fictional shells, mount families, parts, prices, and tuning values |
| `src/game/state.ts` | Pure purchase/build operations and versioned save validation |
| `src/world/layout.ts` | Seeded road graph, road-safe lots/trees, and test-loop route |
| `src/render/world.ts` | Workshop, scrapyard, town, shared geometry/colliders, and signage |
| `src/render/cars.ts` | Original shaped car meshes, restoration materials, glass, lights, and animated wheels |
| `src/render/parts.ts` | Shared detailed engine, wheel, and paint-can display models |
| `src/render/architecture.ts` / `src/render/vegetation.ts` | Window interiors, pitched roofs, curved tower lettering, leaf sprays, and ground marks |
| `src/render/lighting.ts` | Outdoor sky/reflections, sun shadows, contact shading, and software-renderer fallback |
| `src/render/surfaces.ts` | Seamless local albedo, height, and roughness maps projected at a consistent world scale |
| `src/physics/vehicle.ts` | Dynamic Rapier chassis, four raycast suspension wheels, and fixed-step driving |
| `src/physics/character.ts` | Grounded walking gravity, curb stepping, and safe position resets |
| `src/main.ts` | First-person character, chase camera, interactions, DOM menus, and game loop |
| `src/ui/templates.ts` | Salvage tags, parts catalogs, workshop build sheets, menus, and HUD markup |
| `src/ui/touch.ts` | Independent pointer ownership, analog thumbstick, drag-look, pedals, and input cancellation |
| `src/ui/touch-markup.ts` / `src/ui/touch.css` | Tablet controls, safe-area HUD, and touch menu layouts |
| `src/ui/icons.ts` / `src/ui/fonts.css` | Original workshop illustrations and locally bundled interface lettering |
| `src/ui/audio.ts` | Local Web Audio engine and interface synthesis |

Gameplay state contains IDs and plain data, separate from Three.js objects. The town's roads are generated before lots and scenery. Static repeated props share geometry/material batches, and physical road surfaces derive from the same layout used for rendering. Physics advances at 60 Hz independently of rendering.

Cars use crowned body panels, rolled wheel arches, panel seams, separate glazing, fluted lamp lenses, brake hardware, tire tread, and molded sidewall lettering. The same bodies change from oxidized paint and exposed hubs to a finished build. Fixed detailing is merged within each car assembly while suspension and steering remain animated. The outdoor sky and horizon reflections help the curved paint surfaces read in late-afternoon light.

Open salvage racks expose detailed I4, V8, and V12 engines, wheel sets, and labeled paint cans. Factory-new counterparts appear at Holloway Auto Parts. These models share geometry and materials across world instances. Ground and wall materials use separate original albedo, height, and roughness maps; gravel uses scattered small chips instead of a tiled pattern. Leaf-cutout trees, layered distant evergreens, varied windows and rooflines, gutters, ground marks, and a smooth braced water tower add environmental detail. Thin road markings and foliage are excluded from the ambient-occlusion override to avoid artificial halos. Signs have solid backs, and the Garage header sits below the roof edge.

Hardware rendering uses multisample antialiasing and screen-space ambient occlusion. Touch mode caps the canvas pixel ratio at 1.25 to reduce rendering cost on high-density tablet screens; desktop caps it at 1.5. The DOM interface stays sharp at native density. Detected software renderers keep the same world, materials, and lighting but omit postprocessing and dynamic shadows and reduce canvas resolution. This fallback is automatic; gameplay and saves are identical.

All models, signs, surface textures, and audio are original procedural work included in this source. The interface bundles Latin WOFF2 files for Barlow Condensed and IBM Plex Mono; body text uses the operating system’s sans-serif stack. Font files are served locally with the game and their Open Font License notices ship with the build. The Rapier compatibility package embeds its physics WASM in the bundled JavaScript, so it makes no runtime CDN or external WASM request. The production site needs only the files in `dist`; no remote model, texture, audio, or API service is required. This does not add an offline service worker.

Three.js and Rapier dependency credits and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The static build includes full runtime license text at `THIRD_PARTY_NOTICES.txt`.

## Proof-of-concept scope

This is a compact, single-player desktop and tablet game, with no traffic AI, multiplayer, mechanical damage, or account system. Touch layouts target iPad-sized screens; small phones are not the primary target. The fictional cars are inspired by broad automotive eras and carry original names and badges. Engine sound is synthesized locally; ElevenLabs is not called and the local API key is not used.

## Verified acceptance — November 8, 2026

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

The second graphics pass uses 17 matching camera fixtures in [graphics-before](artifacts/graphics-before/) and [graphics-after](artifacts/graphics-after/): all three restored cars and close-ups, unrestored shells, salvage racks, store displays, Garage, street, and water tower. The [capture script](scripts/graphics-review.mjs) injects its camera and read-only rendering observations into the temporary test browser response; production code has no teleport or editing controls. See the [rendering report](artifacts/graphics-after/graphics-review.json) for per-view frame timing, draw calls, triangles, and memory. The added model detail increases geometry and texture memory; batching reduces draw calls. Short 1440×900 captures remained at approximately 60 FPS on the Apple M4 Pro, with 95th-percentile frame intervals of 16.7–16.8ms. These measurements are limited to that machine and those views.

Deployment uses the [Pages workflow](https://github.com/markleary/junkyard-drivers/actions/workflows/pages.yml). Each push to `main` runs the checks and browser acceptance before publishing `dist`; the workflow's deployment environment records the result and public URL.
