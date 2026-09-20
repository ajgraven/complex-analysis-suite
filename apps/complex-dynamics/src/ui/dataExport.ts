/**
 * Plain-text / CSV serialisers for the researcher data-access features (copy the inspector
 * report, export the inspected orbit). Pure (no DOM), so unit-tested; `main.ts` does the
 * clipboard write / file download. Full precision throughout — no rounding — so an exported number
 * is the number the engine computed. That is not the same as the number being EXACT, which is why
 * the inspector report carries each row's rigor level beside it (see `inspectorRows.ts`).
 */

import type { Complex } from "../complex";
import { formatComplex } from "../complex";
import type { InspectResult } from "../render/inspect";
import { buildInspectorRows } from "./inspectorRows";

/**
 * The inspected orbit's report as clipboard-friendly plain text (full precision).
 *
 * The rows come from the same builder the panel uses, so the copied text cannot drift from what is
 * on screen — before WP6 it did, printing the Koebe distance ESTIMATE as a bare number where the
 * panel labelled it `≈`. Each line carries its rigor level for the same reason: a number that
 * leaves the app in someone's clipboard has left its caveat behind unless it takes it along.
 */
export function inspectToText(info: InspectResult, point: Complex, plane: "param" | "dyn"): string {
  const lines: string[] = [
    plane === "param"
      ? `Parameter c = ${formatComplex(point)}`
      : `Orbit of z0 = ${formatComplex(point)}`,
  ];
  for (const { key, value, verdict } of buildInspectorRows(info, plane, "full")) {
    lines.push(`${key}: ${verdict.level} ${value}`);
  }
  return lines.join("\n");
}

/** An orbit (sequence of iterates) as CSV with an `n,re,im` header (full precision). */
export function orbitToCsv(points: Complex[]): string {
  const rows = ["n,re,im"];
  points.forEach((p, n) => rows.push(`${n},${p[0]},${p[1]}`));
  return rows.join("\n");
}

/**
 * Exterior-map Laurent coefficients as CSV with a `k,re,im` header — k is the power of w^{-k}
 * in ψ(w) = w + Σ b_k w^{-k} (full precision).
 */
export function coeffsToCsv(coeffs: Complex[]): string {
  const rows = ["k,re,im"];
  coeffs.forEach((b, k) => rows.push(`${k},${b[0]},${b[1]}`));
  return rows.join("\n");
}

/** Exterior-map Laurent coefficients as readable plain text (full precision). */
export function coeffsToText(coeffs: Complex[], title: string, symbol = "b"): string {
  const lines = [title, `psi(w) = w + sum_k ${symbol}_k * w^-k`];
  coeffs.forEach((b, k) => lines.push(`${symbol}_${k} = ${formatComplex(b)}`));
  return lines.join("\n");
}
