// **The words the BOUNDS and the BRANCH kernel may not use.**
//
// `denylist.test.ts` reads every string literal in `src/shell/**` and `src/engine/**` out of the
// TypeScript AST, and mounts the app across 43 states to read what is on screen. Neither half sees
// this directory pair: the source half does not read `src/kernel/**`, and the rendered half's states
// are default and successful ones, where no arc diverges and no declaration is refused. So the words
// reached readers from here — measured, six literals under the denylist's own rules, among them a
// wedge refusal ending *"the failing constraint is KILL"* and a minorant refusal shouting *GROWS*,
// both of which render verbatim in the derivation panel for a sandbox wedge on `exp(±z²)`.
//
// **The rules are copied rather than imported**, because `denylist.test.ts` exports none of them and
// mounting the app costs it 42 s of collection this file has no use for. The coordinator's own
// widening of that sweep to `src/kernel/**` supersedes this file; until then it is what stands
// between these two directories and a reader.
import ts from "typescript";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = [resolve(process.cwd(), "src"), resolve(process.cwd(), "apps/contour-integration/src")].find(
  (d) => existsSync(d),
);
if (SRC === undefined) throw new Error("cannot find the app's src/ from " + process.cwd());

/** `denylist.test.ts`'s `WORDS`, verbatim. */
const WORDS: readonly { readonly what: string; readonly re: RegExp }[] = [
  { what: "a constraint id", re: /\b(LEGALITY|CATCH|KILL|COVER)\b/ },
  { what: "the word 'rung'", re: /\brung/i },
  { what: "the word 'golden'", re: /\bgolden/i },
  { what: "the word 'ledger'", re: /\bledger/i },
  { what: "the phrase 'the solve'", re: /\bthe solve\b/ },
  { what: "a research citation", re: /research \d/i },
  { what: "a pass number", re: /\bPass \d/ },
  { what: "a lemma number", re: /\bL[1-8]\b/ },
];
const CAPS = /\b[A-Z]{3,}\b/g;
const CAPS_ALLOWED = new Set(["ML", "GL", "PNG", "URL", "CET"]);
const ROMAN = /^[IVXLCDM]{1,7}$/;
const isProse = (text: string): boolean => /[a-z]/.test(text);

function offences(text: string): string[] {
  const out: string[] = [];
  for (const { what, re } of WORDS) if (re.test(text)) out.push(what);
  if (isProse(text)) {
    for (const m of text.match(CAPS) ?? []) {
      if (!CAPS_ALLOWED.has(m) && !ROMAN.test(m)) out.push(`the shouted word '${m}'`);
    }
  }
  return out;
}

/**
 * **The bare-id exemption is NOT taken here, and that is the one deliberate difference.**
 *
 * `denylist.test.ts` exempts a literal that is exactly `"KILL"` or `"L4"`, because in `ledger.ts`
 * those are data keys 48 times over and its rendered half closes the gap. Nothing in these two
 * directories keys data by a constraint or a lemma number — measured, the only such literal was
 * `refuse("L4", …)`, where it was the printed CLAIM of a refusal at a double pole. Exempting the
 * shape here would have exempted exactly the defect.
 */
function isSpecifier(node: ts.Node): boolean {
  const p = node.parent as ts.Node | undefined;
  if (p === undefined) return false;
  return (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    ts.isImportTypeNode(p) ||
    (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function literalsOf(file: string): { readonly line: number; readonly text: string }[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node);
    if (isLiteral && !isSpecifier(node)) {
      out.push({ line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1, text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...tsFilesUnder(abs));
    else if (name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

const BOUNDS = join(SRC, "kernel", "bounds");
const BRANCH = join(SRC, "kernel", "branch");

describe("no sentence the arc bounds or the branch kernel compose carries a house word", () => {
  const files = [...tsFilesUnder(BOUNDS), ...tsFilesUnder(BRANCH)];

  it("reads both directories, so the sweep below is not passing on an empty list", () => {
    // Counted separately: `bounds/` alone is a dozen files, so one total is satisfied by either.
    expect(files.filter((f) => f.startsWith(BOUNDS)).length, "the bounds are not being read").toBeGreaterThan(9);
    expect(files.filter((f) => f.startsWith(BRANCH)).length, "the branch kernel is not being read").toBeGreaterThan(5);
    expect(files.flatMap(literalsOf).length).toBeGreaterThan(300);
  });

  it("finds none of them", () => {
    const bad: string[] = [];
    for (const file of files) {
      for (const { line, text } of literalsOf(file)) {
        const why = offences(text);
        if (why.length > 0) {
          bad.push(`${file.slice(SRC.length + 1)}:${line} — ${why.join(", ")} — ${JSON.stringify(text.slice(0, 90))}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("would find each of the six it did find, so a green sweep is not a broken instrument", () => {
    // The literals this pass removed, as they stood. Without these the test above is satisfied by
    // an `offences` that returns nothing.
    expect(offences("the wedge cannot be closed this way, and the failing constraint is KILL")).toContain(
      "a constraint id",
    );
    expect(offences("e^{−κ cos ψ} GROWS — at ψ = π it is e^{+κ}")).toContain("the shouted word 'GROWS'");
    expect(offences("κ depending on WHICH endpoint attains the maximum")).toContain("the shouted word 'WHICH'");
    expect(offences("which is not N + ½: at an INTEGER half-width")).toContain("the shouted word 'INTEGER'");
    expect(offences("the single-factor residue reader is about the ORIGIN")).toContain("the shouted word 'ORIGIN'");
    expect(offences("a path THROUGH a branch point")).toContain("the shouted word 'THROUGH'");
    // And the bare lemma id, which `denylist.test.ts`'s shape exemption would have let through.
    expect(offences("L4")).toContain("a lemma number");
    // The three it must not catch, as that file states them.
    expect(offences("an ML bound on the arc")).toEqual([]);
    expect(offences("INPUT")).toEqual([]);
    expect(offences("Freitag–Busam, Ch. III §7")).toEqual([]);
  });
});
