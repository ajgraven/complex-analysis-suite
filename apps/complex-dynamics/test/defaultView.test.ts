import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { paramPresets, dynPresets } from "../src/presets";
import { parseComplex, formatComplexDisplay } from "../src/complex";
import { quadraticCriticalBounded } from "../src/render/critical";
import { inspect } from "../src/render/inspect";

// WP10/U3 (review 2026-09-16). The app opened on a parameter whose critical orbit ESCAPES, so the
// dynamical pane — half the app — showed a Cantor dust: measured, 0.00 % of the default window is
// inside the set at c = −0.7 − 0.4i, against 13.75 % for the Douady rabbit. The first thing a reader
// saw was the degenerate case, and the properties panel opened saying "totally disconnected".

describe("the default view opens on a connected Julia set", () => {
  it("the parameter plane's white point is the Douady rabbit", () => {
    const c = parseComplex(paramPresets.mandelbrot.c);
    expect(c[0]).toBeCloseTo(-0.122561, 6);
    expect(c[1]).toBeCloseTo(0.744862, 6);
  });

  it("its critical orbit is bounded — a connected set, not a dust", () => {
    const c = parseComplex(paramPresets.mandelbrot.c);
    expect(quadraticCriticalBounded(c)).toBe(true);
    // The anti-vacuity clause and the measurement in one: the OLD default fails the same test.
    expect(quadraticCriticalBounded([-0.7, -0.4])).toBe(false);
  });

  it("and it is the period-3 superattracting centre, so the orbit closes", () => {
    const c = parseComplex(paramPresets.mandelbrot.c);
    const r = inspect(parse("z^2+c"), parse("abs(z)>2"), "param", [0, 0], c, [0, 0]);
    expect(r.fate).toBe("periodic");
    expect(r.period).toBe(3);
  });

  it("the dynamical preset starts at the critical point, and agrees about c", () => {
    const z0 = dynPresets.mandelbrot.z0;
    expect(typeof z0).toBe("string");
    expect(parseComplex(z0 as string)).toEqual([0, 0]);
    expect(parseComplex(dynPresets.mandelbrot.c)).toEqual(parseComplex(paramPresets.mandelbrot.c));
  });
});

describe("one display format for a complex number", () => {
  // The caption printed 4 significant figures with a spaced `+ bi`; the hover readout printed 6 with
  // the same shape; the overlay label and the inspector title printed 6 in the PARSEABLE `a+i*b`
  // form. Three spellings of the same parameter, on screen at once.
  it("formats the readable way, not the parseable way", () => {
    expect(formatComplexDisplay([-0.122561, 0.744862])).toBe("-0.122561 + 0.744862i");
    expect(formatComplexDisplay([0.5, -0.25])).toBe("0.5 - 0.25i");
  });

  it("drops a zero part and a unit imaginary coefficient", () => {
    expect(formatComplexDisplay([2, 0])).toBe("2");
    expect(formatComplexDisplay([0, 1])).toBe("i");
    expect(formatComplexDisplay([0, -1])).toBe("-i");
    expect(formatComplexDisplay([0, 3])).toBe("3i");
    expect(formatComplexDisplay([1, 1])).toBe("1 + i");
  });

  it("rounds to the requested precision, and the caption's 4 is just an argument now", () => {
    expect(formatComplexDisplay([1 / 3, -1 / 7])).toBe("0.333333 - 0.142857i");
    expect(formatComplexDisplay([1 / 3, -1 / 7], 4)).toBe("0.3333 - 0.1429i");
  });
});
