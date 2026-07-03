import { describe, it, expect } from "vitest";
import { buildEqualizedCdf } from "../src/render/histogram";

/** Build an RGBA readback buffer whose pixels have the given escape times (k = R + 256·G). */
function pixels(escapeTimes: number[]): Uint8Array {
  const px = new Uint8Array(escapeTimes.length * 4);
  escapeTimes.forEach((k, i) => {
    px[i * 4] = k & 0xff;
    px[i * 4 + 1] = (k >> 8) & 0xff;
  });
  return px;
}

const rChannel = (data: Uint8Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4) out.push(data[i]);
  return out;
};

describe("buildEqualizedCdf", () => {
  it("computes the exact per-escape-time CDF when it fits the texture (n+1 ≤ maxTexSize)", () => {
    // Escape times 0,1,2,3 once each (k=4 is a non-escaped/interior pixel, excluded from k < n).
    const { data, width } = buildEqualizedCdf(pixels([0, 1, 2, 3, 4]), 4, 16384);
    expect(width).toBe(5); // n + 1, no resampling
    // cumulative escaped fraction 1/4,2/4,3/4,4/4,4/4 → round(·255)
    expect(rChannel(data)).toEqual([64, 128, 191, 255, 255]);
  });

  it("is monotonic non-decreasing, integer, and in [0,255], ending at 255 when pixels escape", () => {
    const times = Array.from({ length: 300 }, (_, i) => i % 90); // escape times 0..89, n=100
    const { data } = buildEqualizedCdf(pixels(times), 100, 16384);
    const r = rChannel(data);
    for (const v of r) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
    expect(r[r.length - 1]).toBe(255); // all pixels escaped ⇒ CDF reaches 1
  });

  it("resamples (does not truncate) when n+1 exceeds MAX_TEXTURE_SIZE — the auto-iter deep-zoom case", () => {
    // n = the auto-iter ceiling; escaping pixels spread across the whole range, including k well
    // beyond a 16384-wide texture. The buggy old path used raw _n and dropped/clamped these.
    const n = 20000;
    const times = [100, 3000, 8000, 15000, 19000, 19999];
    const { data, width } = buildEqualizedCdf(pixels(times), n, 16384);
    expect(width).toBe(16384); // capped to the GPU limit, not n+1 = 20001
    const r = rChannel(data);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
    expect(r[0]).toBeGreaterThanOrEqual(0);
    expect(r[r.length - 1]).toBe(255); // the deepest-escaping pixels still reach the top of the CDF
    // a pixel escaping at k=19000 (past the old 16384 cutoff) is included in the distribution:
    // fewer than half the pixels escape before it, so the CDF there is well below 1.
    expect(Math.max(...r)).toBe(255);
    expect(r.some((v) => v > 0 && v < 255)).toBe(true);
  });

  it("returns an all-zero CDF (no NaN) when no pixel escapes", () => {
    // Every pixel is interior (k ≥ n), so escaped = 0 — the /escaped guard must not divide by zero.
    const { data, width } = buildEqualizedCdf(pixels([10, 10, 10, 12]), 10, 16384);
    expect(width).toBe(11);
    expect(rChannel(data).every((v) => v === 0)).toBe(true);
  });
});
