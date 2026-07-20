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
function setVerdictCalls(src: string): string[] {
  const clean = scrub(src);
  const out: string[] = [];
  const needle = "showResult({";
  let i = clean.indexOf(needle);
  while (i >= 0) {
    let depth = 0, j = i + needle.length - 1;
    for (; j < clean.length; j++) {
      if (clean[j] === "{") depth++;
      else if (clean[j] === "}") { depth--; if (depth === 0) break; }
    }
    out.push(src.slice(i, j + 1));
    i = clean.indexOf(needle, j);
  }
  return out;
}

describe("every verdict card declares a rigor level", () => {
  const calls = setVerdictCalls(SRC);

  it("finds the call sites (guards the scanner itself)", () => {
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  // Four call sites (RCTD import, Solve-for-a-variable, resolvent, bifurcation) used to pass no
  // `rigor`, so setVerdict rendered no pill at all — cards asserting exact interval counts and
  // closed-form roots sat unbadged beside correctly-badged siblings. An absent badge is the most
  // ambiguous state the card can be in, so absence must never be reachable.
  it("no setVerdict call omits `rigor` — an unbadged card is the ambiguous one", () => {
    const missing = calls.filter((c) => !/\brigor\s*:/.test(c));
    expect(missing).toEqual([]);
  });

  // 'exact' is the only level that claims certification, so an unconditional one is the shape a
  // false '=' would take. The resolvent is the single legitimate case: χ, its square-free part and
  // the discriminant are all symbolic over ℚ(i), so that card is exact on every path.
  it("at most one call site asserts rigor:'exact' unconditionally", () => {
    const hard = calls.filter((c) => /rigor\s*:\s*'exact'/.test(c));
    expect(hard.length).toBeLessThanOrEqual(1);
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
    expect(body).toMatch(/applyFactor\(\s*n\.id\s*,/);
    expect(body).toMatch(/Split /);
  });

  it("surfaces an applyFactor failure instead of swallowing it", () => {
    expect(body).toMatch(/showError\('Split into cases: '/);
  });
});
