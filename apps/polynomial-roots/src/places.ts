// The named places: where in this picture the literature says to look, each a state and a caption.
//
// **The rigor rule (ADR-0046 decision 7).** A caption may state a CITED THEOREM as a theorem, because
// someone proved it. Everything about what the picture shows is `≈`: it is a finite degree, numerically
// solved, so "the roots are dense here" is Bousch's and "this looks like a dragon" is the app's. The two
// are kept in separate fields so they cannot be confused by a later edit — `fact` is sourced, `seen` is
// this app's own description of its own image.
import type { AppState } from "./state.js";
import { DEFAULT_STATE } from "./state.js";

/**
 * The gallery's four groups, in reading order.
 *
 * A flat list of twenty-odd captions reads as a list of coordinates; grouped, it reads as what each
 * entry is FOR — the cloud the article is about, the self-similarity inside it, the same construction
 * over other alphabets, and what lies past the last degree any root solver reaches. Every place names
 * its group, and the suite requires every group to be non-empty and every place to be in exactly one.
 */
export type PlaceGroup = "tour" | "dragons" | "alphabets" | "beyond";

export const GROUPS: readonly { readonly id: PlaceGroup; readonly title: string; readonly intro: string }[] = [
  {
    id: "tour",
    title: "The Littlewood cloud",
    intro: "Every root of every polynomial with coefficients ±1, in the order Baez, Christensen and Derbyshire's article takes it.",
  },
  {
    id: "dragons",
    title: "Dragons",
    intro: "Near a point inside the disk the cloud looks like the attractor of the maps x ↦ ±1 + zx. These entries show the attractor itself.",
  },
  {
    id: "alphabets",
    title: "Other alphabets",
    intro: "The same construction over {0, 1}, {−1, 0, 1} and the roots of unity — each with a picture of its own and, for two of them, published bounds drawn over it.",
  },
  {
    id: "beyond",
    title: "Past the last degree",
    intro: "Where no root solver reaches: the limit set every power series over the alphabet can vanish on, and deep zoom by a reference point.",
  },
];

/** One entry of the gallery. */
export interface Place {
  readonly id: string;
  readonly group: PlaceGroup;
  readonly title: string;
  /** What the picture shows — the app's own `≈` description. */
  readonly seen: string;
  /** A proven statement about this region, with its source. Absent where there is none to cite. */
  readonly fact?: string;
  readonly source?: string;
  readonly state: AppState;
  /**
   * A scrubbable story: `state` is `steps[0]`, and the gallery offers a slider through the rest. Each
   * step is a whole state rather than a delta, so a step is a permalink like any other place.
   */
  readonly steps?: readonly AppState[];
}

const at = (cx: number | string, cy: number | string, halfHeight: number, over: Partial<AppState> = {}): AppState => ({
  ...DEFAULT_STATE,
  cx: String(cx),
  cy: String(cy),
  halfHeight,
  ...over,
});

/**
 * The slide deck's zoom, frame for frame: height `0.62508 · 2^{−k}` for `k = 0 … 8`, so the ninth frame
 * is `0.62508·2⁻⁸ = 0.0024417` — the deck's own ninth is `0.0024456`, its frames not being exact
 * halvings (0.16%) — at the deck's degree 20. The deck then raises the degree to 27, which
 * is past this app's cap of 24 — and past any root solver's reach at that height — so the rest of the
 * story is the limit set, which the handover brings in by itself as the frames shrink.
 */
const ZOOM_STORY: readonly AppState[] = Array.from({ length: 9 }, (_, k) =>
  at(0.42065, 0.48354, (0.62508 * Math.pow(2, -k)) / 2, { minDegree: 1, maxDegree: 20 }),
);

/**
 * Baez, Christensen and Derbyshire's own tour, in the order the article takes it.
 *
 * Coordinates are theirs: the zoom sequence's centre and the dragon's location are quoted from the
 * slide deck and the Notices article, not chosen here.
 */
export const PLACES: readonly Place[] = [
  {
    id: "whole",
    group: "tour",
    title: "The whole cloud",
    seen: "Every root of every Littlewood polynomial up to the chosen degree. The ring at the unit circle, the bright line along the real axis, and the holes at the roots of unity are all visible at once.",
    fact: "Every root satisfies ½ < |z| < 2, and the roots are dense in the annulus 2^(−1/4) ≤ |z| ≤ 2^(1/4).",
    source: "Bousch (1988); the bound is one line from 1 ≤ |z| + … + |z|ⁿ < |z|/(1−|z|).",
    state: DEFAULT_STATE,
  },
  {
    id: "hole-at-1",
    group: "tour",
    title: "The hole at 1, and the line along the real axis",
    seen: "A gap around the point 1 with a bright streak through it: more Littlewood polynomials have exactly real roots than have nearly real ones, so the axis is brighter than its neighbourhood rather than continuous with it.",
    state: at(1, 0, 0.33),
  },
  {
    id: "hole-at-i",
    group: "tour",
    title: "The holes at i and e^{iπ/4}",
    seen: "Two more gaps on the unit circle. The cloud avoids the roots of unity except where a polynomial happens to vanish exactly at one.",
    // Framed to hold BOTH points at any stage aspect ≥ 1: it was `at(0.78, 0.62, 0.42)`, whose left edge
    // at the stage's usual 1.55 is x = 0.13, so the title's i was off the frame (2026-09-26 review).
    state: at(0.36, 0.86, 0.5),
  },
  {
    id: "four-fifths",
    group: "tour",
    title: "Feathers near 4/5",
    seen: "Inside the disk on the real axis: the feathery filaments that give the plot its texture, laid along the axis.",
    source: "Baez, Christensen & Derbyshire, The Beauty of Roots (Notices AMS 70, 2023).",
    state: at(0.8, 0, 0.22),
  },
  {
    id: "four-fifths-i",
    group: "tour",
    title: "Feathers near 4i/5",
    seen: "The same structure a quarter turn round, and it does not look the same — the filaments run across the imaginary direction rather than along it.",
    state: at(0, 0.8, 0.22),
  },
  {
    id: "half-e-i-fifth",
    group: "tour",
    title: "½·e^{i/5}",
    seen: "The article's own choice: a region where the cloud resolves from haze into structure as the degree climbs.",
    source: "Baez, The Beauty of Roots (Azimuth, 2011).",
    state: at(0.5 * Math.cos(0.2), 0.5 * Math.sin(0.2), 0.16, { maxDegree: 18 }),
  },
  {
    id: "dragon",
    group: "dragons",
    title: "The dragon at 0.372 − 0.542i",
    seen: "The headline zoom. Near a point q inside the disk the cloud resembles the attractor of the pair of maps w ↦ 1 ± qw — a dragon curve.",
    fact: "For a Littlewood series P with a root α and |P′(α)| bounded below, the roots of its degree-n extensions, magnified about α by α^{−(n+1)}, converge to P′(α)^{−1}·D_α.",
    source: "Michelen & Yakir, Dragon curves in Littlewood roots (2026), Theorem 1.",
    state: at(0.372, -0.542, 0.075, { maxDegree: 18 }),
  },
  {
    id: "feather-08-02",
    group: "tour",
    title: "The feather at 0.8 + 0.2i",
    seen: "A single filament resolved far enough to show that it is made of filaments.",
    state: at(0.8, 0.2, 0.09, { maxDegree: 18 }),
  },
  {
    id: "zoom-story",
    group: "tour",
    title: "The zoom sequence at 0.42065 + 0.48354i",
    seen: "The slide deck's own descent, as a slider: nine frames at degree 20, each half the height of the last. Early frames are the cloud; by the later ones the loaded degree no longer resolves the picture, the app hands over to the limit set, and what fills the frame is a dragon.",
    source: "Baez, Christensen & Derbyshire, The Beauty of Roots (slides): centre 0.42065 + 0.48354i, height 0.62508 down to 0.0024456, then degree 20 → 27.",
    state: ZOOM_STORY[0],
    steps: ZOOM_STORY,
  },
  {
    id: "egan-point",
    group: "dragons",
    title: "Egan's point, −0.0572 + 0.72229i",
    seen: "One of the two places the dragon resemblance was first demonstrated interactively.",
    source: "Greg Egan's Littlewood applet.",
    state: at(-0.0572, 0.72229, 0.06, { maxDegree: 18 }),
  },
  {
    id: "egan-hue",
    group: "dragons",
    title: "The cloud coloured by its coefficients",
    seen: "Each root takes the hue of the first three coefficients of its own polynomial. Inside the disk the colours come in solid patches, one per prefix, nested the way the dragons are; toward the unit circle and outside it they mix to grey, because out there a root's position is set by the polynomial's other end.",
    source: "Greg Egan's Littlewood applet, which colours roots by their low-order coefficients.",
    state: at(0, 0, 1.45, { colour: "egan", hueDigits: 3 }),
  },
  {
    id: "newman",
    group: "alphabets",
    title: "{0, 1}: the Newman polynomials",
    seen: "The same construction over the alphabet {0, 1}. Dropping −1 breaks the symmetry z ↦ −z, and the cloud is no longer symmetric about the imaginary axis.",
    fact: "The root set lies in the half-plane Re z < 3/2 and in the annulus 1/Φ < |z| < Φ, Φ the golden ratio; its closure is path-connected and not simply connected.",
    source: "Odlyzko & Poonen, Zeros of polynomials with 0,1 coefficients (1993).",
    // Framed to hold the whole of Odlyzko–Poonen's region, which reaches |z| = Φ ≈ 1.618 — so the bound
    // is visible rather than clipped by the frame it is meant to be compared with.
    state: at(0, 0, 1.75, { alphabet: { preset: "zero-one" }, maxDegree: 18, bounds: true }),
  },
  {
    id: "bandt",
    group: "alphabets",
    title: "{−1, 0, 1}: Bandt's set M",
    seen: "The trinary alphabet, whose closure inside the disk is the connectedness locus of the pair of similarities x ↦ zx and x ↦ z(x−1)+1. The large hole on the real axis is visible at this zoom.",
    fact: "M has infinitely many holes, and its interior is dense away from the real axis.",
    source: "Barnsley & Harrington (1985); Bandt (2002); Calegari, Koch & Walker, Roots, Schottky semigroups, and a proof of Bandt's conjecture (2017).",
    // Framed to hold the Cauchy annulus out to |z| = 2.
    state: at(0, 0, 2.1, { alphabet: { preset: "trinary" }, maxDegree: 14, bounds: true }),
  },
  {
    id: "hexaholes-region",
    group: "alphabets",
    title: "The neighbourhood of ω, in roots",
    seen: "The trinary root cloud around the point the exotic holes accumulate at. Roots of bounded degree cannot reach the holes themselves — at degree 12 the nearest root to that centre is 7×10⁻⁴ away — so this shows the region and not the holes. The entry below shows the holes.",
    fact: "Infinitely many holes accumulate at ω ≈ 0.371859 + 0.519411i, a root of 1 − 2z + 2z² − 2z⁵ + 2z⁸.",
    source: "Calegari, Koch & Walker (2017), Theorem 9.1.1 and Figure 4; their own pictures come from a semigroup search to depth 60, not from roots of bounded degree.",
    state: at(0.372368, 0.517839, 0.06, { alphabet: { preset: "trinary" }, minDegree: 8, maxDegree: 16, engine: "roots" }),
  },
  {
    id: "hexaholes",
    group: "alphabets",
    title: "A hexahole, near ω",
    // "at ω" was not true of this frame: the centre is 1.65×10⁻³ from ω and the window 5×10⁻⁴ tall, so ω
    // is more than three windows off it (2026-09-26 review). The hole shown is one of those accumulating
    // there, and the caption now says so.
    seen: "The same neighbourhood in the limit-set engine, in a window 0.0005 tall whose centre is 1.7×10⁻³ from ω itself — one of the holes accumulating there, not ω: a hole opens, roughly a tenth of the window across, shaded by how deep the coefficient tree survived before it died. Raising the depth sharpens its edge; lowering it fills the hole in, because the picture is a superset of the limit set at every finite depth.",
    fact: "Infinitely many holes accumulate at ω ≈ 0.371859 + 0.519411i, a root of 1 − 2z + 2z² − 2z⁵ + 2z⁸.",
    source: "Calegari, Koch & Walker (2017), Theorem 9.1.1 and Figure 4.",
    state: at(0.372368, 0.517839, 0.00025, { alphabet: { preset: "trinary" }, engine: "limit", depth: 40 }),
  },
  {
    id: "limit-littlewood",
    group: "beyond",
    title: "Every Littlewood series that can vanish",
    seen: "The same alphabet read the other way: instead of the roots of polynomials up to a degree, the points where a power series Σ ±zᵏ can vanish at all, shaded by how deep the search survived. It reaches in to about |z| ≈ ½ and out to about 2 of its own accord — its extent, not a frame drawn around it.",
    fact: "Every root of a Littlewood polynomial has ½ < |z| < 2, and the closure of the root set inside the disk is exactly the set of z at which some Littlewood series vanishes.",
    source: "Bousch (1988, 1993).",
    state: at(0, 0, 1.45, { engine: "limit", depth: 26 }),
  },
  {
    id: "limit-bandt",
    group: "beyond",
    title: "Bandt's M as a set",
    seen: "The trinary limit set at the overview: the big hole on the real axis with its two whiskers, and the band around the unit circle left uncomputed in its own neutral rather than painted as empty.",
    fact: "M is the connectedness locus of the pair x ↦ zx, x ↦ z(x−1)+1; it has infinitely many holes, and its interior is dense away from the real axis.",
    source: "Barnsley & Harrington (1985); Bandt (2002); Calegari, Koch & Walker (2017).",
    state: at(0, 0, 1.0, { alphabet: { preset: "trinary" }, engine: "limit", depth: 24 }),
  },
  {
    id: "deep-zoom-story",
    group: "beyond",
    title: "Down to 10⁻³⁰, on one root",
    seen: "The slide deck's descent, carried as far as the arithmetic goes. The centre is an exact root of one degree-26 Littlewood polynomial — the one nearest the deck's own coordinates — and at every scale below it the roots of that polynomial's extensions crowd in, because the deeper the degree the finer they are spaced. The picture is the roots themselves, each solved from a single walk at the centre; the panel names them.",
    fact: "For a Littlewood series P with a root α in the open disk and |P′(α)| bounded below, the roots of its degree-n extensions, magnified about α by α^(−(n+1)), converge to P′(α)^(−1)·D_α.",
    source: "Michelen & Yakir, Dragon curves in Littlewood roots (2026), Theorem 1; the coordinates are Baez, Christensen & Derbyshire's slide deck, 0.42065 + 0.48354i.",
    state: at(
      "4.206512041286740015298812143756041e-1",
      "4.8372964222232227103378339664795e-1",
      1e-18,
      { engine: "deep" },
    ),
  },
  {
    id: "deep-float64-floor",
    group: "beyond",
    title: "Where a double runs out",
    seen: "The same centre at 10⁻¹⁶, one step past what a 53-bit number can place. In double-double the walk finds its roots; in float64 the same walk finds a different set, because the centre itself is no longer representable. The engine chooses, and the panel says which arithmetic drew the picture.",
    source: "Measured: the two agree on the root set exactly from 10⁻¹⁰ to 10⁻¹³, part company at 10⁻¹⁴, and by 10⁻²⁴ float64 finds nothing at all.",
    state: at(
      "4.206512041286740015298812143756041e-1",
      "4.8372964222232227103378339664795e-1",
      1e-16,
      { engine: "deep" },
    ),
  },
  {
    id: "dragon-inset",
    group: "dragons",
    title: "The dragon itself, at Baez's point",
    seen: "The inset beside the picture is not a second drawing of the cloud — it is the SET OF VALUES of every power series over the alphabet at the pinned point, which is the attractor of the maps x ↦ ±1 + zx. The cross in the middle is the origin, and whether it falls inside the cloud is the same question the stage is answering at that pixel.",
    fact: "For |q| < 1, q lies in the closure of the Littlewood root set if and only if 0 ∈ D_q, and then D_q is connected.",
    source: "Bousch, Paires de similitudes (1988); the coordinates are Baez, Christensen & Derbyshire's slide deck.",
    state: at(0.375453, 0.544825, 0.06, { maxDegree: 18, lamp: { re: 0.375453, im: 0.544825 } }),
  },
  {
    id: "dragon-theorem",
    group: "dragons",
    title: "The theorem, drawn: Michelen–Yakir at a probed root",
    seen: "A deep view on an exact root α of one Littlewood polynomial, with the inset showing the prediction: every extension of that prefix has a root near α, and magnifying those roots by 1/α^(n+1) lays them over the predicted set −D_α/P′(α). The two are PAIRED — each extension's tail names one point in each — so what the panel reports is the largest distance between a prediction and its own root, not a Hausdorff distance a rotated overlay could still pass.",
    fact: "For a Littlewood series P with a root α in the open disk and |P′(α)| bounded below, the roots of its degree-n extensions, magnified about α by α^(−(n+1)), converge in Hausdorff distance to P′(α)^(−1)·D_α.",
    source: "Michelen & Yakir, Dragon curves in Littlewood roots (2026), Theorem 1.",
    state: at(0.375453, 0.544825, 1e-3, { engine: "deep", theorem: true, extend: 8 }),
  },
  {
    id: "cube-roots",
    group: "alphabets",
    title: "Cube roots of unity: three-fold symmetry",
    seen: "An alphabet with no negation but three units. The cloud picks up the alphabet's own three-fold rotational symmetry.",
    state: at(0, 0, 1.6, { alphabet: { preset: "roots-of-unity", n: 3 }, maxDegree: 12 }),
  },
];

/** Look one up by id. */
export function placeById(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}
