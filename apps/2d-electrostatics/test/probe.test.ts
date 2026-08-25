import { describe, it, expect } from "vitest";
import { enclosedResidue, type Rect } from "../src/probe.js";
import type { Placed } from "../src/state.js";

// The residue theorem, exact: ∮ E dz = Σ (residues inside) = (Σq) + i(Σγ) over enclosed monopoles;
// a doublet is enclosed but contributes 0. These pin Gauss's law (Re) and Kelvin circulation (Im).
const source: Placed = { id: 1, kind: "monopole", at: [0, 0], c: [2, 0] };
const vortex: Placed = { id: 2, kind: "monopole", at: [1, 0.5], c: [0, 1.5] };
const doublet: Placed = { id: 3, kind: "doublet", at: [-1, -1], mu: [0.7, 0.2] };
const all = [source, vortex, doublet];
const box = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });

describe("enclosedResidue (Gauss + Kelvin)", () => {
  it("a loop around a source returns its charge, no circulation", () => {
    const e = enclosedResidue(all, box(-0.5, -0.5, 0.5, 0.5));
    expect(e.charge).toBeCloseTo(2, 12);
    expect(e.circulation).toBeCloseTo(0, 12);
    expect(e.count).toBe(1);
  });

  it("a loop around a vortex returns its circulation, no charge", () => {
    const e = enclosedResidue(all, box(0.5, 0, 1.5, 1));
    expect(e.charge).toBeCloseTo(0, 12);
    expect(e.circulation).toBeCloseTo(1.5, 12);
    expect(e.count).toBe(1);
  });

  it("a loop around both sums the residues", () => {
    const e = enclosedResidue(all, box(-0.5, -0.5, 1.5, 1));
    expect(e.charge).toBeCloseTo(2, 12);
    expect(e.circulation).toBeCloseTo(1.5, 12);
    expect(e.count).toBe(2);
  });

  it("a doublet is enclosed but contributes zero residue", () => {
    const e = enclosedResidue(all, box(-1.5, -1.5, -0.5, -0.5));
    expect(e.charge).toBeCloseTo(0, 12);
    expect(e.circulation).toBeCloseTo(0, 12);
    expect(e.count).toBe(1);
  });

  it("an empty loop encloses nothing", () => {
    const e = enclosedResidue(all, box(3, 3, 4, 4));
    expect(e).toEqual({ charge: 0, circulation: 0, count: 0 });
  });

  it("corner order does not matter", () => {
    const a = enclosedResidue(all, box(-0.5, -0.5, 0.5, 0.5));
    const b = enclosedResidue(all, box(0.5, 0.5, -0.5, -0.5));
    expect(b).toEqual(a);
  });
});
