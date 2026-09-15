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
  /** Six categorical hues, one per contour piece, reused wherever that piece appears. */
  readonly pieces: readonly string[];
  /** A branch cut: never a piece colour, because a cut is a barrier rather than part of the path. */
  readonly cutInk: string;
  /** A cut's draggable handle. */
  readonly cutHandle: string;
  /** Anything LEGALITY has refused — one colour for "this does not close", not two. */
  readonly refusedInk: string;
  /** A grabbable handle's ring, and the same while held. */
  readonly handleRing: string;
  readonly handleGrabbed: string;
  /** The integration marker, filled — the one filled round thing on the stage. */
  readonly markerFill: string;
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
  pieces: ["#6ea8fe", "#f0b45e", "#7fd1a8", "#e594b4", "#b79cf0", "#79d3e8"],
  cutInk: "#c77dff",
  cutHandle: "#c77dff",
  refusedInk: "#f0b45e",
  handleRing: "#e7e9ee",
  handleGrabbed: "#ffffff",
  markerFill: "#ffffff",
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
 * **Nothing consumes this yet**, and that is stated rather than hidden: the figure export's plate is
 * chrome only (`FigureTheme` — background, text, muted) and composites canvases that were drawn in
 * the dark theme, so a light figure is a later step's work. It exists because the palette is being
 * named now and naming half of it would leave the next reader guessing which half.
 *
 * The halo flips, which is the polarity PLAN.md §5.3 names. **The piece hues are DARKENED rather
 * than reused**: `#6ea8fe` on white is a 1.9:1 contrast — legible as a wide stroke and not as the
 * 1 px rules and small text that share its meaning elsewhere — where these sit near 4.5:1.
 */
export const LIGHT_INK: InkTheme = {
  halo: "rgba(255, 255, 255, 0.85)",
  haloStrong: "rgba(255, 255, 255, 0.92)",
  pieces: ["#1f5fc4", "#9a5b00", "#116b47", "#a8296a", "#5b3bb5", "#0f6a80"],
  cutInk: "#7b28c4",
  cutHandle: "#7b28c4",
  refusedInk: "#9a5b00",
  handleRing: "#2a2e38",
  handleGrabbed: "#000000",
  markerFill: "#000000",
  penPreview: "#2b5fb8",
  accumulator: {
    axes: "rgba(20, 24, 32, 0.20)",
    trail: "rgba(20, 24, 32, 0.50)",
    dots: "rgba(20, 24, 32, 0.68)",
    headFill: "#000000",
    headRing: "rgba(255, 255, 255, 0.92)",
  },
};

/** The two, by name — for the session's `figureTheme` and the later theme switch. */
export const INK_THEMES = { dark: DARK_INK, light: LIGHT_INK } as const;
