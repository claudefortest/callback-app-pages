# Callback

Marketing site for Callback, a mock product where Claude phones you when a task is done or needs a decision.

The hero is a phone that renders live in the browser: no video files, no downloaded models. Every part is built from code in real millimetres, lit by a small studio baked into the environment map, and directed by the scroll.

Hold the green button to answer the call.

## How it's built

- `src/sdf.js` 2D signed-distance shapes, melted with a smooth union, traced with marching squares into outlines
- `src/phone.js` extrudes each outline with a bevel; satin face and polished edge on every metal part
- `src/studio.js` the photo studio the metal reflects (one softbox, two strip lights, a rim light)
- `src/screen.js` the display, drawn live from the same clock as the 3D scene
- `src/audio.js` ring and click sounds synthesised with Web Audio, no audio files
- `src/main.js` camera script pinned to page sections, staggered exploded view, labels, blueprint toggle, hold-to-answer

## Develop

```bash
npm install
npm run dev     # rebuilds assets/callback.js on change
npm run build   # minified bundle for GitHub Pages
```

`assets/callback.js` is committed because the site is served as static files. Serve the folder with any static server, for example `python3 -m http.server`.

If WebGL isn't available the page falls back to a flat phone card and the same copy.

Technique follows the "Build 3D websites that run live" guide by @uijonah. Design direction follows the principles in the unslop skill by Damir Sokolovsky (CC BY 4.0): quiet chrome, one rich object, plain copy.
