// The tour (PLAN §7 PRA-10): Arnold's proof of Abel–Ruffini in a lecturer's order, as a sequence of
// STATES. Each step opens a state the app then computes on — a sandbox polynomial or a ladder rung
// with a formula and a word, exactly the states PRA-8 already addresses by permalink — so the tour
// adds no mathematics of its own: it chooses what to open and in what order.
//
// **Every factual sentence about a step's state is a certificate read off the computation.** The
// lecture's prose (vocabulary.ts `TOUR`) says what is general and true; `claims` says what THIS state
// shows, through the same certify functions the cards use; and a prediction's right answer is derived
// from the same run — the tour never holds an answer of its own, so it cannot drift from the engine.
import type { Certificate } from "@cas/rigor";
import {
  derivedCert,
  discCerts,
  galoisCerts,
  ladderVerdict,
  radicalCert,
} from "../engine/certify.js";
import { rung, symmetricDerived, type RungDegree } from "../engine/ladder/rungs.js";
import type { LadderRun } from "../engine/ladder/run.js";
import { permText } from "../engine/ladder/word.js";
import type { GaloisEvidence } from "../engine/galois/tier0.js";
import { TOUR } from "../engine/vocabulary.js";
import {
  frame,
  ladderPolynomial,
  resolveState,
  type Resolution,
  type ShellState,
} from "./state.js";

/** What a step is judged against: the state's resolution, and the Galois card's evidence. */
export interface TourContext {
  readonly res: Resolution;
  readonly galois: GaloisEvidence | null;
}

type StepId = keyof typeof TOUR.steps;

export type Opens =
  | { readonly kind: "sandbox"; readonly text: string }
  | {
      readonly kind: "ladder";
      readonly rung: RungDegree;
      /** A gallery id (`#cardano`) or a formula's text. */
      readonly formula: string;
      readonly word: string;
    };

export interface TourStep {
  readonly id: StepId;
  readonly opens: Opens;
  /** What this state shows, as certificates — empty until there is something computed to show. */
  readonly claims: (ctx: TourContext) => Certificate[];
  /** The right choice, derived from the run; null when there is nothing to grade against yet. */
  readonly answer?: (ctx: TourContext) => number | null;
}

const run = (ctx: TourContext): LadderRun | null =>
  ctx.res.ladder?.ok && ctx.res.ladder.run.evaluation.ok ? ctx.res.ladder.run : null;

const verdict = (ctx: TourContext): Certificate[] => {
  const r = ctx.res.ladder;
  if (!r?.ok) return [];
  return [ladderVerdict(r.run, permText(r.run.composed))];
};

/** The radical at `level` (the first such), measured along the step's word. */
function radicalAt(ctx: TourContext, level: number) {
  const r = run(ctx);
  if (!r || !r.evaluation.ok) return null;
  const ev = r.evaluation;
  const o = ev.radicals.find((x) => x.radical.level === level);
  return o ? { o, samples: ev.samples, halvings: ev.halvings } : null;
}

const derived = (n: number): Certificate => {
  const d = symmetricDerived(n);
  return derivedCert(d.orders);
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "roots",
    opens: { kind: "sandbox", text: "z^5 - z - 1" },
    claims: (ctx) => (ctx.res.discs ? discCerts(ctx.res.discs) : []),
  },
  {
    id: "swap",
    opens: { kind: "ladder", rung: 3, formula: "-a2/3", word: "d0" },
    claims: verdict,
    answer: (ctx) => {
      const r = run(ctx);
      return r && r.evaluation.ok ? (r.evaluation.closes ? 0 : 1) : null;
    },
  },
  {
    id: "sqrt",
    opens: { kind: "ladder", rung: 2, formula: "#quadratic", word: "d0" },
    claims: (ctx) => {
      const x = radicalAt(ctx, 1);
      return x ? [radicalCert(x.o, x.samples, x.halvings)] : [];
    },
    answer: (ctx) => {
      const x = radicalAt(ctx, 1);
      return x ? (x.o.closes ? 0 : 1) : null;
    },
  },
  {
    id: "commutator",
    opens: { kind: "ladder", rung: 3, formula: "sqrt(disc)", word: "d1" },
    claims: verdict,
    answer: (ctx) => {
      const x = radicalAt(ctx, 1);
      return x ? (x.o.closes ? 0 : 1) : null;
    },
  },
  {
    id: "cardano",
    opens: { kind: "ladder", rung: 3, formula: "#cardano", word: "d1" },
    claims: (ctx) => {
      const x = radicalAt(ctx, 2);
      return x ? [radicalCert(x.o, x.samples, x.halvings), ...verdict(ctx)] : [];
    },
    answer: (ctx) => {
      const x = radicalAt(ctx, 2);
      return x ? (x.o.closes ? 0 : 1) : null;
    },
  },
  {
    id: "cubicDone",
    opens: { kind: "ladder", rung: 3, formula: "#cardano", word: "d2" },
    claims: (ctx) => [...verdict(ctx), derived(3)],
  },
  {
    id: "quartic",
    opens: { kind: "ladder", rung: 4, formula: "#ferrari", word: "d2" },
    claims: (ctx) => [...verdict(ctx), derived(4)],
  },
  {
    id: "quintic",
    opens: { kind: "ladder", rung: 5, formula: "#q2", word: "d2" },
    claims: verdict,
    answer: (ctx) => {
      const r = run(ctx);
      return r && r.evaluation.ok ? (r.evaluation.closes ? 0 : 1) : null;
    },
  },
  {
    id: "everyDepth",
    opens: { kind: "ladder", rung: 5, formula: "#q3", word: "d3" },
    claims: (ctx) => [...verdict(ctx), derived(5)],
  },
  {
    id: "galois",
    opens: { kind: "sandbox", text: "z^5 - z - 1" },
    claims: (ctx) => {
      const ev = ctx.galois;
      if (!ev?.ok || !ev.irreducible) return [];
      const f = ev.factors[0];
      return f.galois ? [galoisCerts(f.galois, f.degree, ev.irreducible).group] : [];
    },
  },
];

/** A gallery id (`#cardano`) or a formula's own text, as the formula's text. */
function formulaText(d: RungDegree, f: string): string {
  if (!f.startsWith("#")) return f;
  const g = rung(d).formulas.find((x) => x.id === f.slice(1));
  if (!g) throw new Error(`no formula ${f} on rung ${d}`);
  return g.text;
}

/** The state step `k` opens, built over `base` (its cameras framed to what it shows). */
export function tourState(k: number, base: ShellState): ShellState {
  return openState(TOUR_STEPS[k].opens, { ...base, tour: k });
}

/**
 * A sandbox polynomial (over ℚ) or a ladder rung with a formula and a word, opened over `base` with its
 * cameras framed — what a tour step or a classic opens. The tour and the drill are `base`'s to set; the
 * family, the loop, the overlay and the correspondence are closed, since each belongs to another state.
 */
export function openState(o: Opens, base: ShellState): ShellState {
  const common: ShellState = {
    ...base,
    drill: null,
    family: null,
    loop: null,
    overlay: false,
    lattice: false,
  };
  if (o.kind === "sandbox") {
    const next: ShellState = {
      ...common,
      ladder: null,
      ring: "Q",
      coefficient: 0,
      poly: { kind: "text", text: o.text },
    };
    const res = resolveState(next);
    return res.poly
      ? { ...next, rootCam: frame(res.poly.roots), coeffCam: frame(res.poly.coeffs) }
      : next;
  }
  const ladder = { rung: o.rung, formula: formulaText(o.rung, o.formula), word: o.word };
  const p = ladderPolynomial(ladder);
  return {
    ...common,
    ring: "C",
    coefficient: null,
    ladder,
    poly: p ? { kind: "roots", roots: p.roots, lead: [1, 0] } : base.poly,
    ...(p ? { rootCam: frame(p.roots), coeffCam: frame(p.coeffs) } : {}),
  };
}

/** Whether `s` still shows what step `k` opened (the reader may have edited it away). */
export function onTourStep(k: number, s: ShellState): boolean {
  const o = TOUR_STEPS[k].opens;
  if (s.family) return false;
  if (o.kind === "sandbox")
    return s.ladder === null && s.poly.kind === "text" && s.poly.text === o.text;
  return (
    s.ladder !== null &&
    s.ladder.rung === o.rung &&
    s.ladder.formula === formulaText(o.rung, o.formula) &&
    s.ladder.word === o.word
  );
}
