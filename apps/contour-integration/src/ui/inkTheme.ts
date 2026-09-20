// The colours the two canvas layers draw with — M8 step 1.2.
//
// Until now every one of these was a literal at its use site, which is how `#f0b45e` came to mean
// both "the second piece" and "this argument does not close" in the same file without anything
// saying so. Naming them is what lets the second fact be stated: `refusedInk` IS `pieces[1]`, and a
// reader seeing amber has to look at what it is on.
//
// **The dark values are the ones the app has always drawn**, character for character, so this step
// is a refactor and not a repaint: the browser ink tests assert the old shell's output pixel for
// pixel, and they pass unchanged because `DARK` is the literals moved rather than chosen again.
//
// `theme` is a REQUIRED option on both drawing calls. A default would be a second place for the
// palette to live, and the whole point of the module is that there is one.

/** What `drawContour` and `drawAccumulator` need. Nothing here is a chrome colour — see `theme.css`. */
export interface InkTheme {
  /**
   * The dark outline every stroke is laid over, so a contour stays legible against any phase.
   *
   * **The phase portrait is DATA and does not theme-swap** (PLAN.md §5.3); the halo's polarity is
   * the one thing that does, because a dark halo on a light plate reads as a second stroke.
   */
  readonly halo: string;
  /** The same, at the weight the handles and the marker use. Two alphas, because the code has two. */
  readonly haloStrong: string;
  /**
   * The ground the plate sits on — the one colour here that is NOT drawn by the ink layer.
   *
   * It is in the theme because M8 step 1.9's **textbook** stage mode clears the GL canvas to it: a
   * GL clear cannot read a CSS variable, so the value has to be stated in JS, and stating it twice
   * (once here, once at the clear) is how a plate comes to be drawn on a ground the ink was not
   * chosen against. The dark value is `--g-ground`'s, which is what `GLStage.clear` has always
   * hard-coded; the light one is the thumbnails' `THUMBNAIL_GROUND`, so a textbook plate and a
   * front-door card are on the same paper.
   */
  readonly paper: string;
  /** Six categorical hues, one per contour piece, reused wherever that piece appears. */
  readonly pieces: readonly string[];
  /** A branch cut: never a piece colour, because a cut is a barrier rather than part of the path. */
  readonly cutInk: string;
  /** A cut's draggable handle. */
  readonly cutHandle: string;
  /** Anything LEGALITY has refused — one colour for "this does not close", not two. */
  readonly refusedInk: string;
  /**
   * A neutral full-strength stroke that carries no meaning of its own.
   *
   * The textbook plate's axes, its `Re`/`Im` labels, its grid (at reduced alpha) and the ⊗ pole
   * glyph are drawn in it. **It exists because every other member of this interface means
   * something**: a piece colour names a piece, `cutInk` a barrier, `refusedInk` a refusal,
   * `handleRing` a thing to grab. The plate's furniture is none of those, and the first draft
   * borrowed `handleRing` for it — which would have made "the real axis" and "you can drag this"
   * the same colour on a canvas that already has one round thing too many.
   */
  readonly plateInk: string;
  /** A grabbable handle's ring, and the same while held. */
  readonly handleRing: string;
  readonly handleGrabbed: string;
  /** The integration marker, filled — the one filled round thing on the stage. */
  readonly markerFill: string;
  /**
   * The amplitwist detail's two arrows — M8 step 3.3.
   *
   * Two colours because the picture's whole content is that these are DIFFERENT vectors: one is a
   * step along the contour and one is that step amplified and twisted. Neither is a piece colour
   * (they are not pieces, and a piece colour beside a piece would read as naming it) and neither is
   * `cutInk` or `refusedInk`, which already say something. `arc` is the angle between them, drawn
   * thinner than either, because it is a measurement of the pair rather than a third vector — and
   * in the TERM's own hue rather than a third colour, because it is the twist that carried `Δz`
   * onto the term. It is opaque: the first draft made it the term's hue at 55 % alpha, and on the
   * sandbox's circle at `arg f = −44°` the portrait behind it happens to be green, so the mark was
   * painted (12 pixels, measured) and invisible. Every other stroke here carries a halo and an
   * opaque ink for that reason; the arc was the one that did not.
   *
   * **Both were CHANGED after measuring a real frame**, which is the only way this file's rule about
   * colours meaning one thing can be checked. The first draft took a grey for `Δz` and the gold
   * `#ffd166` for the term. Counted over A6's ink layer with the detail off — 11,885 painted pixels
   * — the grey matched **75** of them (the handle rings and the pole glyphs antialiasing against
   * the dark paper), so a test asking "did the arrow appear" could not have had a clean answer and
   * neither could a reader; and the gold is 29 away from `refusedInk` in the widest channel, which
   * on a refused contour is two ambers on one canvas. Teal and lime match **0** pixels on that same
   * frame and sit 64 and 62 away from the nearest colour in either theme.
   */
  readonly stepArrow: {
    /** `Δz` — the step itself. */
    readonly dz: string;
    /** `f(z)·Δz` — the term. The colour the strip's emphasised segment takes, so the two agree. */
    readonly term: string;
    readonly arc: string;
  };
  /** The pen's un-committed path: dashed, and never in a piece colour. */
  readonly penPreview: string;
  /** The accumulator strip. */
  readonly accumulator: {
    readonly axes: string;
    readonly trail: string;
    readonly dots: string;
    readonly headFill: string;
    readonly headRing: string;
  };
}

/**
 * The app's committed look, and the literals it has always used.
 *
 * Do not "tidy" a value here: `test/accumulatorInk.browser.test.ts` and `test/drillInk.browser.test.ts`
 * measure real pixels, and the alpha on `axes` is the difference between a trail that reads and one
 * that competes with its own frame.
 */
export const DARK_INK: InkTheme = {
  halo: "rgba(8, 10, 14, 0.85)",
  haloStrong: "rgba(8, 10, 14, 0.9)",
  paper: "#0f1115",
  pieces: ["#6ea8fe", "#f0b45e", "#7fd1a8", "#e594b4", "#b79cf0", "#79d3e8"],
  cutInk: "#c77dff",
  cutHandle: "#c77dff",
  refusedInk: "#f0b45e",
  plateInk: "#e7e9ee",
  handleRing: "#e7e9ee",
  handleGrabbed: "#ffffff",
  markerFill: "#ffffff",
  stepArrow: { dz: "#2ed6c4", term: "#b2eb5e", arc: "#b2eb5e" },
  penPreview: "#7aa2f7",
  accumulator: {
    axes: "rgba(231, 233, 238, 0.16)",
    trail: "rgba(231, 233, 238, 0.42)",
    dots: "rgba(231, 233, 238, 0.6)",
    headFill: "#ffffff",
    headRing: "rgba(8, 10, 14, 0.9)",
  },
};

/**
 * The light plate.
 *
 * **M8 step 1.9's `textbook` stage mode is its first consumer** — the plate that clears the portrait
 * away and draws axes, a unit grid, the contour and the poles on paper. That is also why the plate
 * is light in BOTH app themes: it is imitating a printed figure, and a printed figure is on paper.
 * (Until 1.9 nothing consumed this, which the comment said; the figure export's plate is chrome only
 * — `FigureTheme`, background/text/muted — and still composites canvases drawn in the dark theme, so
 * a light *figure* remains a later step's work.)
 *
 * The halo flips, which is the polarity PLAN.md §5.3 names. **The piece hues are DARKENED rather
 * than reused**: `#6ea8fe` on white is a 1.9:1 contrast — legible as a wide stroke and not as the
 * 1 px rules and small text that share its meaning elsewhere — where these sit near 4.5:1.
 */
export const LIGHT_INK: InkTheme = {
  halo: "rgba(255, 255, 255, 0.85)",
  haloStrong: "rgba(255, 255, 255, 0.92)",
  paper: "#f7f8fa",
  pieces: ["#1f5fc4", "#9a5b00", "#116b47", "#a8296a", "#5b3bb5", "#0f6a80"],
  cutInk: "#7b28c4",
  cutHandle: "#7b28c4",
  refusedInk: "#9a5b00",
  plateInk: "#2a2e38",
  handleRing: "#2a2e38",
  handleGrabbed: "#000000",
  markerFill: "#000000",
  stepArrow: { dz: "#0e7c72", term: "#5d7f14", arc: "#5d7f14" },
  penPreview: "#2b5fb8",
  accumulator: {
    axes: "rgba(20, 24, 32, 0.20)",
    trail: "rgba(20, 24, 32, 0.50)",
    dots: "rgba(20, 24, 32, 0.68)",
    headFill: "#000000",
    headRing: "rgba(255, 255, 255, 0.92)",
  },
};

// **There was an `INK_THEMES = { dark, light }` map here, and a `Session.figureTheme` beside it.**
// Both are gone at M8 step 2.5, having had no reader since step 2.3: the figure export takes its
// plate as an argument (`saveFigure(plate)`, one of `dark | light | print`) rather than reading a
// session field, so the field was written once at session start and never looked at, and the map
// could not express the third plate anyway. The two themes are exported by name above.
