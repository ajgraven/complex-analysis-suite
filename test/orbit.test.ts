import { describe, it, expect } from "vitest";
import type { Complex } from "../src/complex";
import { parse } from "../src/expr/parser";
import { classifyOrbit, computeOrbit, orbitAndClassify } from "../src/render/overlay";

const f = parse("z^2+c");
const esc = parse("abs(z)>2");

describe("classifyOrbit (z^2 + c)", () => {
  it("detects a fixed point at c = 0", () => {
    const info = classifyOrbit(f, esc, [0, 0], [0, 0]);
    expect(info.fate).toBe("converged");
    expect(info.period).toBe(1);
  });

  it("detects a period-2 cycle at c = -1", () => {
    const info = classifyOrbit(f, esc, [0, 0], [-1, 0]);
    expect(info.fate).toBe("periodic");
    expect(info.period).toBe(2);
  });

  it("detects convergence to a fixed point at c = -0.5", () => {
    const info = classifyOrbit(f, esc, [0, 0], [-0.5, 0]);
    expect(info.fate).toBe("converged");
    expect(info.period).toBe(1);
  });

  it("detects escape at c = 2", () => {
    const info = classifyOrbit(f, esc, [0, 0], [2, 0]);
    expect(info.fate).toBe("escaped");
    expect(info.escapeIter).toBeGreaterThan(0);
  });

  it("exposes the detected cycle points", () => {
    const fixed = classifyOrbit(f, esc, [0, 0], [0, 0]); // fixed point at 0
    expect(fixed.cyclePoints).toHaveLength(1);
    const p2 = classifyOrbit(f, esc, [0, 0], [-1, 0]); // 2-cycle {0, -1}
    expect(p2.cyclePoints).toHaveLength(2);
    const xs = (p2.cyclePoints ?? []).map((q) => q[0]).sort((u, v) => u - v);
    expect(xs[0]).toBeCloseTo(-1, 6);
    expect(xs[1]).toBeCloseTo(0, 6);
    expect(classifyOrbit(f, esc, [0, 0], [2, 0]).cyclePoints).toBeNull(); // escaped
  });
});

describe("classifyOrbit — relative tolerance for large-modulus attractors", () => {
  it("detects a far-from-origin fixed point an absolute 1e-6 box would miss", () => {
    // z -> 0.97 z + 2700 converges to z* = 90000 with multiplier 0.97. Within 512 iters the
    // consecutive gap (~2700·0.97^k) only reaches ~1e-6 RELATIVE to |z| (~0.09), never the old
    // absolute 1e-6 — so the absolute box reported "bounded"; the relative tolerance converges.
    const lin = parse("0.97*z + 2700");
    const big = parse("abs(z) > 1e12"); // keep the orbit from "escaping"
    const info = classifyOrbit(lin, big, [0, 0], [0, 0]);
    expect(info.fate).toBe("converged");
    expect(info.period).toBe(1);
    // It stops when consecutive iterates are within ~1e-6·|z| (~0.09), so the reported
    // point sits a few units shy of the exact z* = 90000 — far from the origin, which is
    // the point: an absolute 1e-6 box never reached here. (PR-7 Newton-refines this.)
    const fp = info.cyclePoints?.[0]?.[0] ?? 0;
    expect(fp).toBeGreaterThan(89000);
    expect(fp).toBeLessThan(91000);
  });
});

describe("orbitAndClassify matches computeOrbit + classifyOrbit", () => {
  const cases: Complex[] = [
    [0, 0],
    [-1, 0],
    [-0.5, 0],
    [2, 0],
    [-0.75, 0.1],
    [0.28, 0.008],
  ];
  it("returns the same orbit and info as the separate functions", () => {
    for (const c of cases) {
      const combined = orbitAndClassify(f, esc, [0, 0], c, 48);
      expect(combined.orbit).toEqual(computeOrbit(f, esc, [0, 0], c, 48));
      expect(combined.info).toEqual(classifyOrbit(f, esc, [0, 0], c));
    }
  });
});
