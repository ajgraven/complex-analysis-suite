import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `GLPlot.restoreContext()` re-creates every GPU resource after a `webglcontextrestored` event. It
// does that by nulling a HAND-MAINTAINED list of ~17 handle fields — and nothing checked that the
// list still covers the class. A field added later (a new texture, FBO or program) keeps its stale
// handle across a context loss; the handle belongs to the DEAD context, so it either renders nothing
// or throws INVALID_OPERATION, on a path that only fires when the GPU drops the context (deep df64
// renders can trip the watchdog) and so is easy to never hit in testing.
//
// This is a SOURCE-level guard because the failure is an omission: there is no behaviour to observe
// until the missing field exists. Driving it for real would need a WebGL2 context plus a way to
// forge a context-loss/restore pair, which the node/jsdom gate cannot do.
//
// It deliberately keys on the DECLARED TYPE rather than a name convention, so a field called
// `foo` still gets caught as long as it holds a GL object. `CompiledProgram` is included because
// `programs` is typed through that alias and names no WebGL* type directly.
const SRC = readFileSync(fileURLToPath(new URL("../src/render/glPlot.ts", import.meta.url)), "utf8");

/** Body of a method, by brace matching from its signature. */
function methodBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`method not found: ${signature}`);
  const open = src.indexOf("{", start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(open, i + 1);
}

/** Mutable private class fields (two-space indent) whose declared type names a GL resource. */
function glHandleFields(src: string): string[] {
  const out: string[] = [];
  // `private <name>: <type>` at class-field indentation. `readonly` is excluded: gl / canvas /
  // parallelExt / floatExt outlive a context loss (the browser restores the SAME context object).
  const re = /^ {2}private\s+(?!readonly\b)([A-Za-z_$][\w$]*)\s*:\s*([^=;]+?)\s*(?:=|;)/gm;
  for (const m of src.matchAll(re)) {
    if (/\bWebGL[A-Za-z]*\b|\bCompiledProgram\b/.test(m[2])) out.push(m[1]);
  }
  return out;
}

describe("GLPlot.restoreContext covers every GL handle the class holds (cd-glcontext-restore-09)", () => {
  const fields = glHandleFields(SRC);
  const body = methodBody(SRC, "private restoreContext(): void");

  it("finds the handle fields and the method (guards the scanner itself)", () => {
    // If the class is refactored so this scan matches nothing, the assertion below would pass
    // vacuously — which is the exact failure mode this file exists to prevent elsewhere.
    expect(fields.length).toBeGreaterThanOrEqual(15);
    expect(body.length).toBeGreaterThan(200);
  });

  it("every GL-handle field is reassigned in restoreContext", () => {
    const missing = fields.filter((f) => !new RegExp(`\\bthis\\.${f}\\s*=`).test(body));
    expect(missing).toEqual([]);
  });
});
