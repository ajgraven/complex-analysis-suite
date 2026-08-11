import { describe, expect, it } from "vitest";
import { RENDER_MODES, modeIsDomain, modeIsDiskImage } from "../src/render/modes.js";

describe("render modes registry (C)", () => {
  it("lists exactly the two conformal-tool modes, disk-image first", () => {
    expect(RENDER_MODES.map((m) => m.id)).toEqual(["disk-image", "domain-map"]);
    expect(RENDER_MODES[0].id).toBe("disk-image"); // the default view leads the picker
  });

  it("flags the numerical Riemann-map (domain) mode", () => {
    expect(modeIsDomain("domain-map")).toBe(true);
    expect(modeIsDomain("disk-image")).toBe(false);
  });

  it("treats any non-domain id as the disk-image view (the default fallback)", () => {
    expect(modeIsDiskImage("disk-image")).toBe(true);
    expect(modeIsDiskImage("domain-map")).toBe(false);
    expect(modeIsDiskImage("phase")).toBe(true); // a retired mode falls back to the primary view
  });
});
