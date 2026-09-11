// Exact rational linear algebra for DESIGN.md §4's Pass 5.
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
import { Frac } from "@cas/exact";

/** A `k × m` matrix of exact rationals, row-major. */
export type RatMatrix = readonly (readonly Frac[])[];

export interface SolveReport {
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
  readonly kernel: readonly (readonly Frac[])[];
  /**
   * `t = combination · r`, exactly, when `rank === unknowns`. Each row is the rational functional
   * extracting one unknown from the right-hand side, so a caller holding `r` in some richer exact
   * form (a Gaussian rational, an element of ℚ(i)(√d), a rendered string) can apply these weights
   * to THAT representation and keep the answer exact, instead of being handed a float.
   */
  readonly combination?: readonly (readonly Frac[])[];
  /**
   * Rows that force `0 = nonzero`. Distinct from rank deficiency, and a different failure: the
   * family is not underdetermined, it is CONTRADICTED. For the real-axis families this is where
   * "the answer must come out real" lives — the imaginary row is `0 · t = Im(S)`, so a non-real
   * residue sum lands here rather than silently vanishing.
   */
  readonly inconsistentRows: readonly number[];
}

const isZeroRow = (row: readonly Frac[]): boolean => row.every((c) => c.isZero());

/**
 * Row-reduce `[M | I]` to reduced row echelon form over ℚ, tracking the row operations so the
 * solved combination can be read off.
 *
 * Returns the reduced `M`, the accumulated transform `T` with `T·M = rref(M)`, and the pivots.
 */
function rref(
  matrix: RatMatrix,
  unknowns: number,
): { rows: Frac[][]; transform: Frac[][]; pivotColumns: number[] } {
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
    Array.from({ length: k }, (__, j) => (i === j ? Frac.ONE : Frac.ZERO)),
  );

  const pivotColumns: number[] = [];
  let pivotRow = 0;
  for (let col = 0; col < unknowns && pivotRow < k; col++) {
    // Exact pivoting: take the FIRST non-zero entry, not the largest. There is no growth to control
    // and no cancellation to fear in ℚ, and "first" keeps the result deterministic.
    let sel = -1;
    for (let r = pivotRow; r < k; r++) {
      if (!rows[r][col].isZero()) {
        sel = r;
        break;
      }
    }
    if (sel === -1) continue; // a free column

    [rows[pivotRow], rows[sel]] = [rows[sel], rows[pivotRow]];
    [transform[pivotRow], transform[sel]] = [transform[sel], transform[pivotRow]];

    const pivot = rows[pivotRow][col];
    for (let c = 0; c < unknowns; c++) rows[pivotRow][c] = rows[pivotRow][c].div(pivot);
    for (let c = 0; c < k; c++) transform[pivotRow][c] = transform[pivotRow][c].div(pivot);

    for (let r = 0; r < k; r++) {
      if (r === pivotRow) continue;
      const factor = rows[r][col];
      if (factor.isZero()) continue;
      for (let c = 0; c < unknowns; c++) {
        rows[r][c] = rows[r][c].sub(factor.mul(rows[pivotRow][c]));
      }
      for (let c = 0; c < k; c++) {
        transform[r][c] = transform[r][c].sub(factor.mul(transform[pivotRow][c]));
      }
    }

    pivotColumns.push(col);
    pivotRow++;
  }

  return { rows, transform, pivotColumns };
}

/**
 * Solve `M t = r` exactly, reporting rank and kernel whether or not it is determined.
 *
 * `rhs` is optional and is used ONLY to detect contradiction. The structural half of the report —
 * rank, pivots, kernel, combination — depends on `M` alone, which is why the loader can check
 * DESIGN §5's invariant 4 without ever running the residue engine: a family that cannot determine
 * its own unknowns fails on the shape of its contour, not on the value of any particular integral.
 */
export function solveExact(matrix: RatMatrix, unknowns: number, rhs?: readonly Frac[]): SolveReport {
  if (unknowns < 0) throw new Error("a system cannot have a negative number of unknowns");
  if (rhs !== undefined && rhs.length !== matrix.length) {
    throw new Error(`rhs has ${rhs.length} entries but the matrix has ${matrix.length} rows`);
  }

  const { rows, transform, pivotColumns } = rref(matrix, unknowns);
  const rank = pivotColumns.length;

  // Kernel: one basis vector per free column, with 1 in that column and `−rref[pivot][free]` in
  // each pivot column. These are the combinations of unknowns this contour says nothing about.
  const free: number[] = [];
  for (let c = 0; c < unknowns; c++) if (!pivotColumns.includes(c)) free.push(c);
  const kernel = free.map((f) => {
    const v = Array.from({ length: unknowns }, () => Frac.ZERO);
    v[f] = Frac.ONE;
    pivotColumns.forEach((pc, i) => {
      v[pc] = rows[i][f].neg();
    });
    return v;
  });

  // Contradiction: a reduced row that is zero across every unknown but carries a non-zero rhs.
  const inconsistentRows: number[] = [];
  if (rhs !== undefined) {
    for (let r = 0; r < rows.length; r++) {
      if (!isZeroRow(rows[r])) continue;
      // The reduced rhs entry is the same combination of the original rhs the transform records.
      const value = transform[r].reduce((acc, w, j) => acc.add(w.mul(rhs[j])), Frac.ZERO);
      if (!value.isZero()) inconsistentRows.push(r);
    }
  }

  const combination =
    rank === unknowns
      ? pivotColumns.map((_, i) => transform[i].map((w) => w))
      : undefined;

  return { rank, unknowns, pivotColumns, kernel, combination, inconsistentRows };
}

/** Apply a `combination` row to a right-hand side, exactly. */
export function applyCombination(weights: readonly Frac[], rhs: readonly Frac[]): Frac {
  if (weights.length !== rhs.length) {
    throw new Error(`combination has ${weights.length} weights but the rhs has ${rhs.length} rows`);
  }
  return weights.reduce((acc, w, j) => acc.add(w.mul(rhs[j])), Frac.ZERO);
}
