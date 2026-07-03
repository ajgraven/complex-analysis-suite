import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  PROFILE_LABELS,
  PROFILE_ORDER,
  PROFILES,
  sameSettings,
  type ProfileName,
} from "../src/state/profiles";

describe("profiles data", () => {
  it("defines all six profiles in order, each with a label and a blurb", () => {
    expect(PROFILE_ORDER).toEqual([
      "explore",
      "artist",
      "researcher",
      "educator",
      "performance",
      "deepzoom",
    ]);
    for (const name of PROFILE_ORDER) {
      expect(PROFILES[name]).toBeDefined();
      expect(PROFILE_LABELS[name]).toBeTruthy();
    }
    expect(DEFAULT_PROFILE).toBe("explore");
  });

  it("encodes the load-bearing distinctions of each profile", () => {
    // Artist: the only profile with lighting + post-processing and the largest canvas; anti-aliased
    // by temporal accumulation (idle refine), not costly per-frame spatial supersampling.
    expect(PROFILES.artist.light).toBe(true);
    expect(PROFILES.artist.post).toBe(true);
    expect(PROFILES.artist.accumulate).toBe(true);
    expect(PROFILES.artist.aa).toBe("1"); // temporal AA supplies the anti-aliasing
    expect(PROFILES.artist.resolution).toBeGreaterThan(PROFILES.explore.resolution);

    // Explore: balanced default — temporal AA (idle refine) on, no lighting/post.
    expect(PROFILES.explore.light).toBe(false);
    expect(PROFILES.explore.post).toBe(false);
    expect(PROFILES.explore.accumulate).toBe(true);

    // Researcher: the only one that opens the metrics panel; highest iterations; perceptual palette.
    expect(PROFILES.researcher.juliaPanel).toBe(true);
    expect(PROFILES.researcher.palette).toBe("viridis");
    expect(PROFILES.researcher.iterations).toBeGreaterThanOrEqual(PROFILES.artist.iterations);

    // Educator: the only one with the pedagogical overlays on; idle-refine off for live demos.
    expect(PROFILES.educator.critorbit && PROFILES.educator.farey && PROFILES.educator.rays).toBe(
      true,
    );
    expect(PROFILES.educator.accumulate).toBe(false);

    // Performance: the cheapest — AA off, lowest cap + canvas.
    expect(PROFILES.performance.aa).toBe("1");
    expect(PROFILES.performance.iterations).toBe(
      Math.min(...PROFILE_ORDER.map((n) => PROFILES[n].iterations)),
    );
    expect(PROFILES.performance.resolution).toBe(
      Math.min(...PROFILE_ORDER.map((n) => PROFILES[n].resolution)),
    );

    // Deep zoom: the only one with perturbation on, with the strongest auto-iteration.
    expect(PROFILES.deepzoom.perturbation).toBe(true);
    expect(PROFILES.deepzoom.autoiter).toBe(true);
    expect(Number(PROFILES.deepzoom.autoiterStrength)).toBeGreaterThan(
      Number(PROFILES.artist.autoiterStrength),
    );

    // Only the educator turns on overlays; every other profile keeps them off.
    for (const n of PROFILE_ORDER) {
      if (n === "educator") continue;
      expect(PROFILES[n].critorbit || PROFILES[n].farey || PROFILES[n].rays).toBe(false);
    }
  });

  it("sameSettings matches a profile against itself and rejects any tweak", () => {
    for (const name of PROFILE_ORDER) {
      expect(sameSettings(PROFILES[name], PROFILES[name])).toBe(true);
    }
    const tweaked = { ...PROFILES.explore, aa: "4" };
    expect(sameSettings(PROFILES.explore, tweaked)).toBe(false);
    expect(sameSettings(PROFILES.explore, PROFILES.artist)).toBe(false);
  });

  it("has distinct settings for every profile (no two are identical)", () => {
    const names = PROFILE_ORDER;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(sameSettings(PROFILES[names[i] as ProfileName], PROFILES[names[j] as ProfileName])).toBe(
          false,
        );
      }
    }
  });
});
