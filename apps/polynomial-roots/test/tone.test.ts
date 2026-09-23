import { describe, it, expect } from "vitest";
import { buildToneMap, normalisedDensity } from "../src/stage/tone";

/** Read the ramp at a density, exactly as the shader does: normalise, then look up. */
const sample = (tone: ReturnType<typeof buildToneMap>, d: number, exposure = 1): number => {
  const t = normalisedDensity(d, tone.maxDensity, exposure);
  const j = Math.min(tone.width - 1, Math.max(0, Math.floor(t * tone.width)));
  return tone.lut[j * 4];
};

describe("the tone map", () => {
  it("is monotone: more roots is never a darker pixel", () => {
    const density = new Float32Array(4096);
    for (let i = 0; i < density.length; i++) density[i] = i % 97; // a spread of counts
    const tone = buildToneMap(density);
    let previous = -1;
    for (let d = 0; d <= 96; d++) {
      const v = sample(tone, d);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it("equalises over the OCCUPIED pixels, so an empty background does not eat the ramp", () => {
    // 99% background, 1% carrying a spread of counts. Equalising over everything would push every
    // occupied pixel into the top of the ramp and flatten the structure the app exists to show.
    const density = new Float32Array(10000);
    for (let i = 0; i < 100; i++) density[i] = 1 + (i % 10);
    const tone = buildToneMap(density);
    expect(tone.occupied).toBe(100);
    const low = sample(tone, 1);
    const high = sample(tone, 10);
    expect(high - low).toBeGreaterThan(120); // the occupied range really does span the ramp
  });

  it("separates the low counts, which is where the dragon curves are", () => {
    // A frame whose bright band saturates: 1000 pixels at 5000 roots, and a faint structure at 1–4.
    const density = new Float32Array(20000);
    for (let i = 0; i < 1000; i++) density[i] = 5000;
    for (let i = 1000; i < 5000; i++) density[i] = 1 + (i % 4);
    const tone = buildToneMap(density);
    const one = sample(tone, 1);
    const four = sample(tone, 4);
    expect(four).toBeGreaterThan(one);
    // And under a LINEAR normalisation they would be indistinguishable — the reason for the log.
    const linearOne = Math.round((255 * 1) / 5000);
    const linearFour = Math.round((255 * 4) / 5000);
    expect(linearFour - linearOne).toBe(0);
    expect(four - one).toBeGreaterThan(20);
  });

  it("an empty frame is a flat black ramp, not a NaN", () => {
    const tone = buildToneMap(new Float32Array(256));
    expect(tone.occupied).toBe(0);
    expect(tone.maxDensity).toBe(0);
    expect(Array.from(tone.lut).every((v) => v === 0)).toBe(true);
    expect(normalisedDensity(3, 0)).toBe(0);
  });

  it("a single occupied pixel does not divide by zero", () => {
    const density = new Float32Array(64);
    density[7] = 42;
    const tone = buildToneMap(density);
    expect(tone.occupied).toBe(1);
    expect(tone.maxDensity).toBe(42);
    expect(Number.isFinite(sample(tone, 42))).toBe(true);
  });

  it("exposure lifts faint structure without moving the top of the ramp", () => {
    const density = new Float32Array(4000);
    for (let i = 0; i < 2000; i++) density[i] = 1;
    for (let i = 2000; i < 2010; i++) density[i] = 900;
    const plain = normalisedDensity(1, 900, 1);
    const lifted = normalisedDensity(1, 900, 20);
    expect(lifted).toBeGreaterThan(plain);
    // The maximum still maps to 1 at any exposure: the ramp's top is the frame's brightest pixel.
    for (const e of [0.1, 1, 20]) expect(normalisedDensity(900, 900, e)).toBeCloseTo(1, 12);
  });

  it("gamma bends the ramp and 1 leaves it alone", () => {
    const density = new Float32Array(2000);
    for (let i = 0; i < density.length; i++) density[i] = 1 + (i % 50);
    const plain = buildToneMap(density, 1, 1);
    const bright = buildToneMap(density, 1, 2);
    const same = buildToneMap(density, 1, 1);
    expect(Array.from(plain.lut)).toEqual(Array.from(same.lut));
    let lifted = 0;
    for (let j = 1; j < plain.width - 1; j++) {
      if (bright.lut[j * 4] > plain.lut[j * 4]) lifted++;
    }
    expect(lifted).toBeGreaterThan(plain.width / 3);
  });

  it("the normalisation is clamped, so a density above the frame's max cannot read off the end", () => {
    expect(normalisedDensity(1e9, 10)).toBe(1);
    expect(normalisedDensity(-5, 10)).toBe(0);
  });
});
