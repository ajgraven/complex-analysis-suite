import { describe, expect, it } from "vitest";
import { buildInspectorRows } from "../src/ui/inspectorRows";
import type { InspectResult } from "../src/render/inspect";

// WP6/U9 (review 2026-09-16). The inspector used to print every number bare, so a Koebe distance
// ESTIMATE sharp only to within a factor of a few sat beside a counted iteration index in the same
// typeface with the same authority. Each row now carries a @cas/rigor verdict, and the level is the
// MEET over that row's certificates rather than a glyph typed at the call site.

const base: InspectResult = {
  fate: "periodic",
  period: 3,
  escapeIter: 0,
  multiplier: [0.5, 0],
  multiplierMag: 0.5,
  rotation: { p: 1, q: 3 },
  distance: null,
  cyclePoints: null,
};

const keys = (rows: { key: string }[]): string[] => rows.map((r) => r.key);

function pick<T extends { key: string }>(rows: T[], key: string): T {
  const r = rows.find((row) => row.key === key);
  if (!r) throw new Error(`no "${key}" row in [${keys(rows).join(", ")}]`);
  return r;
}
const levelOf = (rows: { key: string; verdict: { level: string } }[], key: string): string =>
  pick(rows, key).verdict.level;

describe("buildInspectorRows — the report and its levels", () => {
  it("lists the rows the report has always listed", () => {
    const rows = buildInspectorRows(base, "param");
    expect(keys(rows)).toEqual([
      "Fate",
      "Period",
      "Multiplier λ",
      "Fatou component",
      "Internal angle",
      "Limb",
    ]);
  });

  it("the limb row is the parameter plane's alone — it is a statement about the main cardioid", () => {
    expect(keys(buildInspectorRows(base, "dyn"))).not.toContain("Limb");
  });

  it("everything a tolerance found is ≈; a counted index is =", () => {
    const rows = buildInspectorRows(base, "param");
    expect(levelOf(rows, "Period")).toBe("≈");
    expect(levelOf(rows, "Multiplier λ")).toBe("≈");
    expect(levelOf(rows, "Fatou component")).toBe("≈");

    const escaped = buildInspectorRows(
      { ...base, fate: "escaped", period: 0, escapeIter: 42, distance: 1.5e-3 },
      "dyn",
    );
    expect(levelOf(escaped, "Escape time")).toBe("=");
    expect(levelOf(escaped, "Distance to set")).toBe("≈");
  });

  // The whole point of the meet: the Limb row's Tan Lei arithmetic IS exact, and it is exact about
  // a p/q that is not. `assembleVerdict` takes the weaker of the two, so the row cannot inherit the
  // certainty of its strongest step — which is the mistake the algebra exists to make unwritable.
  it("an exact step over an estimated input meets to ≈, not =", () => {
    const rows = buildInspectorRows(base, "param");
    expect(levelOf(rows, "Internal angle")).toBe("≈");
    expect(levelOf(rows, "Limb")).toBe("≈");
    const limb = pick(rows, "Limb");
    expect(limb.verdict.certificates.some((c) => c.level === "=")).toBe(true);
  });

  it("an undetermined fate is ? (nothing established), not ≈ (a classification)", () => {
    const rows = buildInspectorRows(
      {
        ...base,
        fate: "undetermined",
        period: 0,
        multiplier: null,
        multiplierMag: null,
        rotation: null,
      },
      "dyn",
    );
    expect(levelOf(rows, "Fate")).toBe("?");
    expect(levelOf(buildInspectorRows(base, "dyn"), "Fate")).toBe("≈"); // the contrast
  });

  it("no row is silently unevidenced — every verdict cites at least one certificate", () => {
    // `assembleVerdict([])` is "?" by design, so an unevidenced row would not print a false "=";
    // it would print a "?" that reads as a measurement failure. Neither is wanted here.
    for (const r of buildInspectorRows({ ...base, distance: 1e-3 }, "param")) {
      expect(r.verdict.certificates.length, r.key).toBeGreaterThan(0);
      expect(
        r.verdict.certificates.every((c) => c.method.length > 0),
        r.key,
      ).toBe(true);
    }
  });

  it("'full' precision does not round, 'display' does", () => {
    const info = {
      ...base,
      multiplierMag: 0.5000000000000001,
      multiplier: [0.5000000000000001, 0] as [number, number],
    };
    const full = pick(buildInspectorRows(info, "dyn", "full"), "Multiplier λ");
    const disp = pick(buildInspectorRows(info, "dyn", "display"), "Multiplier λ");
    expect(full.value).toContain("0.5000000000000001");
    expect(disp.value).toContain("0.5000");
    expect(disp.value).not.toContain("0.5000000000000001");
  });
});
