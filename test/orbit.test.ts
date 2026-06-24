import { describe, it, expect } from "vitest";
import { parse } from "../src/expr/parser";
import { classifyOrbit } from "../src/render/overlay";

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
});
