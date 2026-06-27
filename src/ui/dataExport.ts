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
  converged: "attracting fixed point",
  periodic: "attracting cycle",
  bounded: "bounded (no cycle found)",
};

/** The inspected orbit's report as clipboard-friendly plain text (full precision). */
export function inspectToText(
  info: InspectResult,
  point: Complex,
  plane: "param" | "dyn",
): string {
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
