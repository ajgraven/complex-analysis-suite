// **Every machine message this app can show a reader, against the real thing that produces it.**
//
// Two halves, and each is driven by the producer rather than by a transcription of it: the parse
// sentences by the real `compile` (step 1.4), and the link sentences by every `reason:` literal in
// `viewState.ts`'s own source, read out of the TypeScript AST (step 2.4). A refusal added later
// cannot fall through quietly — it appears in the table the moment it is written.
//
// The parse half, as it was written at 1.4:
//
// The plan asks for the sentences to be "mapped from `@cas/expr`'s error kinds"; measured, there are
// none — `ExprError` carries a free-text message. So this suite is what makes the mapping honest: it
// drives the real `compile`, and requires every failure to reach a mapped sentence with the fallback
// UNUSED. A reworded upstream message turns it red instead of silently degrading the card to the
// parser's own prose.
import { describe, expect, it } from "vitest";

import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { compile } from "../src/shell/state.js";
import { linkRefusal, parseErrorSentence, shareRefusal } from "../src/shell/errors.js";

/** Broken expressions of the shapes a reader actually types, one per throw site we claim to cover. */
const BROKEN: readonly { readonly src: string; readonly expect: RegExp }[] = [
  { src: "1/(1+z", expect: /unbalanced parenthesis/ },
  { src: "zz(3)", expect: /no function called “zz”/ },
  { src: "1/z +", expect: /ends before it is finished/ },
  { src: "", expect: /no expression to read/ },
  { src: "1 § 2", expect: /is not something an expression can contain/ },
  { src: "*/z", expect: /cannot appear there/ },
  { src: "if(z)", expect: /if takes 3 arguments/ },
  { src: "sin(z, 1)", expect: /sin takes 1 argument/ },
];

describe("a parse failure, as a sentence", () => {
  it("maps every shape a reader types, with the fallback UNUSED", () => {
    for (const { src, expect: want } of BROKEN) {
      const compiled = compile(src);
      expect(compiled.ok, `“${src}” parsed, so there is no error to map`).toBe(false);
      if (compiled.ok) continue;
      const sentence = parseErrorSentence(compiled.error);
      // Null is the fallback path. Reaching it means the card would print the parser's own prose,
      // which is the thing this file exists to prevent.
      expect(sentence, `“${src}” → “${compiled.error}” reached no rule`).not.toBeNull();
      expect(sentence ?? "").toMatch(want);
    }
  });

  it("says nothing about a message it does not know", () => {
    // The rules are prefix-anchored on purpose: a message this file has never seen must fall through
    // rather than be captured by whichever regex happens to match part of it.
    expect(parseErrorSentence("the reactor is on fire")).toBeNull();
  });

  it("names the token where naming it helps, and its ABSENCE where it does not", () => {
    // `Unexpected token 'eof'` IS the end-of-input token — measured, not assumed: the parser writes
    // `tok.value || tok.type` and eof has no value. Printing “eof” cannot appear there shows a reader
    // an internal token name and tells them nothing.
    expect(parseErrorSentence("Unexpected token 'eof'")).toBe("the expression ends before it is finished");
    expect(parseErrorSentence("Unexpected token '*'")).toBe("“*” cannot appear there");
  });
});

// ── the codec's refusals ────────────────────────────────────────────────────────────────────────

const FOUND = [resolve(process.cwd(), "src"), resolve(process.cwd(), "apps/contour-integration/src")].find((d) =>
  existsSync(d),
);
if (FOUND === undefined) throw new Error("cannot find the app's src/");
const SRC: string = FOUND;

/**
 * Every `reason:` the codec can return, read out of its source.
 *
 * A template literal comes back with a placeholder where each substitution goes, which is what makes
 * the rules below testable against the SHAPE the reader would see: `this link names fixture ⟨x⟩ of
 * '⟨x⟩', which has ⟨x⟩`. Reading the source rather than provoking each refusal is what makes the
 * table complete — several of these are unreachable except through a hand-built wire object.
 */
function codecReasons(): string[] {
  const file = resolve(SRC, "shell/viewState.ts");
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const out: string[] = [];
  const textOf = (node: ts.Node): string | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((sp) => `⟨x⟩${sp.literal.text}`).join("");
    }
    // `"a" + "b"` and `` `a${x}` + "b" `` — the codec writes its longer reasons that way.
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const [l, r] = [textOf(node.left), textOf(node.right)];
      return l === null || r === null ? null : l + r;
    }
    return null;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(src) === "reason") {
      const t = textOf(node.initializer);
      if (t !== null) out.push(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

/** A token that belongs to this program rather than to the reader's world. */
const IDENTIFIER = /'[^']*'|⟨x⟩|\b\w+[._]\w+\b|\[[a-z], [a-z]/;

describe("the sentences a broken link gets", () => {
  const reasons = codecReasons();

  it("reads every refusal the codec writes, so the table below cannot be a sample", () => {
    expect(reasons.length).toBeGreaterThan(30);
    // The shapes that make this a real extraction: a plain string, a template, and a concatenation.
    expect(reasons.some((r) => r.includes("⟨x⟩")), "no template reason was read").toBe(true);
    expect(reasons.some((r) => r.length > 120), "no concatenated reason was read").toBe(true);
  });

  it("turns each one into a sentence with nothing from the source code in it", () => {
    const bad: string[] = [];
    for (const reason of reasons) {
      for (const [where, said] of [["opening", linkRefusal(reason)], ["sharing", shareRefusal(reason)]] as const) {
        if (IDENTIFIER.test(said)) bad.push(`${where}: ${said}  ←  ${reason.slice(0, 60)}`);
        if (!said.endsWith(".")) bad.push(`${where}: not a sentence — ${said}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("would say so if a sentence carried one, on each kind of token", () => {
    // Without this the check above is satisfied by a broken `IDENTIFIER`.
    expect(IDENTIFIER.test("names the record 'mellin-keyhole'")).toBe(true);
    expect(IDENTIFIER.test("the field c.v is wrong")).toBe(true);
    expect(IDENTIFIER.test("contourSource.template is absent")).toBe(true);
    expect(IDENTIFIER.test("this link names fixture ⟨x⟩")).toBe(true);
    expect(IDENTIFIER.test("This link names a worked example this version does not have.")).toBe(false);
  });

  it("gives every actionable refusal its OWN sentence, and everything else one honest fallback", () => {
    // **The mapping's content is the split, so the split is what is asserted.** Every rule has to be
    // reached by a reason the codec really writes — a rule matching nothing is a sentence a reader
    // can never see — and the reasons that reach the fallback have to be the wire-shape ones, which
    // say nothing a reader could act on.
    const said = new Set(reasons.map((r) => linkRefusal(r)));
    const fallback = "This link is damaged: part of it could not be read.";
    expect(said.has(fallback), "no reason reaches the fallback, so it is dead").toBe(true);
    expect(said.size, "the actionable refusals are not distinguished").toBeGreaterThanOrEqual(8);
    for (const actionable of [
      "This link belongs to another app in the suite, not to Contour Integration.",
      "This link is incomplete — it may have been cut short when it was copied.",
      "This link names a worked example this version does not have.",
      "This link names a fixture that this worked example does not have.",
      "This link names a contour this version does not have.",
      "This link names a backdrop this version does not have.",
      "This link declares a branch factor at a point it does not carry.",
      "This link opens practice at a stage that does not exist.",
      // The 2026-09-20 review's two: the envelope version, which was never read at all, and a
      // contour parameter outside the range its own template declares.
      "This link was made by a different version of Contour Integration and cannot be opened here.",
      "This link sets a contour parameter outside the range this contour allows.",
    ]) {
      expect(said.has(actionable), `no codec reason reaches: ${actionable}`).toBe(true);
    }
  });
});
