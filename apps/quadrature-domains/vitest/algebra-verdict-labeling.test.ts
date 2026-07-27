// Tier-0 honest-labeling invariants for the Algebra verdict card. These are SOURCE-level guards:
// both defects they lock were invisible to behavioral tests because the failure mode was an
// *absence* (a card with no rigor pill; a button whose handler silently no-op'd), and both sit
// directly on the project's =/≤/≈ guardrail. Scanned rather than executed because the call sites
// live inside `installAlgebra`, which needs a full DOM + solver environment to reach.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");

// Blank comments and string bodies to spaces, PRESERVING character positions, so braces inside
// '\\text{cell }' — or an apostrophe inside a comment — can't unbalance the brace scan. Positions
// are preserved so call boundaries found here can be sliced out of the ORIGINAL source.
function scrub(s: string): string {
  let out = "", i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < n && s[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) { out += s[i] === "\n" ? "\n" : " "; i++; }
      if (i < n) { out += "  "; i += 2; }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c; out += " "; i++;
      while (i < n && s[i] !== q) {
        if (s[i] === "\\") { out += " "; i++; if (i >= n) break; }
        out += s[i] === "\n" ? "\n" : " "; i++;
      }
      if (i < n) { out += " "; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

// Every verdict-payload literal, sliced from the ORIGINAL source (so content assertions see the
// real strings) using boundaries found in the scrubbed copy.
//
// The needle was `setVerdict({` until P6b routed all eleven call sites through showResult(),
// which records the result against the system it was computed on before displaying it. This
// scanner's self-guard below is what caught the rename — keep it.
//
// ⚠ It also has to follow ONE INDIRECTION. Most call sites pass an inline literal, but one builds
// the payload as `const vSet = { … }` and calls `showResult(vSet)`. A brace-matching scan for
// `showResult({` is structurally blind to that, so for a long time this file asserted "no call
// omits rigor" while checking 10 of 11 — a hole in a guard whose entire job is honest labeling.
// Bare-identifier calls are now resolved back to their `const NAME = { … }` declaration, and
// callsFound() below cross-checks the total so a THIRD calling shape fails loudly instead of
// silently shrinking the guard again.
function braceSlice(src: string, clean: string, openIdx: number): string {
  let depth = 0, j = openIdx;
  for (; j < clean.length; j++) {
    if (clean[j] === "{") depth++;
    else if (clean[j] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(openIdx, j + 1);
}
/** The `function NAME(` most recently opened before `idx`, in the SCRUBBED source (so a name inside a
 *  comment or string can't win). This is what lets a guard name the call site it exempts instead of
 *  merely counting exemptions — see "the exempt site is the resolvent" below. */
function enclosingFn(clean: string, idx: number): string {
  let name = "<top-level>";
  for (const m of clean.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (m.index !== undefined && m.index < idx) name = m[1];
    else break;
  }
  return name;
}
/** Each verdict payload plus the handler that renders it. `fn` is attributed from the CALL position
 *  (not the declaration, for shape (b)) — the call is what puts the card on screen. */
interface VerdictCall { text: string; fn: string }
function setVerdictCalls(src: string): VerdictCall[] {
  const clean = scrub(src);
  const out: VerdictCall[] = [];
  // (a) inline literals — showResult({ … })
  for (let i = clean.indexOf("showResult({"); i >= 0; i = clean.indexOf("showResult({", i + 1)) {
    out.push({ text: braceSlice(src, clean, i + "showResult(".length), fn: enclosingFn(clean, i) });
  }
  // (b) one indirection — showResult(name), resolved to `const name = { … }`
  for (const m of clean.matchAll(/\bshowResult\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const decl = clean.indexOf("const " + m[1] + " = {");
    if (decl >= 0) {
      out.push({ text: braceSlice(src, clean, clean.indexOf("{", decl)), fn: enclosingFn(clean, m.index ?? 0) });
    }
  }
  return out;
}
// Real call sites: every `showResult(` minus its own definition. `reshowResult(` needs no
// subtraction — the leading \b does not match inside it (the preceding `h` is a word character),
// which is worth stating because subtracting it anyway double-counts and silently understates the
// total, making the cross-check below fail in the safe direction but for the wrong reason.
function callsFound(src: string): number {
  const clean = scrub(src);
  const all = [...clean.matchAll(/\bshowResult\(/g)].length;
  const defs = [...clean.matchAll(/function showResult\(/g)].length;
  return all - defs;
}

describe("every verdict card declares a rigor level", () => {
  const calls = setVerdictCalls(SRC);

  it("finds the call sites (guards the scanner itself)", () => {
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  it("reaches EVERY call site, not just the inline-literal ones", () => {
    // The assertions below claim something about *every* verdict. If the scanner silently stops
    // matching some calling shape, they keep passing while guarding less — which is worse than
    // failing, because the file reads as coverage that isn't there.
    expect(calls.length).toBe(callsFound(SRC));
  });

  // Four call sites (RCTD import, Solve-for-a-variable, resolvent, bifurcation) used to pass no
  // `rigor`, so setVerdict rendered no pill at all — cards asserting exact interval counts and
  // closed-form roots sat unbadged beside correctly-badged siblings. An absent badge is the most
  // ambiguous state the card can be in, so absence must never be reachable.
  it("no setVerdict call omits `rigor` — an unbadged card is the ambiguous one", () => {
    const missing = calls.filter((c) => !/\brigor\s*:/.test(c.text));
    expect(missing.map((c) => c.fn)).toEqual([]);
  });

  // 'exact' is the only level that claims certification, so an unconditional one is the shape a
  // false '=' would take. The resolvent is the single legitimate case: χ, its square-free part and
  // the discriminant are all symbolic over ℚ(i), so that card is exact on every path.
  //
  // ⚠ This NAMES the exempt handler rather than counting exemptions. A count of "at most one" is
  // satisfied just as well by moving the hardcoded 'exact' somewhere it is a lie: migrating it from
  // doResolvent to the *Numeric solve* card (an estimate path) keeps the count at 1 and a counting
  // guard stays green — verified, all 7 tests passed with that edit in place. Since the whole point
  // is the =/≤/≈ guardrail, the exemption has to be pinned to the site that earns it.
  it("the ONLY unconditional rigor:'exact' is the resolvent's — by name, not by count", () => {
    const hard = calls.filter((c) => /rigor\s*:\s*'exact'/.test(c.text));
    expect(hard.map((c) => c.fn)).toEqual(["doResolvent"]);
  });
});

describe("the positive-dimensional verdict does not read a field spuriousFactors never returns", () => {
  // `spuriousFactors` returns { index, label, factorCount, factors } — no `nodeId`. The card used
  // to build its "Split … into cases" action from `h.nodeId`, so applyFactor(undefined, …) failed
  // 'node not found' and the `if (r && r.ok)` guard swallowed it: the button did nothing, ever —
  // and it is the primary offered action in the case this project hits most often. It also could
  // not be repaired by supplying an id: those factors are of the REAL (reim) polynomials, and
  // Re(p) = f·g does not imply p factors, so factorIndex indexes a different list than applyFactor's.
  const body = (() => {
    const i = SRC.indexOf("function renderPositiveDimVerdict");
    expect(i).toBeGreaterThan(0);
    const j = SRC.indexOf("\n    }", i);
    return SRC.slice(i, j);
  })();

  it("never dereferences .nodeId on a spuriousFactors hit", () => {
    const code = body.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/\bh\.nodeId\b/);
  });

  it("still offers a split, driven by applyFactor on a real node id", () => {
    // Q2 offloaded the apply to applyFactorAsync — still a REAL node id (n.id), NOT the undefined
    // h.nodeId spuriousFactors never returns; only the sync/async variant changed.
    expect(body).toMatch(/applyFactor(?:Async)?\(\s*n\.id\s*,/);
    expect(body).toMatch(/Split /);
  });

  it("surfaces an applyFactor failure instead of swallowing it", () => {
    expect(body).toMatch(/showError\('Split into cases: '/);
  });
});
