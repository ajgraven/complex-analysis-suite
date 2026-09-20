// What the stage draws behind the contour — M8 step 1.9, plan §1.9.
//
// One choice with four positions, named in one place because three modules read it: the shader
// (`phase.glsl.ts` / `glStage.ts` take it as `uMode`), the ink layer (`ink.ts` draws the textbook
// figure), and the codec (`shell/viewState.ts` carries it in a link). A second copy of the list is
// how a mode comes to exist in the bar and not in the codec.
//
// **`quiet` is the default in every app mode.** The plan delegates the choice and this is it,
// recorded here rather than only in STATUS.md: in Explore, Worked example and Drill alike the
// subject is the contour and the verdict, and a full-chroma portrait behind them competes for the
// reader's eye with something that is not the argument. The full portrait is one click away.

/**
 * The four positions.
 *
 *  - `quiet` — the CET-C6 hues at reduced chroma and lightness. The portrait is context.
 *  - `full` — the portrait at full strength: the phase map as data.
 *  - `iso` — `full`, slightly muted, with a dark isoline every 30° of `arg f`. Phase becomes
 *    *countable*: the reader can see how many times the colour wheel turns around a pole.
 *  - `textbook` — no portrait at all. A white plate with axes, a unit grid, the contour in its
 *    piece colours with arrowheads, poles as ⊗ and cuts dashed — the figure a textbook prints.
 */
export type StageMode = "quiet" | "full" | "iso" | "textbook";

/** In the order the segmented control shows them: quietest first, then louder, then no portrait. */
export const STAGE_MODES: readonly StageMode[] = ["quiet", "full", "iso", "textbook"];

/** The default. See the note above: the contour is the subject, so the portrait starts quiet. */
export const DEFAULT_STAGE_MODE: StageMode = "quiet";

export const isStageMode = (x: unknown): x is StageMode =>
  typeof x === "string" && (STAGE_MODES as readonly string[]).includes(x);

/** What each position says it does, for the control's accessible name and its tooltip. */
export const STAGE_MODE_LABELS: Readonly<Record<StageMode, { readonly label: string; readonly hint: string }>> = {
  quiet: { label: "Quiet", hint: "the phase portrait muted, so the contour is the subject" },
  full: { label: "Full", hint: "the phase portrait at full strength — CET-C6, hue is arg f" },
  iso: { label: "Isolines", hint: "full, with a dark line every 30° of arg f — the phase made countable" },
  textbook: { label: "Textbook", hint: "no portrait: a white plate with axes, the contour, poles and cuts" },
};

/**
 * How strongly the modulus-contour overlay darkens the portrait — a STRENGTH in `[0, 1]`, which is
 * what `uIsoStrength` is.
 *
 * **It was a COUNT** (`ISO_CONTOURS = 8`, in `shell/stageView.ts`), and `mix` extrapolates: the
 * shader's line is `rgb = mix(rgb, rgb * 0.6, iso * uIsoStrength)` with `iso ∈ [0, 1]`, so at `t = 8`
 * the result is `rgb·(1 − 3.2·iso)`, negative for `iso > 0.3125` and clamped to black. Measured on
 * the real `buildPhaseFrag` program (`1/(1+z²)`, mode `full`, 256², range `[−3,3]²`): at `0` nothing
 * is darkened; at `1`, 7,223 pixels are darkened and **none** is black; at `8`, **5,183 pixels are
 * pure black**, 7.9 % of the frame. There is no count to pass — the band spacing is one contour per
 * doubling of `|f|` and is not a parameter at all.
 *
 * `1` is full strength, the 40 % darkening the shader's own comment describes and the value
 * `test/declaredParity.browser.test.ts` has always probed with: the tested value and the shipped one
 * are now the same number, imported from here.
 */
export const ISO_STRENGTH = 1;

/**
 * Whether the modulus contours are shown — the ONE reader of the tri-state default.
 *
 * `null` means "follow the context", and the context is a declared branch product: that is exactly
 * the case the overlay answers, since a level curve of `|f|` runs straight through a phase seam. So
 * it is on by default there and off otherwise.
 *
 * **Two readers is how the control came to lie.** The card defaulted this way while the stage drew
 * contours only for `iso === true`, so every tier-D record showed a PRESSED button over a portrait
 * with no contours on it, and the first click — `setIso(!isoOn)` = `setIso(false)` — merely
 * un-pressed the button: it took two clicks to turn the feature on.
 *
 * Primitives rather than a `ShellState`, so the predicate sits beside the stage's other dials and
 * the card can read it without the shell's types coming into `ui/`.
 */
export const isoShown = (iso: boolean | null, hasDeclaredProduct: boolean): boolean =>
  iso ?? hasDeclaredProduct;
