import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Convention-neutrality guard for @cas/core (ADR-0006 Action Item 2; RISKS.md §2 mitigation #1).
//
// WHY THIS EXISTS — the worst failure mode in the suite, made impossible-to-miss:
//
//   The Quadrature app deliberately uses NON-standard conventions — normalized area
//   (dA = dx dy / π, so the unit disk has area 1) and 1/(2πi)-suppressed contour integrals.
//   Complex Dynamics uses the standard conventions. If a normalization constant ever leaks
//   into a SHARED numeric kernel, an area comes out π× wrong or a contour integral 2πi× wrong,
//   in BOTH apps, and NOTHING crashes — "a plausible-looking but wrong figure, with no error
//   signal" (RISKS.md §2). ADR-0006's first line of defence is that @cas/core carries no such
//   constant. This test turns that from a discipline into a red build.
//
//   RISKS.md §1/§2 already advertise this as "a CI test asserts no π / 2πi normalization
//   constants live in core." Until now that test did not exist (ADR-0006 AI-2 was open, the
//   property held only "by construction"). This is that test.
//
// WHAT IS AND ISN'T FORBIDDEN — the distinction ADR-0006 actually draws:
//
//   Forbidden: `Math.PI`, a bare Greek `π`, and the high-precision π-derived decimal literals a
//   normalization factor would be written as (π, 2π, π/2, 1/π, 1/2π). Those are how an area or
//   contour normalization enters float code.
//
//   NOT forbidden: the geometric trig already in complex.ts — `Math.atan2` for arg(z), and
//   `Math.sin`/`Math.cos` for the polar branch of cpow. Those are convention-NEUTRAL geometry,
//   not normalization, and are exactly what ADR-0006 permits. So the guard bans the π CONSTANT,
//   never the trig functions.
//
// ESCAPE HATCH (keeps this "loud, not silent", never a straitjacket): a genuine future need for
// a geometric π in core — say a trig identity that must name π directly — is allowed by putting
// the marker `convention-ok` in a comment on the same line. That makes introducing π into core a
// deliberate, greppable, reviewed act rather than a silent one, which is the whole point of
// ADR-0006. There are ZERO such markers today; core is π-free.
//
// SCOPE: @cas/core only — the ADR-0006 subject and the one package where BOTH apps' conventions
// meet. NOT @cas/expr or @cas/gpu, which legitimately expose π to user formulas / shader trig; a
// blunt suite-wide ban would be wrong. (@cas/exact is float-free and could be added later.)

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));

// Blank out comment content while preserving line count, so line numbers in failures stay honest
// and π mentioned in a comment (e.g. this ADR note, or the "no π constants" headers in lstsq.ts /
// sphere.ts) never trips the scan. Crude but sufficient: @cas/core is pure numeric source with no
// string literal that contains `//`, `/* */`, `Math.PI`, or a π literal.
function stripComments(text: string): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

// π-derived normalization literals, at enough significant figures to be unmistakably π and never a
// coincidental short decimal. Matches π, 2π, π/2, 1/π, 1/2π written directly.
const PI_LITERALS = /\b(3\.14159|6\.28318|1\.57079|0\.31830|0\.15915)/;
const MATH_PI = /\bMath\s*\.\s*PI\b/;
const BARE_PI = /π/;
const OPT_OUT = /convention-ok\b/;

type Violation = { file: string; line: number; text: string; hit: string };

function scan(): Violation[] {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const violations: Violation[] = [];
  for (const file of files) {
    const raw = readFileSync(SRC_DIR + file, "utf8");
    const codeLines = stripComments(raw).split("\n");
    const rawLines = raw.split("\n");
    codeLines.forEach((code, i) => {
      if (OPT_OUT.test(rawLines[i] ?? "")) return; // deliberate, reviewed exception
      const hit = MATH_PI.exec(code) ?? BARE_PI.exec(code) ?? PI_LITERALS.exec(code);
      if (hit) violations.push({ file, line: i + 1, text: (rawLines[i] ?? "").trim(), hit: hit[0] });
    });
  }
  return violations;
}

describe("@cas/core convention-neutrality (ADR-0006)", () => {
  it("contains no π / 2πi normalization constant in any source file", () => {
    const violations = scan();
    const report = violations.map((v) => `  ${v.file}:${v.line}  «${v.hit}»  ${v.text}`).join("\n");
    expect(
      violations,
      violations.length === 0
        ? ""
        : `@cas/core must stay convention-neutral (ADR-0006 / RISKS.md §2): a π / 2πi ` +
            `normalization constant would silently corrupt every consumer's areas (π×) or contour ` +
            `integrals (2πi×). Move the convention to the app/domain edge, or — if this π is ` +
            `genuinely geometric (like arg/polar trig) — annotate the line with a "convention-ok" ` +
            `comment.\n${report}`,
    ).toHaveLength(0);
  });

  it("actually scans the source files (guards against an empty/misrouted glob)", () => {
    // A convention guard that silently scans zero files is worse than none — it reads green
    // forever. Pin that the scan sees the real kernel.
    const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files).toContain("complex.ts");
    expect(files.length).toBeGreaterThanOrEqual(8);
  });
});
