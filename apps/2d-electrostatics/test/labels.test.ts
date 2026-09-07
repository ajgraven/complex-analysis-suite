import { describe, it, expect } from "vitest";
import { TERMS } from "../src/ui/controls.js";

// The app presents the electrostatic reading of the complex potential only (the hydrodynamic reading
// and its lens toggle moved to the sibling 2D Hydrodynamics app, ADR-0037). Pin the vocabulary the UI
// uses so a stray relabel is caught.
describe("field vocabulary (electrostatic reading)", () => {
  it("uses the electrostatic labels", () => {
    expect(TERMS.fieldLines).toBe("Field lines");
    expect(TERMS.equipot).toBe("Equipotentials");
    expect(TERMS.chargeLabel).toContain("Charge");
    expect(TERMS.circLabel).toContain("Circulation");
    expect(TERMS.direction).toBe("field direction");
    expect(TERMS.strength).toBe("field strength");
  });

  it("decomposes the residue into flux + i·circulation", () => {
    expect(TERMS.residueNote).toContain("flux");
    expect(TERMS.residueNote).toContain("circulation");
  });
});
