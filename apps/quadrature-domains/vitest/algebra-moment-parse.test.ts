// Characterization net for the complex-moment input parser carved out of installAlgebra (refactor D,
// installAlgebra carve-out 5): _parseMomentToken (one token → {re, im}) + its helper _parseMomentNum (a real
// component → number). This drove "Shape from moments" and — being reachable only through a live DOM mount —
// had NO executable coverage, despite being a real parser with several branches and descriptive error paths.
// Pure with zero external deps, so pinned directly (no jsdom). The error MESSAGES are user-facing, so they're
// pinned too. Extracted verbatim (behavior-preserving).
import { describe, it, expect } from "vitest";
import { _parseMomentNum, _parseMomentToken } from "../app/algebra/algebra-moment-parse.mjs";

describe("_parseMomentNum — a real component (integer / rational / decimal, with sign shorthands)", () => {
  it("parses integers, decimals and exact rationals to a JS number", () => {
    expect(_parseMomentNum("3")).toBe(3);
    expect(_parseMomentNum("2.5")).toBe(2.5);
    expect(_parseMomentNum("1/2")).toBe(0.5);
    expect(_parseMomentNum("3/4")).toBe(0.75);
    expect(_parseMomentNum("-3/4")).toBe(-0.75);
  });
  it("treats ''/'+' as 1 and '-' as -1 (the bare-sign shorthands for a unit imaginary part)", () => {
    expect(_parseMomentNum("")).toBe(1);
    expect(_parseMomentNum("+")).toBe(1);
    expect(_parseMomentNum("-")).toBe(-1);
  });
  it("trims surrounding whitespace", () => {
    expect(_parseMomentNum("  3  ")).toBe(3);
  });
  it("throws a descriptive error on a zero-denominator rational and a non-number", () => {
    expect(() => _parseMomentNum("1/0")).toThrow('bad rational "1/0"');
    expect(() => _parseMomentNum("2j")).toThrow('bad number "2j"');
  });
});

describe("_parseMomentToken — one complex moment token → {re, im}", () => {
  it("real-only tokens (no 'i')", () => {
    expect(_parseMomentToken("3")).toEqual({ re: 3, im: 0 });
    expect(_parseMomentToken("1/2")).toEqual({ re: 0.5, im: 0 });
  });
  it("a ± b i with explicit real and imaginary parts", () => {
    expect(_parseMomentToken("2+3i")).toEqual({ re: 2, im: 3 });
    expect(_parseMomentToken("2-3i")).toEqual({ re: 2, im: -3 });
    expect(_parseMomentToken("0.5+0.25i")).toEqual({ re: 0.5, im: 0.25 });
    expect(_parseMomentToken("1/2-3/4i")).toEqual({ re: 0.5, im: -0.75 });
  });
  it("pure-imaginary tokens: bi, i, -i, +i (the bare-sign unit cases)", () => {
    expect(_parseMomentToken("3i")).toEqual({ re: 0, im: 3 });
    expect(_parseMomentToken("i")).toEqual({ re: 0, im: 1 });
    expect(_parseMomentToken("-i")).toEqual({ re: 0, im: -1 });
    expect(_parseMomentToken("+i")).toEqual({ re: 0, im: 1 });
  });
  it("strips internal whitespace before parsing", () => {
    expect(_parseMomentToken("2 + 3 i")).toEqual({ re: 2, im: 3 });
  });
  it("throws descriptive errors: empty, a stray 'i' not at the end, a bad component", () => {
    expect(() => _parseMomentToken("")).toThrow("empty moment");
    expect(() => _parseMomentToken("2i3")).toThrow('malformed complex "2i3" (i must be last)');
    expect(() => _parseMomentToken("2j")).toThrow('bad number "2j"'); // no 'i', so the real-parser rejects it
  });
});
