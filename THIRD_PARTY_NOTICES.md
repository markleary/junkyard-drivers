# Third-party notices

## Runtime software

| Component | Use | License and source |
| --- | --- | --- |
| Three.js | WebGL rendering, geometry, lighting, materials, and camera utilities | MIT; copyright © 2010–2025 three.js authors. [Source](https://github.com/mrdoob/three.js), [license](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| Rapier / `@dimforge/rapier3d-compat` | Physics simulation, character collision, raycast vehicle controller, bundled WebAssembly | Apache License 2.0. [Rapier source](https://github.com/dimforge/rapier), [JavaScript bindings](https://github.com/dimforge/rapier.js), [license](https://github.com/dimforge/rapier/blob/master/LICENSE) |

The installed versions are fixed by `package-lock.json`. Full copies of the runtime license texts are provided in [public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt), which Vite copies into the published site. Runtime dependencies are used without modifying their source.

## Bundled interface fonts

| Font | Use | License and source |
| --- | --- | --- |
| Barlow Condensed, weights 700 and 800 | Workshop signs, document headings, and the title | SIL Open Font License 1.1; copyright 2017 The Barlow Project Authors. [Original project](https://github.com/jpt/barlow), [Fontsource distribution](https://fontsource.org/fonts/barlow-condensed) |
| IBM Plex Mono, weights 400 and 500 | Typewritten inventory specifications, status labels, and controls | SIL Open Font License 1.1; copyright 2017 IBM Corp. [Original project](https://github.com/IBM/plex), [Fontsource distribution](https://fontsource.org/fonts/ibm-plex-mono) |

The Latin WOFF2 files are bundled from the locked Fontsource packages without modification. Fonts load from the same local deployment as the game; no Google Fonts, CDN, or other font service is contacted. Their full copyright statements and license texts are included in the published `THIRD_PARTY_NOTICES.txt`.

## Original game assets

The car bodies, fictional badges, wheels, grime/rust textures, town buildings, scenery, signs, and interface artwork are original procedural assets authored for Junkyard Drivers. There are no downloaded third-party models, textures, or photographs in the runtime. Interface pictograms and vehicle-profile stamps are original SVG artwork; the bundled fonts are credited above. The fictional car names and broad period-inspired shapes do not imply affiliation with an automaker.

## Generated sound recordings

| Asset | Use | Source |
| --- | --- | --- |
| 47 MP3 clips in `src/audio/samples` (about 1.9 MB) | Engine idle and rev loops for three engine families, starters, horns, tire and wind loops, day, night, workshop and yard ambience, footsteps, tools, interface and reward sounds | Generated on November 9, 2026 with the [ElevenLabs](https://elevenlabs.io) sound-effects API from text prompts written for this game, using the repository owner's ElevenLabs account |

No recording, sample library, or other person's audio was used as an input: each clip was produced from a written description alone. The clips were then trimmed, levelled, filtered and prepared for looping locally with FFmpeg and scripts written for this project; one engine loop blends two generated takes. Nothing else in the audio path is third-party: the fallback synthesizer in `src/audio` is original code using the browser's Web Audio API.

Rights to output from the ElevenLabs API are set by the ElevenLabs terms for the plan of the account that generated it. Confirm that plan permits your intended distribution before publishing a fork or a commercial build, and replace or remove the clips if it does not: the game runs complete on the synthesizer alone when `src/audio/samples` is empty. The game never contacts ElevenLabs, and no key is needed to run or build it.

## Development tools

TypeScript, Vite, Vitest, Playwright, and type-definition packages are development dependencies. Their own licenses remain in their package distributions; they are not loaded by the game at runtime. See `package-lock.json` for the complete resolved dependency graph.
