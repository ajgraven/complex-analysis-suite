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
import { penContour } from "../src/engine/contour/pen.js";
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

/** The wire object inside a hash — for the claims that are about a key being ABSENT. */
function payloadOf(hash: string): Record<string, unknown> {
  const env = JSON.parse(atob(hash.slice(4).replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
  return env.state as Record<string, unknown>;
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

  it("REFUSES a declaration whose branch point the state no longer has", () => {
    // **The two halves of `encodeShell` held different postures**, found reviewing M8 step 1.5b. The
    // contour's recipe is rebuilt and compared before a link is minted, because a link that opens a
    // different shape is worse than no link. A declaration was written straight out, and the DECODE
    // side refused it on arrival — loud rather than silent, so nothing was ever wrong, but the
    // failure was deferred onto whoever opened the link, who is exactly the reader who cannot do
    // anything about it. Reachable by declaring a factor and then removing its branch point, which
    // no code path prevents.
    const s = declaredKeyhole();
    expect(s.declaration, "this fixture declares nothing, so the test asserts nothing").not.toBeNull();
    const orphaned: ShellState = { ...s, branch: { ...s.branch, points: [] } };
    const enc = encodeShell(orphaned);
    expect(enc.ok).toBe(false);
    if (!enc.ok) expect(enc.reason).toContain("no longer has");
    // And the un-orphaned state still encodes, so the check is about the ORPHAN and not about
    // declarations in general.
    expect(encodeShell(s).ok).toBe(true);
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

  it("carries the AMPLITWIST toggle as a TRI-STATE, both values and the absence — M8 step 3.3", () => {
    // `showStep` is `iso`'s shape, not `stageMode`'s: `false` and "I have not chosen" are different
    // states, because the default follows the MODE (on in Worked example, off in Explore) and
    // collapsing them would hand a reader who deliberately turned the arrows off the mode's answer
    // again on the next render. So all three have to survive the wire, and the `null` one survives
    // by being ABSENT rather than by being written — which is also why the pairing below is on the
    // payload and not only on the decoded state.
    for (const want of [true, false] as const) {
      const back = roundTrip({ ...base(), showStep: want }).state;
      expect(`showStep ${String(want)} came back as ${String(back.showStep)}`).toBe(
        `showStep ${String(want)} came back as ${String(want)}`,
      );
    }
    const untouched = roundTrip({ ...base(), showStep: null }).state;
    expect(`untouched came back as ${String(untouched.showStep)}`).toBe("untouched came back as null");

    // **The `false` case is the one a "carried it" test can pass without carrying it**, because a
    // codec that dropped the field entirely also decodes to `null`, and `null` in Explore resolves
    // to off — which LOOKS like `false`. So the wire is read directly: an explicit choice is a key
    // on it and an untouched one is not.
    const off = encodeShell({ ...base(), showStep: false });
    const none = encodeShell({ ...base(), showStep: null });
    expect(`explicit off is on the wire: ${off.ok && off.hash !== (none.ok ? none.hash : "")}`).toBe(
      "explicit off is on the wire: true",
    );
  });

  it("carries the STAGE MODE, which decides the picture and no number — M8 step 1.9", () => {
    // A view field like the three above, and carried for the same reason: a textbook plate and a
    // full-chroma portrait are two pictures of one argument, and the one the sharer chose is the
    // one that should open.
    for (const mode of ["full", "iso", "textbook"] as const) {
      const s: ShellState = { ...base(), stageMode: mode };
      const back = roundTrip(s).state;
      expect(back.stageMode, mode).toBe(mode);
      expect(verdict(back), mode).toBe(verdict(s));
    }
  });

  it("the DEFAULT stage mode costs no bytes, and an old link decodes to it", () => {
    // `put`'s whole point: `quiet` is absent from the wire, so every link minted before step 1.9 is
    // already a link that names it. Asserted on the PAYLOAD rather than on the hash length, because
    // two hashes of equal length can differ, and because an absent key is the claim.
    const quiet = encodeShell({ ...base(), stageMode: "quiet" });
    expect(quiet.ok).toBe(true);
    if (!quiet.ok) return;
    expect(Object.prototype.hasOwnProperty.call(payloadOf(quiet.hash), "sm")).toBe(false);
    // And it is the key's absence and not a codec that never writes it: a non-default does appear.
    const loud = encodeShell({ ...base(), stageMode: "textbook" });
    expect(loud.ok).toBe(true);
    if (loud.ok) expect(payloadOf(loud.hash).sm).toBe("textbook");

    // The other half — a link with no `sm` at all opens quiet rather than on whatever is on screen.
    const back = decodeShell(quiet.hash);
    expect(back).not.toBeNull();
    if (back === null || !back.ok) throw new Error("expected a decode");
    expect(back.state.stageMode).toBe("quiet");
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
    expect(refusal(withState({ sm: "neon" }))).toContain("neon");
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

  it("a contour from NEITHER a template nor the pen — the refusal M7.2 narrowed but did not remove", () => {
    // This test used to pin "the pen tool's job (M7) and is deliberately not built yet". It is built
    // now, so the refusal narrows to what is genuinely unlinkable: a contour with no recipe whose
    // pieces the pen did not draw either. Asserted in BOTH directions, so the narrowing is pinned
    // rather than merely reworded.
    const e = encodeShell({ ...base(), contourSource: null });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toContain("neither a template nor the pen");

    // And the pen's own contour now encodes, which is the other half of the same claim.
    const drawn = penContour({ nodes: [{ at: [-1, -1] }, { at: [1, -1] }, { at: [0, 1] }], closed: true });
    const ok = encodeShell({ ...base(), contour: drawn, contourSource: null, sandboxContour: drawn });
    expect(ok.ok, ok.ok ? "" : ok.reason).toBe(true);
  });
});

describe("the stepper's place in the argument travels — M8 step 3.6", () => {
  const roundTrip = (step: number | "all"): number | "all" => {
    const e = encodeShell({ ...base(), mode: "gallery", record: "jordan-cosine-kernel", fixture: 0 }, step);
    if (!e.ok) throw new Error(e.reason);
    const d = decodeShell(e.hash);
    if (d === null || !d.ok) throw new Error("the link did not decode");
    return d.step;
  };

  it("carries a step, and absent means the whole argument at once", () => {
    // **The one field on this wire that is not read out of `ShellState`.** M6.1 put the reader's
    // place in an argument in the session and M7.4 made `resetTransient` clear it, both against a
    // STALE step surviving a change of argument — which a link naming a step for its own argument
    // is not. Until this field the plan's own Phase 3 gate clause, *a worked-example permalink at
    // step 5 of A6*, named something that did not exist.
    expect(roundTrip(4)).toBe(4);
    expect(roundTrip(0)).toBe(0);
    expect(roundTrip("all")).toBe("all");
  });

  it("costs nothing when there is no step, so every other link is byte-identical", () => {
    // `put`'s rule, checked rather than assumed: a field that appeared as `"all"` on the wire would
    // grow every link in the app for the sake of the one state that does not use it.
    const st = { ...base(), mode: "gallery" as const, record: "jordan-cosine-kernel", fixture: 0 };
    const withNone = encodeShell(st);
    const withAll = encodeShell(st, "all");
    expect(withNone.ok && withAll.ok && withNone.hash).toBe(withAll.ok ? withAll.hash : "");
  });

  it("refuses a step that is not a whole number, and does NOT refuse one past the end", () => {
    // The shape is the codec's business and the range is the card's: a step count changes with the
    // record and the fixture, so `stepIndex` lands a stale index on the LAST step deliberately —
    // an index that does not exist is the ordinary case rather than a broken link. A value that is
    // not a non-negative whole number is a hash this codec never minted.
    const bad = (v: unknown): string => {
      const good = encodeShell({ ...base(), mode: "gallery", record: "jordan-cosine-kernel", fixture: 0 });
      if (!good.ok) throw new Error(good.reason);
      const env = JSON.parse(atob(good.hash.slice(4).replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
      const next = { ...env, state: { ...(env.state as object), st: v } };
      const hash = `#vs=${btoa(JSON.stringify(next)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
      const r = decodeShell(hash);
      if (r === null) throw new Error("no link");
      return r.ok ? "" : r.reason;
    };
    for (const v of [1.5, -1, "3", null]) expect(bad(v), `st: ${String(v)}`).toContain("not a whole number");
    // 9,999 is past every record's step count in the corpus, and it is honoured.
    expect(bad(9999)).toBe("");
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
