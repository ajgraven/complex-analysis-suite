import { describe, expect, it } from "vitest";
import { formatComplex, parseComplex, truncateComplex } from "../src/complex";

describe("parseComplex", () => {
  it.each([
    ["-.7-.4*i", [-0.7, -0.4]],
    [".1091+i*.502", [0.1091, 0.502]],
    ["1.6185+i*0.0471", [1.6185, 0.0471]],
    ["1+0*i", [1, 0]],
    [".5", [0.5, 0]],
    ["-.4547-i*.7733", [-0.4547, -0.7733]],
    ["2.92-.48*i", [2.92, -0.48]],
    ["4.3463+i*1.35", [4.3463, 1.35]],
  ])("parses %s", (input, [re, im]) => {
    const z = parseComplex(input as string);
    expect(z[0]).toBeCloseTo(re as number, 10);
    expect(z[1]).toBeCloseTo(im as number, 10);
  });

  it("handles bare imaginary units", () => {
    expect(parseComplex("i")).toEqual([0, 1]);
    expect(parseComplex("-i")).toEqual([0, -1]);
    expect(parseComplex("3+i")).toEqual([3, 1]);
  });

  it("does not split the sign of scientific notation", () => {
    const z = parseComplex("1e-3+2*i");
    expect(z[0]).toBeCloseTo(0.001, 12);
    expect(z[1]).toBeCloseTo(2, 12);
  });

  it("ignores surrounding whitespace and treats empty input as zero", () => {
    expect(parseComplex("  .5 - .25*i ")).toEqual([0.5, -0.25]);
    expect(parseComplex("")).toEqual([0, 0]);
  });
});

describe("formatComplex", () => {
  it("uses +i* / -i* by the sign of the imaginary part", () => {
    expect(formatComplex([0.25, 0.033])).toBe("0.25+i*0.033");
    expect(formatComplex([0.25, -0.033])).toBe("0.25-i*0.033");
    expect(formatComplex([1, 0])).toBe("1+i*0");
  });
});

describe("truncateComplex", () => {
  it("rounds each component to 6 significant figures", () => {
    expect(truncateComplex([0.123456789, -0.987654321])).toEqual([0.123457, -0.987654]);
  });
});

describe("round-trip", () => {
  it("parse(format(z)) recovers z", () => {
    for (const [re, im] of [
      [0.25, -0.0333],
      [-0.7, -0.4],
      [1.418, -0.119],
      [0, 0],
    ] as const) {
      const z = parseComplex(formatComplex([re, im]));
      expect(z[0]).toBeCloseTo(re, 10);
      expect(z[1]).toBeCloseTo(im, 10);
    }
  });
});
