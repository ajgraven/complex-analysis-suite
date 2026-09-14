// The `#vs=` permalink, checked BY VERDICT.
//
// §0.1 of the M6 plan is why this file is not a field-equality test: in every other app in the suite
// a dropped view-state field means a slightly different picture, and in this one it means the app
// draws the SAME contour and computes a DIFFERENT integral. So the round trip is judged on what the
// engine says afterwards — the closed form, the theorem's exact value, and every ledger row's
// constraint, status, level and claim — which is the one comparison that would have caught M5.1's
// shadowed-`branch` bug.
//
// And M6.1's finding applies here directly: the decode must start from a state the app does NOT
// already hold, or a consistently lossy codec passes. Every case below encodes from one state and
// decodes into a FRESH default, then compares the two resolutions.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";
import {
  compile,
  defaultState,
  offeredCorpus,
  resolveState,
  type ShellState,
  type StateResolution,
} from "../src/shell/state.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import { TEMPLATES } from "../src/shell/templates.js";
import { NO_BRANCH, type BranchChoice } from "../src/kernel/branch/model.js";
import { setParam, translateContour } from "../src/engine/contour/edit.js";

const base = (): ShellState => defaultState(TEMPLATES[0].build());
const template = (id: string): ShellState["contour"] => {
  const t = TEMPLATES.find((q) => q.id === id);
  if (t === undefined) throw new Error(`no template ${id}`);
  return t.build();
};

/** What the engine SAYS about a state — the comparison the gate is about. */
function verdict(s: ShellState): string {
  const res: StateResolution = resolveState(s, s.mode === "sandbox" ? compile(s.expr) : null);
  const out: string[] = [`kind=${res.kind}`];
  if (res.kind === "gallery") {
    out.push(`record=${res.family.id}`, `note=${res.note ?? "-"}`, `fatal=${res.fatal ?? "-"}`);
    out.push(`form=${res.solved?.text ?? "-"}`, `value=${res.solved ? String(res.solved.value) : "-"}`);
    if (res.run) {
      out.push(`theorem=${res.run.theorem.exactValue?.text ?? "-"}`, `agrees=${String(res.run.theorem.agrees)}`);
      out.push(`verdict=${res.run.ledger.verdict.level}`, `closes=${String(res.run.ledger.closes)}`);
      for (const r of res.run.ledger.rows) {
        out.push(`  ${r.constraint}|${r.status}|${r.evidence.level}|${r.claim}`);
      }
    }
  } else if (res.kind === "declared" || res.kind === "plain") {
    const a = res.analysis;
    out.push(`theorem=${a.theorem.exactValue?.text ?? "-"}`, `agrees=${String(a.theorem.agrees)}`);
    out.push(`verdict=${a.ledger.verdict.level}`, `closes=${String(a.ledger.closes)}`);
    if (res.kind === "declared") out.push(`split=${res.split === null ? "-" : `${String(res.split.ok)}|${res.split.detail}`}`);
    for (const r of a.ledger.rows) {
      out.push(`  ${r.constraint}|${r.status}|${r.evidence.level}|${r.claim}`);
    }
  } else if (res.kind === "declared-refused") {
    out.push(`refused=${res.reason}`);
  } else {
    out.push(`empty=${res.reason ?? "-"}`);
  }
  return out.join("\n");
}

/** Encode, decode into a FRESH state, and hand back both the decoded state and its hash. */
function roundTrip(s: ShellState): { state: ShellState; hash: string } {
  const enc = encodeShell(s);
  if (!enc.ok) throw new Error(`encode refused: ${enc.reason}`);
  const dec = decodeShell(enc.hash);
  if (dec === null) throw new Error("decode found no link");
  if (!dec.ok) throw new Error(`decode refused: ${dec.reason}`);
  return { state: dec.state, hash: enc.hash };
}

describe("the gate: every record, by verdict", () => {
  it("encode → decode → re-run gives the identical closed form and ledger for all 28 × every fixture", () => {
    const families = offeredCorpus().tiers.flatMap((t) => t.families);
    expect(families).toHaveLength(28);
    let checked = 0;
    for (const fam of families) {
      for (const k of fam.golden.keys()) {
        const before: ShellState = { ...base(), mode: "gallery", record: fam.id, fixture: k };
        const want = verdict(before);
        const { state } = roundTrip(before);
        expect(verdict(state), `${fam.id} #${k}`).toBe(want);
        checked += 1;
      }
    }
    // Every fixture of every record, not just the primaries.
    expect(checked).toBeGreaterThanOrEqual(94);
  });

  it("carries a record's moved bindings and geometry, which change the NUMBERS", () => {
    const moved: ShellState = {
      ...base(),
      mode: "gallery",
      record: "jordan-cosine-kernel",
      fixture: 1,
      bindings: { a: 1, b: 1 },
      geometry: { R_lim: 9 },
    };
    const at0 = verdict({ ...moved, bindings: {}, geometry: {} });
    const want = verdict(moved);
    expect(want).not.toBe(at0); // or the test below asserts nothing
    expect(verdict(roundTrip(moved).state)).toBe(want);
  });

  it("carries NO contour for a gallery record, because the record derives it", () => {
    const s: ShellState = { ...base(), mode: "gallery", record: "circle-linear-cos", fixture: 0 };
    const { hash } = roundTrip(s);
    const json = JSON.parse(atob(hash.slice(4).replace(/-/g, "+").replace(/_/g, "/"))) as {
      state: Record<string, unknown>;
    };
    expect(json.state.c).toBeUndefined();
    expect(Object.keys(json.state).sort()).toEqual(["m", "r"]);
  });
});

describe("the gate: the sandbox, with a declared branch", () => {
  const declaredKeyhole = (): ShellState => {
    const branch: BranchChoice = {
      ...NO_BRANCH,
      basePoint: [0, 1],
      points: [{ id: "b1", at: [0, 0], order: { kind: "power", alpha: Frac.of(-1n, 2n) }, label: "z = 0.00 + 0.00i" }],
      cuts: [{ id: "Γ1", from: "b1", to: "infinity", via: [[10000, 0]] }],
    };
    return {
      ...base(),
      expr: "1/(1+z)",
      contour: template("keyhole"),
      contourSource: { template: "keyhole", shift: [0, 0] },
      branch,
      declaration: { pointId: "b1", window: [Frac.ZERO, Frac.of(2n)], sign: 1, constant: [1, 0], logPower: 2 },
      beforeDeclaration: "z^(-1/2)/(1+z)",
    };
  };

  it("round-trips the declared factor, its window and its cofactor", () => {
    const s = declaredKeyhole();
    const want = verdict(s);
    expect(want).toContain("kind=declared");
    expect(verdict(roundTrip(s).state)).toBe(want);
  });

  it("round-trips a SHEET offset, which multiplies the answer by e^(2πisα)", () => {
    const s = declaredKeyhole();
    const shifted: ShellState = { ...s, branch: { ...s.branch, sheet: 3 } };
    const want = verdict(shifted);
    // The sheet decides the number, so a codec that dropped it would return the sheet-0 verdict.
    expect(want).not.toBe(verdict(s));
    expect(verdict(roundTrip(shifted).state)).toBe(want);
    expect(roundTrip(shifted).state.branch.sheet).toBe(3);
  });

  it("round-trips a DRAGGED cut, and the value does not move while the LEGALITY row does", () => {
    const s = declaredKeyhole();
    const dragged: ShellState = {
      ...s,
      branch: { ...s.branch, cuts: s.branch.cuts.map((c) => ({ ...c, via: [[-4, 0]] as const })) },
    };
    const want = verdict(dragged);
    // M4.7d: `∮` reads the declared WINDOW and never the geometry, so the VALUE is invariant — and
    // LEGALITY reads the geometry, so the ROW is not. Both halves have to survive the trip.
    expect(want).not.toBe(verdict(s));
    expect(verdict(roundTrip(dragged).state)).toBe(want);
    expect(roundTrip(dragged).state.branch.cuts[0].via[0]).toEqual([-4, 0]);
  });

  it("round-trips a dragged contour as its RECIPE, not its pieces", () => {
    const s = declaredKeyhole();
    const moved: ShellState = {
      ...s,
      contour: template("keyhole"),
      contourSource: { template: "keyhole", shift: [0.75, -0.25] },
    };
    // The state's own contour has to match its recipe or encoding refuses — which is the point.
    const enc = encodeShell(moved);
    expect(enc.ok).toBe(false);
    if (!enc.ok) expect(enc.reason).toContain("does not rebuild the contour on screen");
  });

  it("round-trips a contour at MOVED PARAMETERS, which move the ledger", () => {
    // The sandbox's `R` handle edits a parameter, so a link that dropped the values would reopen at
    // the template's own — a different contour behind the same picture. The arc's bound moves with
    // `R`, so the verdict is what catches it.
    const wide = setParam(template("keyhole"), "R", 9);
    const s: ShellState = {
      ...base(),
      expr: "1/(1+z^2)",
      contour: wide,
      contourSource: { template: "keyhole", shift: [0, 0] },
    };
    const atDefault = verdict({ ...s, contour: template("keyhole") });
    const want = verdict(s);
    expect(want).not.toBe(atDefault);
    expect(verdict(roundTrip(s).state)).toBe(want);
    expect(roundTrip(s).state.contour.params["R"].value).toBe(9);
  });

  it("round-trips a TRANSLATED contour — the shift is the recipe's, and it decides the answer", () => {
    // `translateContour` is what a body drag does, and the shift is the only part of the recipe the
    // geometry does not already carry. Moved far enough that the pole at `-1` is no longer inside,
    // so `∮` itself changes: the shift is a problem field, not a camera.
    const moved = translateContour(template("circle"), [3.5, 0]);
    const s: ShellState = {
      ...base(),
      expr: "1/(1+z)",
      contour: moved,
      contourSource: { template: "circle", shift: [3.5, 0] },
    };
    const home = verdict({ ...s, contour: template("circle"), contourSource: { template: "circle", shift: [0, 0] } });
    const want = verdict(s);
    expect(want).not.toBe(home);
    expect(verdict(roundTrip(s).state)).toBe(want);
    expect(roundTrip(s).state.contourSource?.shift).toEqual([3.5, 0]);
  });

  it("round-trips the record the picker is on, even in SANDBOX mode", () => {
    // Which record is selected outlives a trip to the sandbox, exactly as it does on screen. It
    // changes no number there, so no verdict can catch its loss — hence the field assertion.
    const s: ShellState = { ...base(), record: "log-squared-keyhole", fixture: 1 };
    const back = roundTrip(s).state;
    expect(back.mode).toBe("sandbox");
    expect(back.record).toBe("log-squared-keyhole");
    expect(back.fixture).toBe(1);
  });

  it("round-trips every template, and every one of them by verdict", () => {
    for (const t of TEMPLATES) {
      const s: ShellState = {
        ...base(),
        expr: "1/(1+z^2)",
        contour: t.build(),
        contourSource: { template: t.id, shift: [0, 0] },
      };
      const want = verdict(s);
      expect(verdict(roundTrip(s).state), t.id).toBe(want);
      expect(roundTrip(s).state.contourSource?.template, t.id).toBe(t.id);
    }
  });

  it("carries the view, the comparison and the scrub without touching a number", () => {
    const s: ShellState = {
      ...base(),
      view: { center: [1.25, -0.5], halfHeight: 7 },
      contrast: "sumFz",
      scrub: 0.375,
      iso: true,
    };
    const back = roundTrip(s).state;
    expect(back.view).toEqual(s.view);
    expect(back.contrast).toBe("sumFz");
    expect(back.scrub).toBe(0.375);
    expect(back.iso).toBe(true);
    expect(verdict(back)).toBe(verdict(s));
  });
});

describe("a link that cannot be honoured refuses BY NAME", () => {
  const enc = (s: ShellState): string => {
    const e = encodeShell(s);
    if (!e.ok) throw new Error(e.reason);
    return e.hash;
  };
  /** Rebuild a hash from a mutated payload, the way a hand-edited or foreign link arrives. */
  const withState = (patch: Record<string, unknown>): string => {
    const good = enc({ ...base(), mode: "gallery", record: "circle-linear-cos", fixture: 0 });
    const env = JSON.parse(atob(good.slice(4).replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    const next = { ...env, state: { ...(env.state as object), ...patch } };
    return `#vs=${btoa(JSON.stringify(next)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  };
  const refusal = (hash: string): string => {
    const r = decodeShell(hash);
    expect(r).not.toBeNull();
    if (r === null || r.ok) throw new Error("expected a refusal");
    return r.reason;
  };

  it("no link at all is NOT an error — the app keeps its defaults", () => {
    expect(decodeShell("")).toBeNull();
    expect(decodeShell("#")).toBeNull();
    expect(decodeShell("https://example.com/contour-integration/")).toBeNull();
  });

  it("a truncated view state", () => {
    const good = enc({ ...base(), mode: "gallery", record: "circle-linear-cos", fixture: 0 });
    expect(refusal(good.slice(0, good.length - 6))).toContain("truncated");
  });

  it("a link from another app in the suite", () => {
    const foreign = `#vs=${btoa(JSON.stringify({ v: 1, app: "2dh", state: { bodyId: "airfoil" } }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    expect(refusal(foreign)).toContain("another app in the suite");
  });

  it("a record this build does not have", () => {
    expect(refusal(withState({ r: "not-a-record" }))).toContain("not-a-record");
  });

  it("a fixture index past the end", () => {
    expect(refusal(withState({ r: "circle-linear-cos", f: 99 }))).toContain("fixture 99");
  });

  it("a contour template this build does not have", () => {
    // **The REASON, not only the id.** A sweep removing the template check still refused — a few
    // lines later `fromRecipe` returns null and the next guard catches it — but with "names a
    // parameter template 'spiral' does not have", which blames a parameter for a missing template.
    // The first version of this test asserted only that `spiral` appeared, so it pinned the outcome
    // without pinning the reason: M5.2's finding, met again.
    const reason = refusal(withState({ m: undefined, r: undefined, c: { t: "spiral" } }));
    expect(reason).toContain("contour template 'spiral'");
    expect(reason).not.toContain("parameter");
  });

  it("a contour parameter the template does not have", () => {
    expect(refusal(withState({ m: undefined, r: undefined, c: { t: "circle", p: { nope: 2 } } })))
      .toContain("does not have");
  });

  it("A DECLARATION NAMING A BRANCH POINT THE LINK DOES NOT CARRY — M6.1a, in permalink form", () => {
    const reason = refusal(
      withState({ m: undefined, r: undefined, dc: { p: "ghost", w: ["0/1", "2/1"], s: 1, k: [1, 0], l: 2 } }),
    );
    expect(reason).toContain("ghost");
    expect(reason).toContain("integrated as though it were the whole integrand");
  });

  it("a window that is not an exact fraction", () => {
    const branch = { cv: "principal", pt: [{ i: "b1", at: [0, 0], a: "1/2", l: "z = 0" }], ct: [], bp: [0, 1], sk: 0 };
    expect(refusal(withState({
      m: undefined, r: undefined, br: branch,
      dc: { p: "b1", w: ["0.3", "2/1"], s: 1, k: [1, 0], l: 2 },
    }))).toContain("declared factor in this link could not be read");
  });

  it("a non-finite number anywhere it can reach", () => {
    expect(refusal(withState({ v: [0, 0, 0] }))).toContain("positive height");
    expect(refusal(withState({ s: 2 }))).toContain("[0, 1]");
    expect(refusal(withState({ k: "rainbow" }))).toContain("rainbow");
    expect(refusal(withState({ i: "yes" }))).toContain("boolean");
    expect(refusal(withState({ bi: { a: null } }))).toContain("'a'");
  });

  it("a prototype-pollution key, which the envelope rejects before this codec sees it", () => {
    const bad = `#vs=${btoa(JSON.stringify({ v: 1, app: "ci", state: { __proto__: { x: 1 } }, __proto__: {} }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    // Either the envelope refuses it or there is nothing harmful left; what must NOT happen is a
    // decoded state carrying it.
    const r = decodeShell(bad);
    if (r !== null && r.ok) {
      expect(Object.prototype.hasOwnProperty.call(r.state, "__proto__")).toBe(false);
    }
  });

  it("gallery mode with no record", () => {
    const e = encodeShell({ ...base(), mode: "gallery", record: null });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toContain("nothing to link to");
  });

  it("a contour with no template behind it — the pen tool's case, named rather than half-built", () => {
    const e = encodeShell({ ...base(), contourSource: null });
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.reason).toContain("did not come from a template");
      expect(e.reason).toContain("pen tool");
    }
  });
});

describe("the payload stays inside research 07 §6's budget", () => {
  it("a gallery link is tiny, and the worst sandbox case is well under 2 kB of URL", () => {
    const gal = encodeShell({ ...base(), mode: "gallery", record: "series-cot-kernel", fixture: 0 });
    expect(gal.ok).toBe(true);
    if (gal.ok) expect(gal.hash.length).toBeLessThan(120);

    const worst: ShellState = {
      ...base(),
      expr: "1/(1+z^2)",
      contour: template("dogbone"),
      contourSource: { template: "dogbone", shift: [0, 0] },
      branch: {
        convention: "custom",
        points: [
          { id: "b1", at: [-1, 0], order: { kind: "power", alpha: Frac.of(-1n, 2n) }, label: "z = -1.00 + 0.00i" },
          { id: "b2", at: [1, 0], order: { kind: "power", alpha: Frac.of(-1n, 2n) }, label: "z = 1.00 + 0.00i" },
        ],
        cuts: [{ id: "Γ1", from: "b1", to: "b2", via: [[-0.5, 0.3], [0.5, -0.25], [1.25, 0.75]] }],
        basePoint: [0, 1],
        sheet: 2,
      },
      declaration: {
        pointId: "b1", window: [Frac.of(-1n), Frac.ONE], sign: -1,
        constant: [0.7071067811865476, -0.7071067811865476], logPower: 3,
      },
      beforeDeclaration: "z^(-1/2)*(1-z)^(-1/2)/(1+z^2)",
      record: "dogbone-two-fractional-powers",
      fixture: 2,
      view: { center: [1.2513467, -0.4998123], halfHeight: 7.312498 },
      contrast: "sumFz",
      scrub: 0.4375,
      iso: true,
    };
    const w = encodeShell(worst);
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    // A generous origin, since the app is published under a path.
    const url = w.hash.length + 70;
    expect(url, `worst case URL is ${url} B`).toBeLessThan(2000);
    expect(verdict(roundTrip(worst).state)).toBe(verdict(worst));
  });
});
