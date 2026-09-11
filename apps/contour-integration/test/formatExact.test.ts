import { describe, expect, it } from "vitest";
import { Gauss, SqrtExt } from "@cas/exact";
import { formatGauss, formatSqrtExt, formatTwoPiISqrt } from "../src/kernel/formatExact.js";

describe("a unit value renders as 1, not as nothing", () => {
  // Found while building ExpSum: `times()` elided a unit numerator unconditionally, but the elision
  // only makes sense when there is a SYMBOL to elide in favour of. With an empty symbol — a plain
  // Gaussian rational — the value 1 rendered as the empty string, so a residue of exactly 1 printed
  // as nothing at all. This test fails against that code.
  it("renders 1 and −1", () => {
    expect(formatGauss(Gauss.ONE)).toBe("1");
    expect(formatGauss(Gauss.ONE.neg())).toBe("−1");
    expect(formatSqrtExt(SqrtExt.fromGauss(Gauss.ONE))).toBe("1");
  });

  it("still elides the numerator where there IS a symbol", () => {
    expect(formatGauss(Gauss.I)).toBe("i");
    expect(formatSqrtExt(SqrtExt.of(Gauss.ZERO, Gauss.ONE, 2n))).toBe("√2");
    // 2πi·(−i/2) = π, not 1π.
    expect(formatTwoPiISqrt(SqrtExt.fromGauss(Gauss.rat(0n, 1n, -1n, 2n)))).toBe("π");
  });

  it("keeps the compound forms it was written for", () => {
    expect(formatGauss(Gauss.int(1, 1))).toBe("1 + i");
    expect(formatGauss(Gauss.rat(1n, 2n, -1n, 1n))).toBe("1/2 − i");
    // A6's residue sum and its 2πi image.
    const a6 = SqrtExt.of(Gauss.ZERO, Gauss.rat(0n, 1n, -1n, 4n), 2n);
    expect(formatSqrtExt(a6)).toBe("−i√2/4");
    expect(formatTwoPiISqrt(a6)).toBe("π√2/2");
  });
});
