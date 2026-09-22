import { describe, it, expect } from "vitest";
import { equalizedCdfLut } from "../src/histogram";

// The extraction's contract (ADR-0046): the inclusive cumulative fraction of a histogram, resampled
// onto a width-capped ramp. Complex Dynamics' own test/histogram.test.ts pins the DECODE half against
// the same numbers it asserted before the extraction, so between the two files the rewire is covered
// on both sides.
describe("equalizedCdfLut", () => {
  it("is the inclusive cumulative fraction, so a flat distribution is a straight ramp", () => {
    const { data, width } = equalizedCdfLut([1, 1, 1, 1], 16384);
    expect(width).toBe(4);
    // Inclusive: bin 0 already holds 1/4 of the samples.
    expect([data[0], data[4], data[8], data[12]]).toEqual([64, 128, 191, 255]);
  });

  it("spends its range where the samples are: a spike makes the ramp a step", () => {
    const hist = new Float64Array(100);
    hist[7] = 999;
    hist[80] = 1;
    const { data } = equalizedCdfLut(hist, 16384);
    expect(data[6 * 4]).toBe(0); // nothing at or below bin 6
    expect(data[7 * 4]).toBe(255); // 999/1000 → 254.7, rounds to 255
    expect(data[79 * 4]).toBe(255);
    expect(data[99 * 4]).toBe(255);
  });

  it("RESAMPLES rather than truncates when the histogram is longer than the cap", () => {
    const m = 1000;
    const hist = new Float64Array(m).fill(1);
    const { data, width } = equalizedCdfLut(hist, 100);
    expect(width).toBe(100);
    // Texel j reads bin ⌊(j+½)·1000/100⌋ = 10j + 5, whose inclusive fraction is (10j+6)/1000.
    for (const j of [0, 37, 98, 99]) {
      expect(data[j * 4]).toBe(Math.round(((10 * j + 6) / 1000) * 255));
    }
    // **Every bin is in the DISTRIBUTION; not every bin is ADDRESSABLE**, and the difference is worth
    // stating because the first version of this test asserted the stronger thing and was wrong. Each
    // texel reads the bin at the CENTRE of its range, so the last one reads bin 995 and tops out at
    // 254/255 rather than 255 — bins 995–999 are never sampled by any texel. Nothing is dropped from the
    // cumulative sum (all 1000 counts are in `total` and in the CDF); what the cap costs is resolution at
    // the very top, one part in 255. The arithmetic is Complex Dynamics' own, unchanged by the
    // extraction, which is the point — a "fix" here would change seven apps' output for 1/255.
    expect(data[99 * 4]).toBe(254);
    expect(data[99 * 4]).toBeGreaterThan(data[98 * 4]);
  });

  it("the cap is inert when the histogram already fits", () => {
    const hist = new Float64Array(64).fill(3);
    const a = equalizedCdfLut(hist, 16384);
    const b = equalizedCdfLut(hist, 64);
    expect(a.width).toBe(64);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("an empty distribution is an all-zero ramp, not NaN", () => {
    const { data, width } = equalizedCdfLut(new Float64Array(8), 16384);
    expect(width).toBe(8);
    expect(Array.from(data).every((v) => v === 0)).toBe(true);
  });

  it("a zero-length histogram yields one black texel rather than a zero-size texture", () => {
    const { data, width } = equalizedCdfLut([], 16384);
    expect(width).toBe(1);
    expect(Array.from(data)).toEqual([0, 0, 0, 0]);
  });

  it("clamps a degenerate cap to one texel instead of producing an empty ramp", () => {
    for (const cap of [0, -5, 0.4]) {
      const { width } = equalizedCdfLut([1, 2, 3], cap);
      expect(width).toBe(1);
    }
  });

  it("writes the ramp in R only — both consumers sample .r with NEAREST", () => {
    const { data } = equalizedCdfLut([1, 1], 16384);
    expect([data[1], data[2], data[3], data[5], data[6], data[7]]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("reproduces Complex Dynamics' pre-extraction arithmetic on its own shape (cap + 1 bins, last empty)", () => {
    // CD's decode: escape times 0..cap−1 counted, bin `cap` left empty. Before the extraction this
    // file's loop stored `cum/escaped` AFTER adding hist[k] for k < cap, and repeated the last value
    // at k = cap. That is exactly the inclusive CDF of a (cap+1)-bin histogram whose last bin is 0.
    const cap = 5;
    const hist = new Float64Array(cap + 1);
    hist[0] = 2;
    hist[1] = 0;
    hist[2] = 6;
    hist[3] = 0;
    hist[4] = 2; // total 10; bin 5 stays empty
    const { data, width } = equalizedCdfLut(hist, 16384);
    expect(width).toBe(cap + 1);
    const r = [0, 1, 2, 3, 4, 5].map((k) => data[k * 4]);
    expect(r).toEqual([51, 51, 204, 204, 255, 255]);
  });
});
