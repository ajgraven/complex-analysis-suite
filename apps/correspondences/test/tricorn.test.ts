import { describe, expect, it } from "vitest";
import {
  classifyTricornBand,
  DEFAULT_TRICORN_OPTIONS,
  DEFAULT_TRICORN_VIEW,
  tricornEscape,
} from "../src/tricorn.js";
import type { Complex } from "../src/deltoid.js";

const MI = DEFAULT_TRICORN_OPTIONS.maxIter;
const OMEGA: Complex = [-0.5, Math.sqrt(3) / 2]; // ω, ω³ = 1
const rot = (c: Complex): Complex => [
  OMEGA[0] * c[0] - OMEGA[1] * c[1],
  OMEGA[0] * c[1] + OMEGA[1] * c[0],
];

describe("model space — the Tricorn z ↦ z̄² + c via @cas/expr", () => {
  it("c = 0 and c = −1 are in the Tricorn; c = 1 and a far c escape", () => {
    expect(tricornEscape([0, 0])).toBe(MI); // 0 is fixed
    expect(tricornEscape([-1, 0])).toBe(MI); // period-2 orbit 0 → −1 → 0
    expect(tricornEscape([1, 0])).toBeLessThan(MI); // real c > 1/4 escapes
    expect(tricornEscape([2, 2])).toBeLessThan(MI); // far parameter escapes fast
  });

  it("has the z̄²-family 3-fold symmetry c ↦ ω·c (also exercises @cas/expr conjugate)", () => {
    // exact rotations of pinned points
    expect(tricornEscape(rot([-1, 0]))).toBe(MI); // rotation of an in-set point stays in-set
    expect(tricornEscape(rot(rot([-1, 0])))).toBe(MI);
    const base = tricornEscape([1.5, 0]);
    expect(tricornEscape(rot([1.5, 0]))).toBe(base); // and escape counts are rotation-invariant
    expect(tricornEscape(rot(rot([1.5, 0])))).toBe(base);
    // membership over a grid is 3-fold symmetric
    let mism = 0;
    let tot = 0;
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        const c: Complex = [i * 0.2, j * 0.2];
        tot++;
        if (tricornEscape(c) >= MI !== (tricornEscape(rot(c)) >= MI)) mism++;
      }
    }
    expect(mism / tot).toBeLessThan(0.01);
  });

  it("classifyTricornBand yields a body and an exterior; the origin is in-set, a corner escapes", () => {
    const W = 48;
    const H = 48;
    const field = new Float32Array(W * H);
    classifyTricornBand(field, W, H, DEFAULT_TRICORN_VIEW, DEFAULT_TRICORN_OPTIONS, 0, H);
    let body = 0;
    let escaped = 0;
    for (const n of field) {
      if (n >= MI) body++;
      else escaped++;
    }
    expect(body).toBeGreaterThan(20);
    expect(escaped).toBeGreaterThan(20);
    expect(field[(H / 2) * W + W / 2]).toBe(MI); // centre pixel c ≈ 0 is in-set
    expect(field[0]).toBeLessThan(MI); // corner (|c| large) escapes
  });

  it("classifyTricornBand is deterministic", () => {
    const W = 32;
    const H = 32;
    const a = new Float32Array(W * H);
    const b = new Float32Array(W * H);
    classifyTricornBand(a, W, H, DEFAULT_TRICORN_VIEW, DEFAULT_TRICORN_OPTIONS, 0, H);
    classifyTricornBand(b, W, H, DEFAULT_TRICORN_VIEW, DEFAULT_TRICORN_OPTIONS, 0, H);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
