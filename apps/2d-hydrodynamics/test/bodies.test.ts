import { describe, it, expect } from "vitest";
import { EXTERIOR_MAP_PRESETS } from "@cas/flow";
import { BODIES } from "../src/bodies.js";

// Pins the invariants the Body selector relies on, and — the key guard — that every closed-form body id is
// a real @cas/flow EXTERIOR_MAP_PRESET id, so the selector, the `#vs=` body id, and the shared executable
// maps can never fall out of sync (ADR-0038).
describe("body roster", () => {
  it("is non-empty and has unique ids", () => {
    expect(BODIES.length).toBeGreaterThan(0);
    const ids = BODIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly one airfoil, and it is the lift-bearing anchor", () => {
    const airfoils = BODIES.filter((b) => b.kind === "airfoil");
    expect(airfoils).toHaveLength(1);
    expect(airfoils[0]?.id).toBe("airfoil");
    expect(airfoils[0]?.lift).toBe(true);
  });

  it("maps every closed-form body to a real @cas/flow preset, with free circulation (no imposed Kutta)", () => {
    const galleryIds = new Set(EXTERIOR_MAP_PRESETS.map((p) => p.id));
    const closedForm = BODIES.filter((b) => b.kind === "closed-form");
    expect(closedForm.length).toBeGreaterThan(0);
    for (const b of closedForm) {
      expect(galleryIds.has(b.id), `${b.id} is a real @cas/flow exterior-map preset`).toBe(true);
      expect(b.lift).toBe(false);
    }
  });

  it("gives every body a display map ψ and a body description", () => {
    for (const b of BODIES) {
      expect(b.psi.length).toBeGreaterThan(0);
      expect(b.body.length).toBeGreaterThan(0);
    }
  });
});
