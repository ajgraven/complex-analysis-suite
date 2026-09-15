// The wording of every claim, pinned byte for byte, across the whole corpus.
//
// M8 step 0.3's no-op proof. The ledger's forty-odd sentence sites become `{template, args}` objects
// rendered by one function; the point of the step is that the rendering is IDENTICAL, so that step
// 0.5 can then change the wording deliberately, in one place, and see exactly what moved.
//
// `test/fixtures/ledger-dump.txt` is the baseline, captured from the tree BEFORE the restructure.
// Regenerate it deliberately — never to make this test pass:
//
//     M8_WRITE_DUMP=1 pnpm exec vitest run test/ledgerDump.test.ts
//
// After step 0.5 this file stays exactly as it is: the baseline is then the NEW wording, and the
// same test goes on catching a sentence that moves without anyone meaning it to.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { dumpCorpus } from "./helpers/dumpLedger.js";

const BASELINE = fileURLToPath(new URL("./fixtures/ledger-dump.txt", import.meta.url));

// One pass over the corpus, shared: solving 28 records at every fixture is the expensive half of
// this file, and both tests ask about the same text.
const dump = dumpCorpus();

describe("every claim the engine composes", () => {
  it("is byte-identical to the recorded baseline", () => {
    if (process.env.M8_WRITE_DUMP === "1") {
      writeFileSync(BASELINE, dump);
      return;
    }
    const baseline = readFileSync(BASELINE, "utf8");
    if (dump === baseline) {
      expect(dump).toBe(baseline);
      return;
    }
    // A whole-file diff of 1,000+ lines is unreadable in a test report, and the useful question is
    // always "which record changed, and in which sentence". Report the first few differing lines
    // with their record heading.
    const got = dump.split("\n");
    const want = baseline.split("\n");
    const differing: string[] = [];
    let heading = "(before the first record)";
    for (let i = 0; i < Math.max(got.length, want.length) && differing.length < 8; i++) {
      const g = got[i] ?? "(missing)";
      const w = want[i] ?? "(missing)";
      if (g.startsWith("## ")) heading = g;
      if (g !== w) differing.push(`${heading}\n  line ${i + 1}\n  was:  ${w}\n  now:  ${g}`);
    }
    expect(
      `${got.length} lines against the baseline's ${want.length}\n\n${differing.join("\n\n")}`,
    ).toBe("");
  });

  it("covers every record and every fixture, so the baseline cannot pass by being empty", () => {
    const headings = dump.split("\n").filter((l) => l.startsWith("## "));
    expect(new Set(headings.map((h) => h.split(" ")[1])).size).toBe(28);
    expect(headings.length).toBeGreaterThanOrEqual(79);
    // Rows, derivation lines and provenance steps all present — the three shapes the restructure
    // touches. A dump that lost one of them would otherwise still compare equal to itself.
    for (const tag of ["R\t", "D\t", "P\t", "T\t", "S\t", "H\t"]) {
      expect(dump.split("\n").filter((l) => l.startsWith(tag)).length, tag).toBeGreaterThan(20);
    }
  });
});
