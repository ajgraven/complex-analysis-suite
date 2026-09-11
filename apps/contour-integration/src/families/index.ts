// The Family loader and DESIGN.md §5's four invariants.
//
// GALLERY.md §5 sets the terms: the 28 records are the engine's specification, and "any that cannot
// be implemented as written is a finding about the schema, not about the entry". The loader is where
// that becomes enforceable — every `check`, `detect` and `discharge` string is data until something
// insists it is well-formed.
//
// A FAILING RECORD IS DROPPED, NOT THROWN ON. The four invariants are assertions about the corpus,
// so a violation is a bug in the repository and the test suite fails on it. But a bug in one record
// must not take the app down with it, and — more importantly — must not let that record present
// itself as a worked example. Dropping it is the same refusal discipline the rest of the engine runs
// on: withhold the thing that cannot be stood behind, and say why.
import { parse } from "@cas/expr";
import type { Family } from "./schema.js";
import { BONUS_ZERO, bonusMagnitudes, buildSystem } from "./system.js";
import { a1CircleLinearCos } from "./records/a1-circle-linear-cos.js";
import { a2CirclePoisson } from "./records/a2-circle-poisson.js";
import { a3CircleCosNTheta } from "./records/a3-circle-cos-n-theta.js";
import { a5SemicircleOrder2 } from "./records/a5-semicircle-order2.js";
import { a6SemicircleQuartic } from "./records/a6-semicircle-quartic.js";
import { a7SemicircleOrder3 } from "./records/a7-semicircle-order3.js";

export type { Family, FamilyPiece, FamilyTarget, Golden, LemmaId, TemplateId } from "./schema.js";
export { buildSystem, exactConstant, type FamilySystem } from "./system.js";
export { solveExact, applyCombination, type SolveReport, type RatMatrix } from "./linear.js";

/**
 * The records, in gallery order.
 *
 * Tier A less A4, and deliberately so: these are the families the engine can run end to end today.
 * A1–A3 arrived with the `z = e^{iθ}` substitution; **A4 is not here** because its integrand
 * `e^{cos θ} cos(sin θ − nθ)` complexifies to `e^z/(i z^{n+1})`, whose exact residue is the Taylor
 * coefficient of an ENTIRE function — `1/n!` — and the residue engine's exact path stops at rational
 * functions over ℚ(i) and one quadratic extension. A4 needs a known-entire-function series table,
 * which is its own piece of work. Tier B needs the Jordan branch wired to a family; C–G need
 * indentation, branch cuts and the kernel families of M4/M5. A record loaded before its machinery
 * exists would be a worked example that cannot be worked.
 */
export const FAMILIES: readonly Family[] = [
  a1CircleLinearCos,
  a2CirclePoisson,
  a3CircleCosNTheta,
  a5SemicircleOrder2,
  a6SemicircleQuartic,
  a7SemicircleOrder3,
];

/**
 * The predicate namespaces the corpus uses. Not `@cas/expr` — see `checkWellFormed`.
 *
 * `algebraic` runs in exact arithmetic, `numeric` on the computed value, `structural` on the shape
 * of the contour or the pole set, `symbolic` on the expression itself.
 */
const PREDICATE_NAMESPACES: ReadonlySet<string> = new Set([
  "algebraic",
  "numeric",
  "structural",
  "symbolic",
]);

/** Which of DESIGN §5's numbered invariants failed, or the well-formedness that precedes them. */
export type InvariantId = 1 | 2 | 3 | 4 | "well-formed";

export interface Violation {
  readonly family: string;
  readonly invariant: InvariantId;
  readonly message: string;
}

/**
 * Well-formedness — not one of the four, but what makes the four mean anything.
 *
 * Invariant 1 asks that every `vanish` piece appears in `vanishingLemmas`. If a lemma could name a
 * piece that does not exist, a typo in either id would satisfy invariant 1 by accident on one side
 * and silently drop a lemma on the other. These checks close that.
 */
function checkWellFormed(family: Family): Violation[] {
  const v: Violation[] = [];
  const fail = (message: string): void => {
    v.push({ family: family.id, invariant: "well-formed", message });
  };

  const pieceIds = family.contour.pieces.map((p) => p.id);
  const duplicatePieces = pieceIds.filter((id, i) => pieceIds.indexOf(id) !== i);
  if (duplicatePieces.length > 0) fail(`duplicate piece id(s): ${[...new Set(duplicatePieces)].join(", ")}`);

  const targetIds = family.targets.map((t) => t.id);
  if (targetIds.length === 0) fail("declares no target");
  const duplicateTargets = targetIds.filter((id, i) => targetIds.indexOf(id) !== i);
  if (duplicateTargets.length > 0) fail(`duplicate target id(s): ${[...new Set(duplicateTargets)].join(", ")}`);

  for (const piece of family.contour.pieces) {
    if (piece.role === "vanish" && piece.lemma === undefined) {
      fail(`piece '${piece.id}' has role 'vanish' but names no lemma`);
    }
  }
  for (const lemma of family.vanishingLemmas) {
    if (!pieceIds.includes(lemma.piece)) {
      fail(`vanishingLemmas entry ${lemma.lemma} names a piece '${lemma.piece}' that does not exist`);
    }
  }
  // `windings` is specified as "per-pole, not a prose blurb" (DESIGN §5), so both halves must be
  // readable as expressions. Nothing evaluates them yet — which is exactly why this is checked here.
  // Transcribing A1–A3 produced three entries that did NOT parse (`sign(a)`, which the expression
  // language does not have, and `if … then … else`, which is spelled `if(c, t, e)`), and without
  // this guard they would have sat in the corpus looking executable until something tried.
  for (const w of family.contour.windings) {
    for (const [what, src] of [
      ["pole", w.pole],
      ["winding number", w.n],
    ] as const) {
      if (src.trim() === "") {
        fail(`the ${what} for pole '${w.pole}' is empty`);
        continue;
      }
      try {
        parse(src);
      } catch (e) {
        fail(
          `the ${what} '${src}' is not a readable expression: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  // The `check` / `detect` / `discharge` strings are a PREDICATE DSL awaiting its interpreter —
  // deliberately not `@cas/expr`, which has no `>=` or `!=` and could not express
  // `algebraic:squarefreeMultiplicityAt(Q, i) == 3` at all. Two forms are recognised:
  //
  //   `<namespace>:<predicate>`        — the common case, routed by namespace
  //   `hypotheses.<id> == true|false`  — a back-reference: "fire when that hypothesis failed"
  //
  // The back-reference form was NOT anticipated when this guard was written; A1 and A2 both use it
  // for their pole-on-the-contour traps, and it is the right way to say "this trap is the human
  // explanation of that hypothesis's refusal". Admitting it also buys a stronger check than the
  // namespace one — the referenced hypothesis must EXIST, so a typo in the id cannot leave a trap
  // permanently unroutable.
  const known = new Set(family.hypotheses.map((h) => h.id));
  const backReference = /^hypotheses\.([A-Za-z0-9_-]+)\s*==\s*(?:true|false)$/;
  const predicates: [string, string][] = [
    ...family.hypotheses.map((h) => [`hypotheses.${h.id}.check`, h.check] as [string, string]),
    ...family.traps.map((t) => [`traps.${t.id}.detect`, t.detect] as [string, string]),
    ...family.vanishingLemmas.map(
      (l) => [`vanishingLemmas.${l.piece}.discharge`, l.discharge] as [string, string],
    ),
  ];
  for (const [where, src] of predicates) {
    const ref = backReference.exec(src.trim());
    if (ref !== null) {
      if (!known.has(ref[1])) {
        fail(`${where} references a hypothesis '${ref[1]}' that this family does not declare`);
      }
      continue;
    }
    const namespace = /^([a-zA-Z]+):/.exec(src)?.[1];
    if (namespace === undefined || !PREDICATE_NAMESPACES.has(namespace)) {
      fail(
        `${where} is neither a 'hypotheses.<id> == true|false' back-reference nor a known ` +
          `namespace (${[...PREDICATE_NAMESPACES].join(" / ")}): '${src.slice(0, 60)}'`,
      );
    }
  }
  return v;
}

/**
 * Invariant 1 — every `vanish` piece is discharged, every `reproduces` piece has a coefficient row.
 *
 * The two halves are the same requirement seen from the two sides of Pass 5's table: a piece whose
 * role promises it contributes `0` must have a lemma saying why, and a piece whose role promises it
 * contributes a multiple of the unknowns must say which multiple. A record satisfying neither is not
 * under-documented; it is unsolvable.
 */
function checkInvariant1(family: Family): Violation[] {
  const v: Violation[] = [];
  const fail = (message: string): void => {
    v.push({ family: family.id, invariant: 1, message });
  };

  for (const piece of family.contour.pieces) {
    if (piece.role === "vanish") {
      const covered = family.vanishingLemmas.some((l) => l.piece === piece.id);
      if (!covered) fail(`the 'vanish' piece '${piece.id}' appears in no vanishingLemmas entry`);
    }
    if (piece.role === "reproduces") {
      if (piece.coefficients === undefined || piece.coefficients.length === 0) {
        fail(`the 'reproduces' piece '${piece.id}' has no coefficient row`);
      }
    }
  }
  return v;
}

/** Invariant 2 — a family with no way to go wrong has not been thought about hard enough. */
function checkInvariant2(family: Family): Violation[] {
  return family.traps.length >= 1
    ? []
    : [{ family: family.id, invariant: 2, message: "declares no trap" }];
}

/**
 * Invariant 3 — at least two goldens, and one fixture leaving every bonus constant non-zero.
 *
 * This rule was bought with a real bug (DESIGN §5): a dropped `1/i = −i` in a log-family solve was
 * invisible on the flagship fixture `R = 1/(1+x²)`, where the bonus term happens to vanish, and
 * every numeric check passed. It surfaced only on `R = 1/(x²+4)`.
 *
 * A family with no `reproduces` piece has no bonus constants, so the second clause is VACUOUS — and
 * that is stated here rather than silently skipped, because "there was nothing to check" and "the
 * check was forgotten" must not look the same in this file.
 */
function checkInvariant3(family: Family): Violation[] {
  const v: Violation[] = [];
  const fail = (message: string): void => {
    v.push({ family: family.id, invariant: 3, message });
  };

  if (family.golden.length < 2) {
    fail(`has ${family.golden.length} golden fixture(s); at least 2 are required`);
  }

  const hasBonus = family.contour.pieces.some(
    (p) => p.role === "reproduces" && p.bonus !== undefined,
  );
  if (!hasBonus) return v; // vacuous: no bonus constant exists to be zero

  const anyFixtureKeepsAllNonZero = family.golden.some((g) =>
    bonusMagnitudes(family, g.params).every((b) => b.magnitude > BONUS_ZERO),
  );
  if (!anyFixtureKeepsAllNonZero) {
    fail(
      "every golden fixture zeroes at least one bonus constant — the case that hid a dropped 1/i = −i; add a fixture in which all of them survive",
    );
  }
  return v;
}

/**
 * Invariant 4 — `rank(M) = m` for the family's own goldens.
 *
 * A family that cannot determine its own targets is either missing a `prerequisite` or
 * mis-specified. Note what this does NOT need: the residue sum. `M` is built from the piece
 * coefficients alone, so the check runs at load time without evaluating a single integral — the
 * goldens enter only because a parameter can reach into a coefficient (B1's `sgn(a)` flips an
 * orientation, and with it a sign in `M`).
 */
function checkInvariant4(family: Family): Violation[] {
  const v: Violation[] = [];
  const fail = (message: string): void => {
    v.push({ family: family.id, invariant: 4, message });
  };
  const m = family.targets.length;

  // A family with no parameters still gets one pass, at the empty binding: `M` does not depend on a
  // fixture there, but the check must still run.
  const bindings = family.golden.length > 0 ? family.golden.map((g) => g.params) : [{}];
  for (const [i, params] of bindings.entries()) {
    const built = buildSystem(family, params);
    if (!built.ok) {
      fail(`golden ${i}: M could not be decided exactly — ${built.reason}`);
      continue;
    }
    const { rank } = built.system.report;
    if (rank !== m) {
      const undetermined = built.system.report.kernel.length;
      fail(
        `golden ${i}: rank(M) = ${rank} but the family has ${m} unknown(s); ` +
          `${undetermined} combination(s) of them are invisible to this contour`,
      );
    }
  }
  return v;
}

/** Run every invariant against one record. Empty means it loads. */
export function checkFamily(family: Family): Violation[] {
  const wellFormed = checkWellFormed(family);
  // The four are only meaningful on a well-formed record — a lemma naming a non-existent piece would
  // otherwise be reported twice, once truthfully and once as a spurious invariant-1 failure.
  if (wellFormed.length > 0) return wellFormed;
  return [
    ...checkInvariant1(family),
    ...checkInvariant2(family),
    ...checkInvariant3(family),
    ...checkInvariant4(family),
  ];
}

export interface LoadResult {
  /** Records that passed every invariant, by id. These are the only ones the app may offer. */
  readonly families: ReadonlyMap<string, Family>;
  /** Everything that failed, named. Empty in a healthy repository; the test asserts that. */
  readonly violations: readonly Violation[];
}

/**
 * Load the corpus, dropping any record that fails an invariant.
 *
 * Duplicate ids are a corpus-level failure rather than a per-record one, so they are detected here:
 * two records sharing an id would silently shadow one another in the map.
 */
export function loadFamilies(records: readonly Family[] = FAMILIES): LoadResult {
  const violations: Violation[] = [];
  const families = new Map<string, Family>();

  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      violations.push({
        family: record.id,
        invariant: "well-formed",
        message: "duplicate family id — a second record claims it",
      });
      continue;
    }
    seen.add(record.id);

    const failures = checkFamily(record);
    if (failures.length > 0) {
      violations.push(...failures);
      continue;
    }
    families.set(record.id, record);
  }

  return { families, violations };
}
