// **THE `#vs=` PERMALINK.** The shell's state in a URL, and back again.
//
// On `@cas/interchange`'s app-namespaced, forward-compatible view-state envelope, which is the
// eight-app house idiom — this app owns the SCHEMA, interchange owns the transport and the
// versioning, and neither owns any DOM.
//
// **WHY THIS FILE IS A CORRECTNESS SURFACE AND NOT A CONVENIENCE.** In every other app in the suite
// a dropped view-state field means a slightly different picture. In this one it means the app draws
// the SAME contour and computes a DIFFERENT integral — M5.1's shadowed-`branch` bug, where changing
// the determination moved the answer while leaving the cut where it was. So three rules hold here
// that a slider-bag codec does not need:
//
//   1. **A malformed link REFUSES BY NAME** rather than decoding to defaults. Silently opening
//      something plausible instead of what was shared is the failure mode; {@link decodeShell}
//      separates "no link" (`null`, keep the defaults) from "a link I cannot honour" (a reason the
//      shell shows).
//   2. **The round trip is checked BY VERDICT** — encode, decode, re-run, and compare the closed
//      form and the ledger's claims, not the fields. Field-by-field equality would have passed that
//      bug. `test/viewState.test.ts` does it over the whole corpus.
//   3. **A declaration whose branch point is not in the link is refused.** That is M6.1a's bug in
//      permalink form: with the point missing, `declaredOrder()` goes null, the factor is silently
//      dropped, and the box's COFACTOR is integrated as though it were the whole integrand.
//
// **THE CONTOUR IS NEVER SERIALISED AS GEOMETRY**, in either mode. Research 07 §6 asks for
// semantics rather than samples, and `engine/contour/model.ts` already has no sampled-point
// representation at all — so that half needs no code here. This goes one level further up: in
// gallery mode the contour is DERIVED from `(record, fixture, bindings, geometry)` and is carried as
// nothing; in the sandbox it is carried as the RECIPE that produced it. M6.2a measured why — the
// piece list is 1,098 of the worst case's 2,159 JSON bytes, putting that link at 2,838 B of URL
// against research 07's ~2 kB warning, where the recipe lands it at 1,078 B. Rounding floats, which
// M6.0 expected to be the headroom, is worth 4%: the bulk is structural, not decimal.
import { decodeViewState, encodeViewState } from "@cas/interchange";
import { Frac } from "@cas/exact";
import { setParam, translateContour } from "../engine/contour/edit.js";
import type { Contour } from "../engine/contour/model.js";
import type { Bindings } from "../families/schema.js";
import type { BranchChoice, BranchPoint, CutArc } from "../kernel/branch/model.js";
import type { Cx } from "../kernel/geom.js";
import type { ContrastMode } from "../ui/accumulator.js";
import { defaultState, offeredCorpus, type ContourSource, type ShellState } from "./state.js";
import { TEMPLATES, type TemplateId } from "./templates.js";

/** This app's namespace in the shared envelope. */
const APP = "ci";

/**
 * The state the link is a DIFF against.
 *
 * Built here from `TEMPLATES[0]` rather than handed in, so "the default" is one fact. Every field a
 * link omits takes its value from this, which is what makes a gallery link 42 bytes of JSON.
 */
const defaults = (): ShellState => defaultState(TEMPLATES[0].build());

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The wire shape.
//
// Keys are short because they are in a URL and M6.2a says the budget is real; each is named here so
// the abbreviation never has to be guessed from a call site.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A `Frac` on the wire: `"n/d"`, exact, never a decimal. */
type FracWire = string;

interface DeclarationWire {
  /** `pointId` — which declared branch point carries the factor. */
  readonly p: string;
  /** `window` — the argument determination, in units of π. */
  readonly w: readonly [FracWire, FracWire];
  /** `sign` — `+1` for `(z − b)`, `−1` for `(b − z)`: the same number, not the same power. */
  readonly s: 1 | -1;
  /** `constant` — `c` in `c·(s(z−b))^α·R(z)`. */
  readonly k: readonly [number, number];
  /** `logPower` — `m` in `log^m`. */
  readonly l: number;
}

interface PointWire {
  readonly i: string;
  readonly at: readonly [number, number];
  /** The exponent, or `"log"` for infinite-order monodromy. */
  readonly a: FracWire | "log";
  /** The label. Carried rather than re-derived: `addBranchPoint` owns that formula, and computing it
   *  in a second place is how the two drift. */
  readonly l: string;
}

interface CutWire {
  readonly i: string;
  readonly f: string;
  readonly t: string;
  readonly v: readonly (readonly [number, number])[];
}

interface BranchWire {
  readonly cv: BranchChoice["convention"];
  readonly pt: readonly PointWire[];
  readonly ct: readonly CutWire[];
  readonly bp: readonly [number, number];
  readonly sk: number;
  readonly sh?: boolean;
}

/** The sandbox contour, as what PRODUCED it. */
interface ContourWire {
  /** The template id. */
  readonly t: TemplateId;
  /** Parameter values, when any differs from the template's own. */
  readonly p?: Readonly<Record<string, number>>;
  /** The accumulated rigid translation, when non-zero. */
  readonly d?: readonly [number, number];
}

/** Every field optional: absent means "the default", which is the whole of diff-from-defaults. */
interface Wire {
  /** `mode`. Absent means the sandbox, which is what the app boots into. */
  readonly m?: "g";
  // ── gallery ──
  readonly r?: string;
  readonly f?: number;
  readonly bi?: Bindings;
  readonly ge?: Readonly<Record<string, number>>;
  // ── sandbox ──
  /** The integrand box — the COFACTOR `R(z)` when a factor is declared. */
  readonly e?: string;
  readonly c?: ContourWire;
  readonly dc?: DeclarationWire;
  /** What the box held when the factor was declared — the split check's reference. */
  readonly bd?: string;
  readonly br?: BranchWire;
  // ── view: none of this can change a number ──
  /** `[centre x, centre y, halfHeight]`. */
  readonly v?: readonly [number, number, number];
  readonly k?: ContrastMode;
  readonly s?: number;
  readonly i?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Encoding.
// ──────────────────────────────────────────────────────────────────────────────────────────────

const fracOut = (f: Frac): FracWire => `${f.n}/${f.d}`;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const paramValues = (c: Contour): Record<string, number> =>
  Object.fromEntries(Object.values(c.params).map((p) => [p.name, p.value]));

export type EncodeResult =
  | { readonly ok: true; readonly hash: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Rebuild a contour from its recipe. The one function both halves go through, so encode's check and
 * decode's restoration cannot disagree about what a recipe MEANS.
 */
function fromRecipe(wire: ContourWire): Contour | null {
  const template = TEMPLATES.find((t) => t.id === wire.t);
  if (template === undefined) return null;
  let contour = template.build();
  for (const [name, value] of Object.entries(wire.p ?? {})) {
    if (contour.params[name] === undefined) return null;
    contour = setParam(contour, name, value);
  }
  const d = wire.d;
  return d === undefined ? contour : translateContour(contour, [d[0], d[1]]);
}

/** The sandbox contour as a recipe — and VERIFIED to reproduce it, or no link at all. */
function contourOut(
  contour: Contour,
  source: ContourSource | null,
): { readonly ok: true; readonly wire: ContourWire } | { readonly ok: false; readonly reason: string } {
  if (source === null) {
    return {
      ok: false,
      reason:
        "this contour did not come from a template, so there is no recipe to put in a link. " +
        "Serialising its pieces is the pen tool's job (M7) and is deliberately not built yet — a " +
        "link that carried geometry for a shape nothing can yet produce would be untested code on " +
        "the one surface where a dropped field changes the answer",
    };
  }
  const template = TEMPLATES.find((t) => t.id === source.template);
  if (template === undefined) {
    return { ok: false, reason: `unknown contour template '${source.template}'` };
  }
  const fresh = template.build();
  const values = paramValues(contour);
  const p = same(values, paramValues(fresh)) ? undefined : values;
  const moved = source.shift[0] !== 0 || source.shift[1] !== 0;
  const wire: ContourWire = {
    t: source.template,
    ...(p === undefined ? {} : { p }),
    ...(moved ? { d: [source.shift[0], source.shift[1]] as const } : {}),
  };
  // **The recipe is PROVENANCE, and provenance is a claim.** Rebuild it and compare: if the
  // reconstruction is not the contour on screen, the link would reopen a different shape, and
  // refusing is the only honest answer. This is what makes `contourSource` falsifiable rather than
  // merely believed — the same posture the ledger takes to a record's own declarations.
  const rebuilt = fromRecipe(wire);
  if (rebuilt === null || !same(rebuilt.pieces, contour.pieces)) {
    return {
      ok: false,
      reason:
        `the contour's recipe (template '${source.template}', shift ` +
        `[${source.shift[0]}, ${source.shift[1]}]) does not rebuild the contour on screen, so a ` +
        "link made from it would open a different one",
    };
  }
  return { ok: true, wire };
}

const branchOut = (b: BranchChoice): BranchWire => ({
  cv: b.convention,
  pt: b.points.map((p) => ({
    i: p.id,
    at: [p.at[0], p.at[1]] as const,
    a: p.order.kind === "log" ? ("log" as const) : fracOut(p.order.alpha),
    l: p.label,
  })),
  ct: b.cuts.map((c) => ({
    i: c.id,
    f: c.from,
    t: c.to,
    v: c.via.map((q) => [q[0], q[1]] as const),
  })),
  bp: [b.basePoint[0], b.basePoint[1]] as const,
  sk: b.sheet,
  ...(b.shadow === true ? { sh: true } : {}),
});

/**
 * The state as a `#vs=` fragment, or a reason there cannot be one.
 *
 * Gallery mode carries `{record, fixture}` and whatever overrides have been moved — and **no
 * contour**, because the record derives it (M6.1's finding). The sandbox carries its box, its
 * contour's recipe, its declaration and its cut system. Both carry the view.
 */
export function encodeShell(state: ShellState): EncodeResult {
  const d = defaults();
  const wire: Record<string, unknown> = {};
  const put = <K extends keyof Wire>(k: K, v: Wire[K], def?: unknown): void => {
    if (!same(v, def)) wire[k] = v;
  };

  if (state.mode === "gallery") {
    wire.m = "g";
    if (state.record === null) {
      return { ok: false, reason: "gallery mode with no record open — there is nothing to link to" };
    }
    wire.r = state.record;
    put("f", state.fixture, 0);
    put("bi", state.bindings, {});
    put("ge", state.geometry, {});
  } else {
    put("e", state.expr, d.expr);
    const c = contourOut(state.contour, state.contourSource);
    if (!c.ok) return c;
    if (!same(c.wire, { t: TEMPLATES[0].id })) wire.c = c.wire;
    if (state.declaration !== null) {
      const dec = state.declaration;
      wire.dc = {
        p: dec.pointId,
        w: [fracOut(dec.window[0]), fracOut(dec.window[1])],
        s: dec.sign,
        k: [dec.constant[0], dec.constant[1]],
        l: dec.logPower,
      };
    }
    if (state.beforeDeclaration !== null) wire.bd = state.beforeDeclaration;
    if (state.branch.points.length > 0 || state.branch.shadow === true) {
      wire.br = branchOut(state.branch);
    }
    // The record the picker is on outlives a trip to the sandbox, so it rides along — but only when
    // one is open, and never as a claim that the app is in gallery mode.
    if (state.record !== null) {
      wire.r = state.record;
      put("f", state.fixture, 0);
    }
  }

  put("v", [state.view.center[0], state.view.center[1], state.view.halfHeight] as const, [
    d.view.center[0],
    d.view.center[1],
    d.view.halfHeight,
  ]);
  put("k", state.contrast, d.contrast);
  put("s", state.scrub, d.scrub);
  put("i", state.iso ?? undefined, undefined);

  return { ok: true, hash: encodeViewState(APP, wire) };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Decoding. Every reader is defensive: a field of the wrong shape refuses the whole link rather
// than being skipped, because a link that decodes to three-quarters of what was shared is the
// failure this codec exists to prevent.
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type DecodeResult =
  | { readonly ok: true; readonly state: ShellState }
  | { readonly ok: false; readonly reason: string };

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isPair = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);

/** `"n/d"` back to a `Frac`, or null. `BigInt("x")` throws, so the parse is guarded. */
function fracIn(x: unknown): Frac | null {
  if (!isStr(x)) return null;
  const m = /^(-?\d+)\/(\d+)$/.exec(x);
  if (m === null) return null;
  try {
    const d = BigInt(m[2]);
    return d === 0n ? null : Frac.of(BigInt(m[1]), d);
  } catch {
    return null;
  }
}

function branchIn(x: unknown): BranchChoice | null {
  if (x === null || typeof x !== "object") return null;
  const b = x as Record<string, unknown>;
  if (b.cv !== "principal" && b.cv !== "zeroToTwoPi" && b.cv !== "custom") return null;
  if (!Array.isArray(b.pt) || !Array.isArray(b.ct) || !isPair(b.bp) || !isNum(b.sk)) return null;
  const points: BranchPoint[] = [];
  for (const raw of b.pt) {
    if (raw === null || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    if (!isStr(p.i) || !isPair(p.at) || !isStr(p.l)) return null;
    if (p.a === "log") {
      points.push({ id: p.i, at: p.at, order: { kind: "log" }, label: p.l });
    } else {
      const alpha = fracIn(p.a);
      if (alpha === null) return null;
      points.push({ id: p.i, at: p.at, order: { kind: "power", alpha }, label: p.l });
    }
  }
  const cuts: CutArc[] = [];
  for (const raw of b.ct) {
    if (raw === null || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (!isStr(c.i) || !isStr(c.f) || !isStr(c.t) || !Array.isArray(c.v)) return null;
    const via: Cx[] = [];
    for (const q of c.v) {
      if (!isPair(q)) return null;
      via.push(q);
    }
    cuts.push({ id: c.i, from: c.f, to: c.t, via });
  }
  return {
    convention: b.cv,
    points,
    cuts,
    basePoint: b.bp,
    sheet: b.sk,
    ...(b.sh === true ? { shadow: true } : {}),
  };
}

/**
 * A `#vs=` link back into a shell state, or a named refusal. `null` means there was no link at all,
 * which is not an error: the app keeps its defaults.
 */
export function decodeShell(hashOrLink: string): DecodeResult | null {
  const env = decodeViewState(hashOrLink);
  if (env === null) {
    // Distinguish "nothing to decode" from "something that is not ours or is broken". A hash that
    // announces itself as a view state and then fails the envelope check is a refusal, not silence.
    return /(?:[#&?]|^)vs=/.test(hashOrLink)
      ? { ok: false, reason: "this link carries a view state that could not be read — it may be truncated" }
      : null;
  }
  if (env.app !== APP) {
    return { ok: false, reason: `this link belongs to another app in the suite ('${env.app}'), not to Contour Integration` };
  }
  const w = env.state as Record<string, unknown>;
  const base = defaults();
  const gallery = w.m === "g";

  // ── the record, checked against the LOADER ──
  let record: string | null = null;
  let fixture = 0;
  if (w.r !== undefined) {
    if (!isStr(w.r)) return { ok: false, reason: "the record id in this link is not a string" };
    const fam = offeredCorpus().tiers.flatMap((t) => t.families).find((q) => q.id === w.r);
    if (fam === undefined) {
      return {
        ok: false,
        reason:
          `this link names the gallery record '${w.r}', which this build does not have — either it ` +
          "was renamed, or it failed one of the loader's invariants and was dropped",
      };
    }
    record = fam.id;
    if (w.f !== undefined) {
      if (!isNum(w.f) || !Number.isInteger(w.f) || w.f < 0 || w.f >= fam.golden.length) {
        return { ok: false, reason: `this link names fixture ${String(w.f)} of '${fam.id}', which has ${fam.golden.length}` };
      }
      fixture = w.f;
    }
  } else if (gallery) {
    return { ok: false, reason: "this link says gallery mode but names no record" };
  }

  // ── the contour: a recipe in the sandbox, derived from the record in gallery mode ──
  let contour = base.contour;
  let contourSource: ContourSource | null = base.contourSource;
  if (!gallery && w.c !== undefined) {
    const raw = w.c;
    if (raw === null || typeof raw !== "object") return { ok: false, reason: "the contour in this link is not an object" };
    const c = raw as Record<string, unknown>;
    if (!isStr(c.t) || !TEMPLATES.some((t) => t.id === c.t)) {
      return { ok: false, reason: `this link names the contour template '${String(c.t)}', which this build does not have` };
    }
    const params: Record<string, number> = {};
    if (c.p !== undefined) {
      if (c.p === null || typeof c.p !== "object") return { ok: false, reason: "the contour's parameters in this link are not an object" };
      for (const [k, v] of Object.entries(c.p as Record<string, unknown>)) {
        if (!isNum(v)) return { ok: false, reason: `the contour parameter '${k}' in this link is not a finite number` };
        params[k] = v;
      }
    }
    if (c.d !== undefined && !isPair(c.d)) return { ok: false, reason: "the contour's shift in this link is not a pair of numbers" };
    const wire: ContourWire = {
      t: c.t as TemplateId,
      ...(c.p === undefined ? {} : { p: params }),
      ...(c.d === undefined ? {} : { d: c.d as [number, number] }),
    };
    const built = fromRecipe(wire);
    if (built === null) {
      return { ok: false, reason: `the contour recipe in this link names a parameter template '${wire.t}' does not have` };
    }
    contour = built;
    contourSource = { template: wire.t, shift: c.d === undefined ? [0, 0] : (c.d as [number, number]) };
  }

  // ── the cut system, then the declaration that must name a point in it ──
  let branch = base.branch;
  if (!gallery && w.br !== undefined) {
    const b = branchIn(w.br);
    if (b === null) return { ok: false, reason: "the cut system in this link could not be read" };
    branch = b;
  }
  let declaration: ShellState["declaration"] = null;
  if (!gallery && w.dc !== undefined) {
    const raw = w.dc;
    if (raw === null || typeof raw !== "object") return { ok: false, reason: "the declaration in this link is not an object" };
    const dc = raw as Record<string, unknown>;
    const lo = Array.isArray(dc.w) ? fracIn(dc.w[0]) : null;
    const hi = Array.isArray(dc.w) ? fracIn(dc.w[1]) : null;
    if (!isStr(dc.p) || lo === null || hi === null || !isPair(dc.k) || !isNum(dc.l)) {
      return { ok: false, reason: "the declared factor in this link could not be read" };
    }
    if (dc.s !== 1 && dc.s !== -1) return { ok: false, reason: "the declared factor's orientation in this link is neither +1 nor −1" };
    // **M6.1a's bug in permalink form.** With the point absent, `declaredOrder()` goes null, the
    // factor is silently dropped, and the box's COFACTOR is integrated as the whole integrand with a
    // plausible number beside it. Refusing names it instead.
    if (!branch.points.some((q) => q.id === dc.p)) {
      return {
        ok: false,
        reason:
          `this link declares a branch factor on '${dc.p}', which is not one of the branch points ` +
          "it carries — so the factor could not be read and the cofactor in the box would be " +
          "integrated as though it were the whole integrand",
      };
    }
    declaration = { pointId: dc.p, window: [lo, hi], sign: dc.s, constant: dc.k, logPower: dc.l };
  }

  // ── the box, the overrides and the view ──
  let expr = base.expr;
  if (!gallery && w.e !== undefined) {
    if (!isStr(w.e)) return { ok: false, reason: "the integrand in this link is not a string" };
    expr = w.e;
  }
  let beforeDeclaration: string | null = null;
  if (!gallery && w.bd !== undefined) {
    if (!isStr(w.bd)) return { ok: false, reason: "the pre-declaration integrand in this link is not a string" };
    beforeDeclaration = w.bd;
  }
  const bindings: Record<string, string | number | boolean> = {};
  if (w.bi !== undefined) {
    if (w.bi === null || typeof w.bi !== "object") return { ok: false, reason: "the bindings in this link are not an object" };
    for (const [k, v] of Object.entries(w.bi as Record<string, unknown>)) {
      if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") {
        return { ok: false, reason: `the binding '${k}' in this link is not a number, string or boolean` };
      }
      if (typeof v === "number" && !Number.isFinite(v)) {
        return { ok: false, reason: `the binding '${k}' in this link is not finite` };
      }
      bindings[k] = v;
    }
  }
  const geometry: Record<string, number> = {};
  if (w.ge !== undefined) {
    if (w.ge === null || typeof w.ge !== "object") return { ok: false, reason: "the geometry overrides in this link are not an object" };
    for (const [k, v] of Object.entries(w.ge as Record<string, unknown>)) {
      if (!isNum(v)) return { ok: false, reason: `the geometry override '${k}' in this link is not a finite number` };
      geometry[k] = v;
    }
  }
  let view = base.view;
  if (w.v !== undefined) {
    const v = w.v;
    if (!Array.isArray(v) || v.length !== 3 || !isNum(v[0]) || !isNum(v[1]) || !isNum(v[2]) || v[2] <= 0) {
      return { ok: false, reason: "the camera in this link is not [x, y, halfHeight] with a positive height" };
    }
    view = { center: [v[0], v[1]], halfHeight: v[2] };
  }
  const CONTRASTS: readonly ContrastMode[] = ["none", "sumZ", "sumFz", "sumDz"];
  let contrast = base.contrast;
  if (w.k !== undefined) {
    if (!isStr(w.k) || !CONTRASTS.includes(w.k as ContrastMode)) {
      return { ok: false, reason: `this link names the comparison '${String(w.k)}', which this build does not have` };
    }
    contrast = w.k as ContrastMode;
  }
  let scrub = base.scrub;
  if (w.s !== undefined) {
    if (!isNum(w.s) || w.s < 0 || w.s > 1) return { ok: false, reason: "the scrub position in this link is not a number in [0, 1]" };
    scrub = w.s;
  }
  let iso = base.iso;
  if (w.i !== undefined) {
    if (typeof w.i !== "boolean") return { ok: false, reason: "the modulus-contour flag in this link is not a boolean" };
    iso = w.i;
  }

  return {
    ok: true,
    state: {
      mode: gallery ? "gallery" : "sandbox",
      expr,
      declaration,
      beforeDeclaration,
      branch,
      contour,
      contourSource,
      record,
      fixture,
      bindings: bindings as Bindings,
      geometry,
      view,
      contrast,
      scrub,
      iso,
      // The parked sandbox contour is SESSION state, not the problem: a link opens with the contour
      // it names parked as the sandbox's, so coming back from a record lands somewhere meaningful.
      sandboxContour: gallery ? base.contour : contour,
    },
  };
}
