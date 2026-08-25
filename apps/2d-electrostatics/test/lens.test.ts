import { describe, it, expect } from "vitest";
import { termsFor } from "../src/ui/controls.js";

// The lens toggle is a relabel of the same field. Pin that the two vocabularies differ where they
// should (field lines ↔ streamlines, charge ↔ source) and agree on the shared decomposition suffix.
describe("lens terms", () => {
  it("swaps field-language for flow-language", () => {
    const e = termsFor("electrostatic");
    const h = termsFor("hydrodynamic");
    expect(e.fieldLines).toBe("Field lines");
    expect(h.fieldLines).toBe("Streamlines");
    expect(e.chargeLabel).toContain("Charge");
    expect(h.chargeLabel).toContain("Source");
    expect(e.direction).toBe("field direction");
    expect(h.direction).toBe("flow direction");
  });

  it("both readings decompose the residue into flux/source + i·circulation", () => {
    expect(termsFor("electrostatic").residueNote).toContain("circulation");
    expect(termsFor("hydrodynamic").residueNote).toContain("circulation");
  });
});
