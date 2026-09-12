// Exact linear algebra for DESIGN.md §4's Pass 5.
//
// Pass 5 was a scalar division until the 28 gallery records broke it three separate ways, and the
// replacement is a real linear system `M t = r`. The point of the rewrite is not generality for its
// own sake — it is that FOUR classical traps collapse into one rank condition (DESIGN §4 Pass 5):
// the keyhole with the wrong `argRange`, `∫₀^∞ x^{a−1}/(1+xⁿ)` at integer `a`, the plain-log keyhole
// "losing" the log integral, and D5's underdetermined `∫R log²`. So `rank` and `kernel` are not
// diagnostics bolted on the side; they are the product. An app that solved this system without
// reporting them would print a plausible number in all four cases.
//
// WHY EXACT. DESIGN §4 says a nearly-rank-deficient `M` earns `≈` with a stated condition number,
// and that exact rational `M` — the common case — is solved exactly so the question does not arise.
// Over `Frac` there is no "nearly": a pivot is zero or it is not, so rank is DECIDED rather than
// thresholded. That matters because the whole Pass-5 report is a statement about rank, and a rank
// read off a float SVD with a tolerance would make the four traps above a matter of tuning.
//
// WHY OVER A `Field`, AND NOT JUST OVER ℚ. D4's lower edge reproduces an affine combination whose
// coefficients are `4π²` and `−4πi`, so no rational matrix holds it (ADR-0041; `field.ts` records why
// rescaling π away does not generalise). The elimination itself does not care: every step is
// add/sub/mul/inv and a zero TEST, and the decision stays a decision in any exact field. So this file
// is written once over `Field<T>` and instantiated twice — at ℚ, where `solveExact` keeps its old name
// and signature so DESIGN §5's invariant 4 runs exactly as it did, and at ℚ(i)(π) for D4 and D5.
import { Frac } from "@cas/exact";
import { FRAC_FIELD, type Field } from "./field.js";
import { RatPi } from "../kernel/ratPi.js";

/** A `k × m` matrix over `T`, row-major. */
export type Matrix<T> = readonly (readonly T[])[];

/** A `k × m` matrix of exact rationals, row-major. */
export type RatMatrix = Matrix<Frac>;

/** A combination of the equations that forces `0 = nonzero`. */
export interface Contradiction<T> {
  /** The reduced row that reads `0 = nonzero`. */
  readonly row: number;
  /**
   * The combination of the ORIGINAL equations that produced it: `Σ weightsⱼ · (equation j)`.
   *
   * The row index alone is post-elimination and says little a caller can act on, because `rref`
   * swaps rows — reduced row 1 is commonly original row 0. The WEIGHTS identify the contradiction:
   * for a realified complex identity `[1, 0]` is its real part and `[0, 1]` its imaginary one, so a
   * caller can say which of the two the residue sum failed rather than that one of them did.
   */
  readonly weights: readonly T[];
}

export interface SolveReport<T = Frac> {
  /** Exact — decided, never thresholded. */
  readonly rank: number;
  /** The number of unknowns, `m`. */
  readonly unknowns: number;
  /** Column indices that a pivot lands on; the rest are free. */
  readonly pivotColumns: readonly number[];
  /**
   * A basis for `ker(M)`, one vector per free column. Non-empty exactly when some combination of
   * the unknowns is invisible to this contour — which is the report the four traps need.
   */
  readonly kernel: readonly (readonly T[])[];
  /**
   * The unknowns this system pins down OUTRIGHT, with the functional extracting each.
   *
   * Each entry is `t_column = weights · r`, exactly. A caller holding `r` in some richer exact form
   * (a Gaussian rational, an element of ℚ(i)(√d), an `ExpSum`) can apply these weights to THAT
   * representation and keep the answer exact, instead of being handed a float.
   *
   * **Rank deficiency is not all-or-nothing, and D4 is why this field exists.** Its realified system
   * has rank 2 in three unknowns, yet `T0` and `T1` are each determined outright and only `T2` is
   * invisible — so a report that offered a solution only at full rank would refuse to state the very
   * answer the contour was built to give. A pivot unknown is determined exactly when its reduced row
   * is clean across every FREE column; otherwise it is known only relative to them, and it is left
   * out. The plain-log keyhole is the same shape one column over: `∫R dx` determined, `∫R log x` not.
   */
  readonly determined: readonly { readonly column: number; readonly weights: readonly T[] }[];
  /**
   * `t = combination · r` when `rank === unknowns` — `determined`'s weights in column order, which
   * at full rank is every unknown. Kept because "is this system solved?" is a question about the
   * whole system, and a caller asking it should not have to compare two lengths.
   */
  readonly combination?: readonly (readonly T[])[];
  /**
   * Combinations of the equations that force `0 = nonzero`.
   *
   * Distinct from rank deficiency, and a different failure: the family is not underdetermined, it is
   * CONTRADICTED. For the real-axis families this is where "the answer must come out real" lives —
   * the imaginary row is `0 · t = Im(S)`, so a non-real residue sum lands here rather than silently
   * vanishing.
   */
  readonly contradictions: readonly Contradiction<T>[];
}

/**
 * Row-reduce `[M | I]` to reduced row echelon form, tracking the row operations so the solved
 * combination can be read off.
 *
 * Returns the reduced `M`, the accumulated transform `T` with `T·M = rref(M)`, and the pivots.
 */
function rref<T>(
  field: Field<T>,
  matrix: Matrix<T>,
  unknowns: number,
): { rows: T[][]; transform: T[][]; pivotColumns: number[] } {
  const k = matrix.length;
  const rows = matrix.map((r) => {
    if (r.length !== unknowns) {
      throw new Error(`row has ${r.length} entries, expected ${unknowns}`);
    }
    return [...r];
  });
  // The transform starts as the identity and receives every operation the matrix receives, so the
  // weights that produced each reduced row survive into `combination`.
  const transform = rows.map((_, i) =>
    Array.from({ length: k }, (__, j) => (i === j ? field.one : field.zero)),
  );

  const pivotColumns: number[] = [];
  let pivotRow = 0;
  for (let col = 0; col < unknowns && pivotRow < k; col++) {
    // Exact pivoting: take the FIRST non-zero entry, not the largest. There is no growth to control
    // and no cancellation to fear in an exact field, and "first" keeps the result deterministic.
    let sel = -1;
    for (let r = pivotRow; r < k; r++) {
      if (!field.isZero(rows[r][col])) {
        sel = r;
        break;
      }
    }
    if (sel === -1) continue; // a free column

    [rows[pivotRow], rows[sel]] = [rows[sel], rows[pivotRow]];
    [transform[pivotRow], transform[sel]] = [transform[sel], transform[pivotRow]];

    const scale = field.inv(rows[pivotRow][col]);
    for (let c = 0; c < unknowns; c++) rows[pivotRow][c] = field.mul(rows[pivotRow][c], scale);
    for (let c = 0; c < k; c++) transform[pivotRow][c] = field.mul(transform[pivotRow][c], scale);

    for (let r = 0; r < k; r++) {
      if (r === pivotRow) continue;
      const factor = rows[r][col];
      if (field.isZero(factor)) continue;
      for (let c = 0; c < unknowns; c++) {
        rows[r][c] = field.sub(rows[r][c], field.mul(factor, rows[pivotRow][c]));
      }
      for (let c = 0; c < k; c++) {
        transform[r][c] = field.sub(transform[r][c], field.mul(factor, transform[pivotRow][c]));
      }
    }

    pivotColumns.push(col);
    pivotRow++;
  }

  return { rows, transform, pivotColumns };
}

/**
 * Solve `M t = r` exactly over `field`, reporting rank and kernel whether or not it is determined.
 *
 * `rhs` is optional and is used ONLY to detect contradiction. The structural half of the report —
 * rank, pivots, kernel, combination — depends on `M` alone, which is why the loader can check
 * DESIGN §5's invariant 4 without ever running the residue engine: a family that cannot determine
 * its own unknowns fails on the shape of its contour, not on the value of any particular integral.
 */
export function solveOver<T>(
  field: Field<T>,
  matrix: Matrix<T>,
  unknowns: number,
  rhs?: readonly T[],
): SolveReport<T> {
  if (unknowns < 0) throw new Error("a system cannot have a negative number of unknowns");
  if (rhs !== undefined && rhs.length !== matrix.length) {
    throw new Error(`rhs has ${rhs.length} entries but the matrix has ${matrix.length} rows`);
  }

  const { rows, transform, pivotColumns } = rref(field, matrix, unknowns);
  const rank = pivotColumns.length;

  // Kernel: one basis vector per free column, with 1 in that column and `−rref[pivot][free]` in
  // each pivot column. These are the combinations of unknowns this contour says nothing about.
  const free: number[] = [];
  for (let c = 0; c < unknowns; c++) if (!pivotColumns.includes(c)) free.push(c);
  const kernel = free.map((f) => {
    const v = Array.from({ length: unknowns }, () => field.zero);
    v[f] = field.one;
    pivotColumns.forEach((pc, i) => {
      v[pc] = field.neg(rows[i][f]);
    });
    return v;
  });

  // Contradiction: a reduced row that is zero across every unknown but carries a non-zero rhs.
  const contradictions: Contradiction<T>[] = [];
  if (rhs !== undefined) {
    for (let r = 0; r < rows.length; r++) {
      if (!rows[r].every((c) => field.isZero(c))) continue;
      // The reduced rhs entry is the same combination of the original rhs the transform records.
      const value = transform[r].reduce(
        (acc, w, j) => field.add(acc, field.mul(w, rhs[j])),
        field.zero,
      );
      if (!field.isZero(value)) contradictions.push({ row: r, weights: [...transform[r]] });
    }
  }

  // Determined unknowns: a pivot whose reduced row does not reach into any free column. The weights
  // are that row's recorded combination of the original rhs, which is what `transform` is for.
  const determined = pivotColumns
    .map((column, i) => ({ column, weights: [...transform[i]], clean: free.every((f) => field.isZero(rows[i][f])) }))
    .filter((d) => d.clean)
    .map(({ column, weights }) => ({ column, weights }));

  const combination = rank === unknowns ? determined.map((d) => d.weights) : undefined;

  return { rank, unknowns, pivotColumns, kernel, determined, combination, contradictions };
}

/** Apply a `combination` row to a right-hand side, exactly. */
export function combineOver<T>(
  field: Field<T>,
  weights: readonly T[],
  rhs: readonly T[],
): T {
  if (weights.length !== rhs.length) {
    throw new Error(`combination has ${weights.length} weights but the rhs has ${rhs.length} rows`);
  }
  return weights.reduce((acc, w, j) => field.add(acc, field.mul(w, rhs[j])), field.zero);
}

/**
 * The rank statement, in the words the gallery's traps use.
 *
 * M4.3's gate is that D1's wrong `argRange`, D3 at integer `a`, the plain-log keyhole and D5's `T2`
 * all report *"this contour carries no information about …"* as a COMPUTED consequence of `kernel`
 * rather than as four hand-written detectors. This is that sentence: one line per kernel vector,
 * naming the combination of unknowns the contour cannot see. An empty kernel returns no lines, which
 * is the determined case saying nothing.
 */
export function describeKernel<T>(
  field: Field<T>,
  report: SolveReport<T>,
  names: readonly string[],
): string[] {
  if (names.length !== report.unknowns) {
    throw new Error(`${names.length} names for ${report.unknowns} unknowns`);
  }
  return report.kernel.map((v) => {
    const parts: string[] = [];
    v.forEach((c, i) => {
      if (field.isZero(c)) return;
      // A lone unknown with weight ±1 is the overwhelmingly common case and reads best unadorned:
      // "no information about T2", not "no information about 1·T2".
      if (field.equals(c, field.one)) parts.push(names[i]);
      else if (field.equals(c, field.neg(field.one))) parts.push(`−${names[i]}`);
      else parts.push(`${field.format(c)}·${names[i]}`);
    });
    const combination = parts.length === 0 ? "0" : parts.join(" + ");
    return `this contour carries no information about ${combination}`;
  });
}

/**
 * Solve `M t = r` exactly over ℚ.
 *
 * The rational instance keeps its own name because it is not a special case of the general one in
 * any sense a reader cares about: it is what tiers A–C are, and what invariant 4 checks.
 */
export function solveExact(
  matrix: RatMatrix,
  unknowns: number,
  rhs?: readonly Frac[],
): SolveReport<Frac> {
  return solveOver(FRAC_FIELD, matrix, unknowns, rhs);
}

/** Apply a `combination` row to a rational right-hand side, exactly. */
export function applyCombination(weights: readonly Frac[], rhs: readonly Frac[]): Frac {
  return combineOver(FRAC_FIELD, weights, rhs);
}

/**
 * Split each complex equation into its real and imaginary parts — **valid only when the unknowns
 * are real**, which for these families is a stated hypothesis, not an assumption.
 *
 * `Σ mⱼ tⱼ = rⱼ` with every `tⱼ` real is `Σ Re(mⱼ) tⱼ = Re(r)` AND `Σ Im(mⱼ) tⱼ = Im(r)`, so a `k × m`
 * system becomes `2k × m`. Row `2i` is the real part of row `i` and row `2i + 1` its imaginary part;
 * a caller splitting the right-hand side must use the same order.
 *
 * This is not a convenience. D4's contour gives ONE identity in three unknowns, and read as one
 * complex row its rank is 1 — the app would report that two of the three integrals are invisible.
 * Read as two real rows its rank is 2, and the one genuinely invisible combination is `T2`. The
 * hypothesis that licenses it is D4's `R-real-on-the-ray`: `R` has real coefficients, so `T0`, `T1`
 * and `T2` are real and the split is legitimate. A family without that hypothesis must not call this.
 */
export function realifyRows(matrix: Matrix<RatPi>): Matrix<RatPi> {
  return matrix.flatMap((row) => [row.map((c) => c.re()), row.map((c) => c.im())]);
}

/**
 * The right-hand side of the same split — `[Re(r₀), Im(r₀), Re(r₁), …]`.
 *
 * Beside `realifyRows` so the ORDER lives in one place. A matrix split one way and a right-hand side
 * split the other would solve a system nobody wrote, and for a real-axis family the two rows are the
 * value and the reality condition, so swapping them is not a permutation of the answer — it reports
 * the wrong number and contradicts the wrong row.
 */
export function realifyRhs(rhs: readonly RatPi[]): RatPi[] {
  return rhs.flatMap((r) => [r.re(), r.im()]);
}
