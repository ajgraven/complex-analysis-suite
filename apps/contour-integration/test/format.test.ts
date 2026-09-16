// The approximate-number formatter — M8 step 1.5.
//
// The cases are the review's own, plus the ones that decide the rule rather than illustrate it: a
// component the estimate cannot distinguish from zero is not a number the app has.
import { describe, expect, it } from "vitest";

import { fmtApprox, fmtNum } from "../src/shell2/format.js";

describe("fmtApprox", () => {
  it("drops a component that is BELOW the error estimate", () => {
    // The review's example. `∮ dz/z = 2πi` exactly; the real part is the quadrature's rounding, and
    // printing `1.7641e-18` beside it says the argument established a real part. It did not.
    expect(fmtApprox([1.7641e-18, 6.28318531], 1e-4)).toBe("6.2832i");
    expect(fmtApprox([1.7641e-18, -6.28318531], 1e-4)).toBe("−6.2832i");
  });

  it("limits the DIGITS by the estimate, rather than showing eight either way", () => {
    expect(fmtApprox([1.23456789, 0], 1e-2)).toBe("1.23");
    expect(fmtApprox([1.23456789, 0], 1e-6)).toBe("1.234568");
    // A coarse estimate rounds to whole numbers rather than claiming a decimal it cannot support.
    expect(fmtApprox([1.23456789, 0], 0.5)).toBe("1");
  });

  it("prints BOTH parts when both are above the estimate", () => {
    expect(fmtApprox([1.5, 2.25], 1e-3)).toBe("1.500 + 2.250i");
    expect(fmtApprox([1.5, -2.25], 1e-3)).toBe("1.500 − 2.250i");
  });

  it("prints 0 when NEITHER part survives — a claim the estimate does support", () => {
    expect(fmtApprox([1e-20, -3e-19], 1e-6)).toBe("0");
  });

  it("says NOT A NUMBER rather than dropping a NaN as though it were noise", () => {
    // The drop rule asks `Math.abs(x) > floor`, which is false for `NaN` — so a pair of them printed
    // as `0`, an exact-looking zero for a value that does not exist, and a single one vanished
    // leaving a plausible purely-imaginary answer. `removable-one-minus-cos` reaches this: a
    // midpoint lands on the removable singularity and every later partial sum is `NaN`.
    expect(fmtApprox([Number.NaN, Number.NaN], 1e-6)).toBe("not a number");
    expect(fmtApprox([Number.NaN, 6.28], 1e-6)).toBe("not a number");
    expect(fmtApprox([6.28, Number.NaN], 1e-6)).toBe("not a number");
    // An INFINITY is a different claim and keeps its own word: it is a number the arithmetic
    // reached, not one it failed to.
    expect(fmtApprox([Number.POSITIVE_INFINITY, 0], 1e-6)).toBe("Infinity");
  });

  it("falls back to full precision when there is no estimate to limit it", () => {
    // `0` and a non-finite estimate both mean "nothing is known about the error", which must not be
    // read as "the error is zero, so print one digit".
    expect(fmtApprox([1.23456789, 0], 0)).toBe("1.23456789");
    expect(fmtApprox([1.23456789, 0], Number.NaN)).toBe("1.23456789");
  });

  it("does not let a value EQUAL to the estimate through", () => {
    // The boundary is the whole content: a component the size of its own error bar is not a number,
    // so the real part here is dropped and the imaginary one — comfortably above it — is not.
    expect(fmtApprox([1e-4, 5], 1e-4)).toBe("5.0000i");
    expect(fmtApprox([1.01e-4, 5], 1e-4)).toBe("0.0001 + 5.0000i");
  });
});

describe("fmtNum", () => {
  it("KEEPS trailing zeros, so a column does not jump as its digits change", () => {
    expect(fmtNum(0.5, 4)).toBe("0.5000");
    expect(fmtNum(0.49994, 4)).toBe("0.4999");
  });

  it("prints −0 as 0 — `toFixed` already does, which is why there is no guard here", () => {
    expect(fmtNum(-0, 2)).toBe("0.00");
    expect(fmtNum(-1e-12, 4)).toBe("-1.000e-12");
  });

  it("goes exponential where fixed point would be all zeros or fourteen digits wide", () => {
    expect(fmtNum(1.5e-9, 4)).toBe("1.500e-9");
    expect(fmtNum(2.5e9, 4)).toBe("2.500e+9");
    expect(fmtNum(Number.POSITIVE_INFINITY, 4)).toBe("Infinity");
  });
});
