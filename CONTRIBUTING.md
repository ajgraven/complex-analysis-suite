# Contributing

This guide is for anyone extending the tool — adding a fractal, a control, or a
new bit of math. It assumes you've read the [README](README.md) (especially the
**Architecture** section) and have the dev server running:

```bash
npm install
npm run dev
```

## Before you open a PR

All of these must pass:

```bash
npm test          # Vitest unit suite
npm run lint      # ESLint
npm run build     # production build succeeds
npm run format    # Prettier (run it; commit the result)
```

Pure logic (parsing, transforms, presets) is unit-tested. The CindyGL render
loop can't be unit-tested, so **verify rendering by hand** in `npm run dev`:
both plots draw, dragging the `c` point updates the dynamical plane, presets
switch, and apply/export work.

## The one gotcha: the `window` boundary

CindyJS evaluates its `javascript("…")` event callbacks in the **global
(`window`) scope at runtime** — not in module scope. So any JavaScript symbol
you reference _inside a CindyScript callback string_ must be exposed on `window`.

That exposure happens in one place, [`src/main.ts`](src/main.ts):

```ts
declare global {
  interface Window {
    /* ...add the symbol's type here... */
  }
}
Object.assign(window, {
  dynamicalPlot,
  parameterPlot,
  scaleArray,
  formatComplex,
  setCInput /* ... */,
});
```

If you add a callback like `"recenter(parameterPlot.center)"` (in a builder in
[`src/cindyscript/handlers.ts`](src/cindyscript/handlers.ts) or a callback array
passed to `FractalPlot`), you must also add `recenter` to that `Object.assign`
and the `Window` interface. Symptom of forgetting: a silent `ReferenceError` in
the browser console when the callback fires, and the interaction does nothing.

Everything else is ordinary module-scoped code — only this CindyScript-facing
surface needs `window`.

## Common tasks

### Add a fractal preset

1. Add an entry — keyed by the new name — to **both** `paramPresets` and
   `dynPresets` in [`src/presets.ts`](src/presets.ts). See the `Preset` type for
   the fields; dynamical presets also need a `z0`.
2. Add the name to the `PresetName` union in the same file.
3. Add an `<option value="your name">` to the `#fractal_presets` `<select>` in
   [`index.html`](index.html).

`presetNames` is derived from the dictionary keys, so the integrity test in
`test/presets.test.ts` will automatically check your new entry is well-formed
(non-empty `f`/`c`/`n`/`nplot`/`escape`, numeric `zoom`, 2-element `center`).

```ts
// src/presets.ts
export const paramPresets: Record<PresetName, Preset> = {
  // ...
  "my fractal": {
    f: "z^3+c",
    c: "-.5+.2*i",
    n: "100",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.7,
    center: [0, 0],
  },
};
```

### Extend the CindyScript math

Add definitions to `MATHLIB_CS` in
[`src/cindyscript/mathlib.ts`](src/cindyscript/mathlib.ts). It is injected into
every plot's init program, so anything defined there is callable from `f`,
`escape`, and other CindyScript. (This is where the custom `lambertw` lives.)

### Change the colouring

Edit `colorFcn` in
[`src/cindyscript/init.ts`](src/cindyscript/init.ts). It maps escape time `u`
(or `n` for "never escaped" → black) to an `(r, g, b)` triple.

### Add a control input

1. Add the field markup in [`index.html`](index.html) with a unique `id` and a
   matching `<label for="…">`.
2. Register the id in `INPUT_IDS` in
   [`src/ui/controls.ts`](src/ui/controls.ts), and add a getter/setter beside the
   others. If it should be set when a preset loads, also handle it in
   `populateInputs`.
3. Consume it in [`src/main.ts`](src/main.ts) — typically in
   `readPresetsFromInputs` (used by **apply changes**) or in the button wiring.

### Keep the two coordinate transforms in sync

The canvas↔plot transforms exist in both JavaScript
([`src/transforms.ts`](src/transforms.ts)) and CindyScript (the `PltToCanv*` /
`CanvToPlt*` functions in [`src/cindyscript/init.ts`](src/cindyscript/init.ts)) —
the JS side for geometry, the CindyScript side for the GPU. If you change one,
change the other to match. The JS pair's inverse property is asserted in
`test/transforms.test.ts`.

## Code style

- TypeScript, strict mode. Prefer module scope; only the documented CindyScript
  surface touches `window`.
- Formatting and linting are enforced by Prettier + ESLint — run `npm run format`
  before committing.
- Add unit tests for any new pure function (complex math, transforms, preset
  shape). Keep tests in `test/` mirroring the `src/` layout.
