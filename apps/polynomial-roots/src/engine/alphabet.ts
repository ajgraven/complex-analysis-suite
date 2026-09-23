// The coefficient alphabet, and the symmetries it actually has.
//
// A polynomial in this app is PROPER over an alphabet `A ⊂ ℂ`: every coefficient is in `A`, and the
// constant and leading coefficients are non-zero. Properness is not decoration — it is what makes the
// family the one the literature studies. Allowing `a_0 = 0` would factor out a `z` and put `0` in every
// picture; allowing `a_d = 0` would count the same polynomial once at each higher degree. For `{−1, +1}`
// it is vacuous; for `{0, 1}` it is Odlyzko–Poonen's normalisation.
//
// **Symmetries are DERIVED and checked, never assumed** (ADR-0046). Christensen's 8-fold reduction is a
// fact about `{−1, +1}`, not about alphabets: `{0, 1}` is not closed under negation, so `z ↦ −z` is not a
// symmetry of it, and a reduction that assumed otherwise would silently paint a picture that is not the
// root set. The four candidates, each with the map it induces on ROOTS:
//
//   · units `u` (`u·A = A`)      — `P ↦ uP`. Roots UNCHANGED, so this is a pure enumeration saving:
//                                  normalise `a_0` to one representative per unit-orbit and multiply the
//                                  count back. `{−1,+1}` and `{−1,0,1}` have `{±1}`; `{0,1}` has only 1.
//   · negation (`−A = A`)        — `a_k ↦ (−1)^k a_k`, i.e. `Q(z) = P(−z)`. Roots `z ↦ −z`.
//   · reversal (always)          — `a_k ↦ a_{d−k}`, i.e. `Q(z) = z^d P(1/z)`. Roots `z ↦ 1/z`. This one
//                                  needs no condition at all: reversing a vector over `A` gives another
//                                  vector over `A`, and properness is exactly what keeps the reversed
//                                  polynomial's degree and non-zero constant term. It is why every
//                                  picture in this app is symmetric under inversion.
//   · conjugation (`conj A = A`) — `a_k ↦ conj(a_k)`. Roots `z ↦ conj z`. Included in the reduction group
//                                  ONLY when `A` is not all-real: over a real alphabet it is the identity
//                                  on coefficient vectors, and each polynomial's own roots are already
//                                  conjugate-closed, so the picture's mirror symmetry is free and putting
//                                  it in the group would only double the work.
//
// Everything downstream works on DIGIT INDICES into `values`, and every symmetry is a precomputed
// permutation of those indices (`negPerm`, `conjPerm`, `unitPerm`). So the hot loop compares small
// integers and never a float: an alphabet built from `cos`/`sin` (the roots of unity) would otherwise
// have to re-decide "is `−a` in the alphabet?" a hundred million times, in floating point.

/** A complex number. Plain data — the engine's arrays are the hot path, this is the readable edge. */
export interface Cx {
  readonly re: number;
  readonly im: number;
}

/** How close two alphabet values may be and still count as the same member. */
const SAME = 1e-9;

/** Which preset an alphabet came from; `custom` carries a user-typed list. */
export type AlphabetPresetId = "littlewood" | "zero-one" | "trinary" | "range" | "roots-of-unity" | "custom";

/** The user-facing choice: a preset plus its one parameter (`n` for `range` / `roots-of-unity`). */
export interface AlphabetSpec {
  readonly preset: AlphabetPresetId;
  /** `range` → coefficients −n…n; `roots-of-unity` → the n-th roots of unity. Ignored otherwise. */
  readonly n?: number;
  /** `custom` → the raw text the reader typed, e.g. `1, -1, i, -i`. Ignored otherwise. */
  readonly custom?: string;
}

/** One element of the reduction group, as a subset of the three generators. */
export interface SymmetryElement {
  readonly neg: boolean;
  readonly rev: boolean;
  readonly conj: boolean;
}

/** A compiled alphabet: its values, the symmetries it has, and the index tables the engine runs on. */
export interface Alphabet {
  readonly spec: AlphabetSpec;
  /** A short stable id, used in the permalink and as a texture-cache key. */
  readonly id: string;
  /** What to call it on screen. */
  readonly label: string;
  /** The alphabet's values, in the order that defines a digit index. */
  readonly values: readonly Cx[];
  /** True when every value is real (then conjugation is off the group — see the header). */
  readonly allReal: boolean;
  /** The units `u` with `u·A = A`. Always contains 1. */
  readonly units: readonly Cx[];
  /** `−A = A`. */
  readonly hasNeg: boolean;
  /** `conj A = A`. Always true for a real alphabet; only USED when `allReal` is false. */
  readonly hasConj: boolean;
  /** The reduction group, identity first. Size 2, 4 or 8. */
  readonly group: readonly SymmetryElement[];
  /** Digit indices of the non-zero values, ascending. */
  readonly nonZero: readonly number[];
  /** Digit indices of the constant-term representatives: one per unit-orbit of the non-zero values. */
  readonly leading: readonly number[];
  /** `negPerm[j]` — the digit index of `−values[j]`. Empty when `hasNeg` is false. */
  readonly negPerm: readonly number[];
  /** `conjPerm[j]` — the digit index of `conj(values[j])`. */
  readonly conjPerm: readonly number[];
  /** `unitPerm[u][j]` — the digit index of `units[u]·values[j]`. */
  readonly unitPerm: readonly (readonly number[])[];
  /** `normUnit[j]` — the unit index that carries `values[j]` to its orbit's representative. */
  readonly normUnit: readonly number[];
}

const cx = (re: number, im = 0): Cx => ({ re, im });
const near = (a: Cx, b: Cx): boolean => Math.abs(a.re - b.re) < SAME && Math.abs(a.im - b.im) < SAME;
const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

/** The index of `v` in `values`, or −1. */
function indexOf(values: readonly Cx[], v: Cx): number {
  for (let j = 0; j < values.length; j++) if (near(values[j], v)) return j;
  return -1;
}

/** Sort key: real part, then imaginary — so an alphabet's digit order does not depend on how it was typed. */
function ordered(values: readonly Cx[]): Cx[] {
  return [...values].sort((a, b) => a.re - b.re || a.im - b.im);
}

/** Drop duplicates (within `SAME`). */
function dedupe(values: readonly Cx[]): Cx[] {
  const out: Cx[] = [];
  for (const v of values) if (indexOf(out, v) < 0) out.push(v);
  return out;
}

/**
 * Parse a user-typed alphabet: a comma- or whitespace-separated list of complex numbers, each of the
 * forms `3`, `-1`, `2.5`, `i`, `-i`, `2i`, `1+i`, `1-2i`, `-0.5+0.5i`. Returns null with a reason when
 * anything is unreadable, because an alphabet the reader half-typed must not silently become a
 * different picture.
 */
export function parseAlphabet(text: string): { values: Cx[] } | { error: string } {
  const parts = text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { error: "no values — type something like 1, -1" };
  const values: Cx[] = [];
  for (const part of parts) {
    const v = parseComplex(part);
    if (v === null) return { error: `cannot read "${part}" as a number` };
    values.push(v);
  }
  const uniq = dedupe(values);
  if (uniq.length < 2) return { error: "an alphabet needs at least two distinct values" };
  if (uniq.every((v) => Math.abs(v.re) < SAME && Math.abs(v.im) < SAME)) {
    return { error: "every value is zero — there are no proper polynomials" };
  }
  if (uniq.filter((v) => Math.abs(v.re) >= SAME || Math.abs(v.im) >= SAME).length === 0) {
    return { error: "no non-zero value — a proper polynomial needs one" };
  }
  return { values: ordered(uniq) };
}

/** One term: `a`, `bi`, `a+bi`, `a-bi`, with `i` alone meaning 1i. */
function parseComplex(s: string): Cx | null {
  const t = s.replace(/\s+/g, "");
  if (t.length === 0) return null;
  // Pure imaginary, e.g. "i", "-i", "2i", "-1.5i".
  const im = /^([+-]?(?:\d+\.?\d*|\.\d+)?)i$/.exec(t);
  if (im) {
    const c = im[1];
    const v = c === "" || c === "+" ? 1 : c === "-" ? -1 : Number(c);
    return Number.isFinite(v) ? cx(0, v) : null;
  }
  // a ± bi — split at the sign that is not the leading one and not an exponent sign.
  const split = /^([+-]?(?:\d+\.?\d*|\.\d+))([+-](?:\d+\.?\d*|\.\d+)?)i$/.exec(t);
  if (split) {
    const re = Number(split[1]);
    const c = split[2];
    const imv = c === "+" ? 1 : c === "-" ? -1 : Number(c);
    return Number.isFinite(re) && Number.isFinite(imv) ? cx(re, imv) : null;
  }
  const re = Number(t);
  return Number.isFinite(re) ? cx(re) : null;
}

/** The values of a preset, or an error for an unusable parameter / custom text. */
export function valuesOfSpec(spec: AlphabetSpec): { values: Cx[] } | { error: string } {
  switch (spec.preset) {
    case "littlewood":
      return { values: [cx(-1), cx(1)] };
    case "zero-one":
      return { values: [cx(0), cx(1)] };
    case "trinary":
      return { values: [cx(-1), cx(0), cx(1)] };
    case "range": {
      const n = Math.round(spec.n ?? 2);
      if (!Number.isFinite(n) || n < 1 || n > 9) return { error: "range needs n between 1 and 9" };
      const values: Cx[] = [];
      for (let k = -n; k <= n; k++) values.push(cx(k));
      return { values };
    }
    case "roots-of-unity": {
      const n = Math.round(spec.n ?? 3);
      if (!Number.isFinite(n) || n < 2 || n > 12) return { error: "roots of unity need n between 2 and 12" };
      const values: Cx[] = [];
      for (let k = 0; k < n; k++) {
        const t = (2 * Math.PI * k) / n;
        // Snap the tiny cos/sin residue to zero so the value tables and their permutations are exact.
        const re = Math.cos(t);
        const im = Math.sin(t);
        values.push(cx(Math.abs(re) < 1e-15 ? 0 : re, Math.abs(im) < 1e-15 ? 0 : im));
      }
      return { values: ordered(values) };
    }
    case "custom":
      return parseAlphabet(spec.custom ?? "");
    default:
      // Unreachable through the UI, and reachable through a LINK: a permalink is a string someone else
      // wrote, and a `preset` this version does not have must refuse rather than fall off the end of the
      // switch and return `undefined` for the caller to crash on. (Found by the permalink test.)
      return { error: `unknown alphabet "${String((spec as { preset: string }).preset)}"` };
  }
}

/** A stable id for a spec — the permalink's field and the stage's per-alphabet cache key. */
export function specId(spec: AlphabetSpec): string {
  switch (spec.preset) {
    case "range":
      return `range${Math.round(spec.n ?? 2)}`;
    case "roots-of-unity":
      return `unity${Math.round(spec.n ?? 3)}`;
    case "custom":
      return `custom:${(spec.custom ?? "").replace(/\s+/g, "")}`;
    default:
      return spec.preset;
  }
}

function labelOf(spec: AlphabetSpec, values: readonly Cx[]): string {
  switch (spec.preset) {
    case "littlewood":
      return "Littlewood {−1, +1}";
    case "zero-one":
      return "Newman {0, 1}";
    case "trinary":
      return "{−1, 0, +1}";
    case "range":
      return `{−${Math.round(spec.n ?? 2)}, …, ${Math.round(spec.n ?? 2)}}`;
    case "roots-of-unity":
      return `${Math.round(spec.n ?? 3)}-th roots of unity`;
    case "custom":
      return `{${values.map(formatCx).join(", ")}}`;
    default:
      return `{${values.map(formatCx).join(", ")}}`;
  }
}

/** Short display form of a value — `1`, `−1`, `i`, `1+i`, `0.5−0.5i`. */
export function formatCx(v: Cx): string {
  const r = Math.abs(v.re) < SAME ? 0 : v.re;
  const i = Math.abs(v.im) < SAME ? 0 : v.im;
  const num = (x: number): string => String(Number(x.toFixed(6))).replace("-", "−");
  if (i === 0) return num(r);
  const imPart = Math.abs(i) === 1 ? "i" : `${num(Math.abs(i))}i`;
  if (r === 0) return i > 0 ? imPart : `−${imPart}`;
  return `${num(r)}${i > 0 ? "+" : "−"}${imPart}`;
}

/**
 * Compile an alphabet spec: resolve its values, DERIVE its symmetries by checking them, and build the
 * permutation tables the enumeration runs on. Returns an error rather than a degraded alphabet.
 */
export function compileAlphabet(spec: AlphabetSpec): { alphabet: Alphabet } | { error: string } {
  const resolved = valuesOfSpec(spec);
  if ("error" in resolved) return resolved;
  const values = resolved.values;
  if (values.length < 2) return { error: "an alphabet needs at least two distinct values" };

  const nonZero: number[] = [];
  for (let j = 0; j < values.length; j++) {
    if (Math.abs(values[j].re) >= SAME || Math.abs(values[j].im) >= SAME) nonZero.push(j);
  }
  if (nonZero.length === 0) return { error: "no non-zero value — a proper polynomial needs one" };

  // Negation and conjugation: CHECKED, value by value.
  const negPerm: number[] = [];
  let hasNeg = true;
  for (const v of values) {
    const j = indexOf(values, cx(-v.re, -v.im));
    if (j < 0) {
      hasNeg = false;
      break;
    }
    negPerm.push(j);
  }
  const conjPerm: number[] = [];
  let hasConj = true;
  for (const v of values) {
    const j = indexOf(values, cx(v.re, -v.im));
    if (j < 0) {
      hasConj = false;
      break;
    }
    conjPerm.push(j);
  }
  const allReal = values.every((v) => Math.abs(v.im) < SAME);

  // Units: every candidate `b/a` over non-zero a, b, kept when it permutes the whole alphabet.
  const units: Cx[] = [];
  const unitPerm: number[][] = [];
  for (const ja of nonZero) {
    for (const jb of nonZero) {
      const a = values[ja];
      const den = a.re * a.re + a.im * a.im;
      const b = values[jb];
      const u = cx((b.re * a.re + b.im * a.im) / den, (b.im * a.re - b.re * a.im) / den);
      if (indexOf(units, u) >= 0) continue;
      const perm: number[] = [];
      let ok = true;
      for (const v of values) {
        const j = indexOf(values, mul(u, v));
        if (j < 0) {
          ok = false;
          break;
        }
        perm.push(j);
      }
      // "Maps into A" is not "permutes A": the constant map `u = 0` sends every value to `0 ∈ A`
      // without being a bijection. The candidates above are ratios of NON-ZERO values, so `u ≠ 0` and
      // multiplication by it is injective — which on a finite set already forces a bijection. Checked
      // rather than argued, because the argument is one edit away from being false.
      if (ok && new Set(perm).size === perm.length) {
        units.push(u);
        unitPerm.push(perm);
      }
    }
  }
  const one = indexOf(units, cx(1));
  if (one < 0) return { error: "internal: the identity is not a unit" }; // unreachable: 1 = a/a always permutes
  // Identity first, so `unitPerm[0]` is the no-op.
  if (one !== 0) {
    [units[0], units[one]] = [units[one], units[0]];
    [unitPerm[0], unitPerm[one]] = [unitPerm[one], unitPerm[0]];
  }

  // Constant-term representatives: the smallest digit index in each unit-orbit of the non-zero values.
  const normUnit = new Array<number>(values.length).fill(0);
  const leading: number[] = [];
  const claimed = new Set<number>();
  for (const j of nonZero) {
    if (claimed.has(j)) continue;
    leading.push(j);
    for (let u = 0; u < units.length; u++) {
      const image = unitPerm[u][j];
      if (!claimed.has(image)) {
        claimed.add(image);
        // The unit carrying `image` back to the representative `j` is the inverse of `u`.
        normUnit[image] = inverseUnitIndex(units, u);
      }
    }
  }

  const group = buildGroup(hasNeg, hasConj && !allReal);

  return {
    alphabet: {
      spec,
      id: specId(spec),
      label: labelOf(spec, values),
      values,
      allReal,
      units,
      hasNeg,
      hasConj,
      group,
      nonZero,
      leading,
      negPerm: hasNeg ? negPerm : [],
      conjPerm: hasConj ? conjPerm : [],
      unitPerm,
      normUnit,
    },
  };
}

/** The index of `units[u]⁻¹` within `units` (the unit set is a finite group, so it is there). */
function inverseUnitIndex(units: readonly Cx[], u: number): number {
  const v = units[u];
  const den = v.re * v.re + v.im * v.im;
  const inv = cx(v.re / den, -v.im / den);
  const j = indexOf(units, inv);
  return j < 0 ? 0 : j;
}

/** The reduction group as an explicit list, identity first. Reversal is always in; the others as given. */
export function buildGroup(neg: boolean, conj: boolean): SymmetryElement[] {
  const out: SymmetryElement[] = [];
  for (const c of conj ? [false, true] : [false]) {
    for (const n of neg ? [false, true] : [false]) {
      for (const r of [false, true]) out.push({ neg: n, rev: r, conj: c });
    }
  }
  // Identity first (it is already, given the loop order) — asserted rather than assumed.
  const idAt = out.findIndex((g) => !g.neg && !g.rev && !g.conj);
  if (idAt > 0) [out[0], out[idAt]] = [out[idAt], out[0]];
  return out;
}

/** Apply a group element to a point of the plane: the ROOT map induced by the coefficient map. */
export function mapRoot(g: SymmetryElement, re: number, im: number): { re: number; im: number } {
  let x = re;
  let y = im;
  if (g.conj) y = -y;
  if (g.rev) {
    const d = x * x + y * y;
    x = x / d;
    y = -y / d;
  }
  if (g.neg) {
    x = -x;
    y = -y;
  }
  return { re: x, im: y };
}

/** One line of the symmetry readout: a candidate, whether the alphabet has it, and what that means. */
export interface SymmetryLine {
  readonly name: "negation" | "reversal" | "conjugation" | "units";
  readonly holds: boolean;
  readonly text: string;
}

/**
 * The custom alphabet editor's readout: each candidate symmetry, decided, with its consequence for the
 * picture — and, when one FAILS, the value that breaks it, so the reader can see why rather than take
 * the app's word.
 *
 * **ADR-0046's plan quoted an example that cannot occur** — "reversal is not a symmetry, so `|z| > 1` is
 * computed with the reversed alphabet". Reversal holds for EVERY alphabet (reversing a vector over `A` is
 * a vector over `A`; see this file's header), which is exactly why every picture in the app is symmetric
 * under `z ↦ 1/z`. What varies between alphabets is negation, conjugation and the units, so those are
 * the lines that can say no, and reversal's line says why it never does.
 *
 * Every verdict is read off the compiled alphabet (`hasNeg`, `hasConj`, `units`), so the readout cannot
 * disagree with the reduction the sweep actually runs; the witnesses are recomputed here only to NAME
 * the failure.
 */
export function symmetryReadout(a: Alphabet): { lines: SymmetryLine[]; fold: number } {
  const has = (v: Cx): boolean => indexOf(a.values, v) >= 0;
  const lines: SymmetryLine[] = [];
  if (a.hasNeg) {
    lines.push({
      name: "negation",
      holds: true,
      text: "Negation holds (−A = A): the picture is symmetric under z ↦ −z, and half of it is drawn as the image of the other half.",
    });
  } else {
    const witness = a.values.find((v) => !has(cx(-v.re, -v.im)));
    lines.push({
      name: "negation",
      holds: false,
      text: `Negation fails: ${formatCx(witness ?? a.values[0])} is in the alphabet and ${formatCx(cx(-(witness?.re ?? 0), -(witness?.im ?? 0)))} is not, so the picture need not be symmetric under z ↦ −z, and both halves are computed.`,
    });
  }
  lines.push({
    name: "reversal",
    holds: true,
    text: "Reversal always holds: reversing a proper polynomial's coefficients gives another, whose roots are the reciprocals — so every picture here is symmetric under z ↦ 1/z.",
  });
  if (a.allReal) {
    lines.push({
      name: "conjugation",
      holds: true,
      text: "Every value is real, so each polynomial's roots come in conjugate pairs: the picture is mirror-symmetric about the real axis for free, with no reduction needed.",
    });
  } else if (a.hasConj) {
    lines.push({
      name: "conjugation",
      holds: true,
      text: "Conjugation holds (conj A = A): the picture is mirror-symmetric about the real axis, and the reduction uses it.",
    });
  } else {
    const witness = a.values.find((v) => !has(cx(v.re, -v.im)));
    const twist = conjugationTwist(a);
    lines.push(
      twist !== null
        ? {
            // **The mirror can hold when conjugation fails.** `{1, i, −1}` is not closed under conjugation
            // (conj i = −i is not in it), but conj A = −1·A, so `P ↦ c·conj(P)` stays in the family and
            // conjugates every root: the picture IS mirror-symmetric. The first draft of this readout said
            // "need not be", beside a picture that visibly was — found by looking at it.
            name: "conjugation",
            holds: true,
            text: `Conjugation alone fails (${formatCx(witness ?? a.values[0])} is in the alphabet and its conjugate is not), but conj A = ${formatCx(twist)}·A, so conjugating a polynomial and multiplying by ${formatCx(twist)} stays in the family and conjugates its roots: the picture IS mirror-symmetric about the real axis. The reduction does not use this twisted form, so both halves are computed.`,
          }
        : {
            name: "conjugation",
            holds: false,
            text: `Conjugation fails: ${formatCx(witness ?? a.values[0])} is in the alphabet and its conjugate ${formatCx(cx(witness?.re ?? 0, -(witness?.im ?? 0)))} is not, and no scalar multiple of the alphabet is its conjugate either, so the picture need not be mirror-symmetric about the real axis.`,
          },
    );
  }
  const n = a.units.length;
  lines.push({
    name: "units",
    holds: n > 1,
    text:
      n > 1
        ? `${n} units (${a.units.map(formatCx).join(", ")}): P and u·P have the same roots, so one polynomial in each set of ${n} is solved.`
        : "Only the unit 1: no two polynomials over this alphabet are multiples of each other by a unit, so none are skipped for it.",
  });
  // Each solved polynomial stands for up to `units × |G|` — exactly that many unless a symmetry FIXES it,
  // in which case its stabiliser weight accounts for the difference (`orbits.ts`).
  return { lines, fold: n * a.group.length };
}

/**
 * A scalar `c` with `conj(A) = c·A`, or null. Then `c⁻¹·conj(P)` has
 * coefficients in `A` and the roots of `conj(P)`, so the family's root set is closed under `z ↦ z̄`
 * even though `A` itself is not. Candidates are the ratios `conj(v)/w` of a fixed non-zero `v` to every
 * non-zero `w`, since `c` must carry some `w` to `conj(v)`.
 */
export function conjugationTwist(a: Alphabet): Cx | null {
  const conjA = a.values.map((v) => cx(v.re, -v.im));
  const v0 = a.values[a.nonZero[0]];
  const target = cx(v0.re, -v0.im);
  for (const j of a.nonZero) {
    const w = a.values[j];
    const den = w.re * w.re + w.im * w.im;
    // c = conj(v0) / w
    const c = cx((target.re * w.re + target.im * w.im) / den, (target.im * w.re - target.re * w.im) / den);
    const image = a.values.map((v) => mul(c, v));
    // Both inclusions, though one suffices: `c ≠ 0` is injective and both sets have |A| elements, so
    // `c·A ⊆ conj A` already forces equality — the M6.3 sweep's one equivalent mutant. Kept for the
    // reason `compileAlphabet` keeps its permutation check: the argument is an edit away from false.
    if (image.every((x) => indexOf(conjA, x) >= 0) && conjA.every((x) => indexOf(image, x) >= 0)) return c;
  }
  return null;
}
