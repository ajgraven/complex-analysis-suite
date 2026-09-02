import { describe, it, expect } from "vitest";
import { BODIES } from "../src/bodies.js";

// HD-0 smoke test — pins the invariants the hub and (later) the gallery picker rely on. It is a real
// assertion of structure, not a tautology: it guards uniqueness of the preset keys and the honesty of
// the Kutta/lift flag (set only where a single trailing edge makes the condition well-posed).
describe("body roster", () => {
  it("is non-empty and has unique ids", () => {
    expect(BODIES.length).toBeGreaterThan(0);
    const ids = BODIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly one airfoil page, and it is the lift-bearing anchor", () => {
    const airfoils = BODIES.filter((b) => b.kind === "airfoil");
    expect(airfoils).toHaveLength(1);
    expect(airfoils[0]?.id).toBe("airfoil");
    expect(airfoils[0]?.kutta).toBe(true);
  });

  it("flags the Kutta condition only where a single trailing edge makes it well-posed", () => {
    const byId = new Map(BODIES.map((b) => [b.id, b]));
    expect(byId.get("slit")?.kutta).toBe(true); // flat plate — a trailing edge
    expect(byId.get("ellipse")?.kutta).toBe(false); // smooth — no edge, circulation free
    expect(byId.get("deltoid")?.kutta).toBe(false); // several cusps — no distinguished trailing edge
  });

  it("gives every gallery body a display map ψ and a body description", () => {
    for (const b of BODIES) {
      expect(b.psi.length).toBeGreaterThan(0);
      expect(b.body.length).toBeGreaterThan(0);
    }
  });
});
