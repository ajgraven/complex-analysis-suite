/**
 * Plain-text / CSV serialisers for the researcher data-access features (copy the inspector
 * report, export the inspected orbit). Pure (no DOM), so unit-tested; `main.ts` does the
 * clipboard write / file download. Full precision throughout — no rounding — so exported
 * values are exact.
 */

import type { Complex } from "../complex";
import { formatComplex } from "../complex";
import type { InspectResult } from "../render/inspect";
import type { OrbitFate } from "../render/overlay";

const FATE_LABEL: Record<OrbitFate, string> = {
  escaped: "escapes to infinity",
  converged: "settles to a fixed point",
  periodic: "settles into a cycle",
  undetermined: "no escape or cycle within the iteration limit",
};

/** The inspected orbit's report as clipboard-friendly plain text (full precision). */
export function inspectToText(info: InspectResult, point: Complex, plane: "param" | "dyn"): string {
  const lines: string[] = [
    plane === "param"
      ? `Parameter c = ${formatComplex(point)}`
      : `Orbit of z0 = ${formatComplex(point)}`,
    `Fate: ${FATE_LABEL[info.fate]}`,
  ];
  if (info.fate === "escaped") lines.push(`Escape time: ${info.escapeIter} iterations`);
  if (info.period > 0) lines.push(`Period: ${info.period}`);
  if (info.multiplier && info.multiplierMag !== null) {
    const deg = ((Math.atan2(info.multiplier[1], info.multiplier[0]) * 180) / Math.PI + 360) % 360;
    lines.push(`Multiplier: |lambda| = ${info.multiplierMag}, arg = ${deg.toFixed(2)} deg`);
  }
  if (info.rotation) lines.push(`Internal angle: ${info.rotation.p}/${info.rotation.q}`);
  if (info.distance !== null) lines.push(`Distance to set: ${info.distance}`);
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
