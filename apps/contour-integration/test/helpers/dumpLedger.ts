// Every sentence the engine composes, for every record and every fixture, as one deterministic text.
//
// M8 step 0.3 restructures the ledger's claims from strings into `{template, args}` objects so that
// step 0.5 can rewrite the wording as DATA and step 0.4 can put a LaTeX sibling beside each argument.
// A restructure of forty sentence sites is exactly the kind of change that silently moves one of
// them, and the app's own history says so: M5.6b proved its no-op this way over 23 records and 79
// fixtures, and M6.1 proved its state extraction the same way over 710 lines.
//
// So: dump first, restructure second, and require the dump to be **byte-identical**. A diff of one
// character is a claim that changed, and the test names the record it changed in.
//
// The dump covers what a reader sees and nothing else: the ledger's rows (group, status, claim,
// method, repair) and the derivation's stages, statements and lines. It deliberately does NOT carry
// values, verdicts or timings — those are pinned by the golden corpus, and putting them here would
// make this file fail for reasons that are not about wording.
//
// One surface is deliberately outside it: the derivation's `setup` stage is built from statements the
// SHELL supplies (`problemStatements()` — the target, the contour integrand and the relation), which
// come from `families/describe.ts` and are pinned by `test/onScreenClaims.test.ts` instead. Calling
// `buildDerivation` without them, as here, leaves that stage empty and out of the dump.
import { buildDerivation } from "../../src/engine/derivation.js";
import { ledgerHeadline } from "../../src/engine/ledger.js";
import { FAMILIES } from "../../src/families/index.js";
import { solveFamily } from "../../src/families/runFamily.js";
import type { Golden } from "../../src/families/schema.js";

const fixtureLabel = (g: Golden): string => {
  const parts = Object.entries(g.params).map(([k, v]) => `${k}=${String(v)}`);
  return parts.length > 0 ? parts.join(",") : "-";
};

/**
 * The whole corpus's prose, one line per sentence, tab-separated.
 *
 * Deterministic by construction: `FAMILIES` is a literal array, each record's `golden` is a literal
 * array, and every row and line below is taken in the order the engine emits it. Nothing here
 * iterates a `Map` or an object's keys.
 */
export function dumpCorpus(): string {
  const out: string[] = [];
  for (const family of FAMILIES) {
    family.golden.forEach((golden, k) => {
      out.push(`## ${family.id} [${k}] {${fixtureLabel(golden)}}`);
      const r = solveFamily(family, golden);
      if (!r.ok) {
        out.push(`!\t${r.reason}`);
        return;
      }
      out.push(`H\t${ledgerHeadline(r.run.ledger)}`);
      for (const row of r.run.ledger.rows) {
        out.push(
          `R\t${row.constraint}\t${row.status}\t${row.pieceId ?? ""}\t${row.claim}\t${
            row.evidence.method
          }\t${row.repair ?? ""}`,
        );
      }
      const derivation = buildDerivation({
        ledger: r.run.ledger,
        poles: r.run.poles,
        integral: r.run.integral,
        theorem: r.run.theorem,
        spec: r.run.contour.pieces,
        solved: r.solved,
      });
      for (const stage of derivation.stages) {
        out.push(`T\t${stage.id}\t${stage.title}\t${stage.why}`);
        for (const s of stage.statements) out.push(`S\t${stage.id}\t${s.label}\t${s.text}`);
        for (const line of stage.lines) {
          out.push(
            `D\t${stage.id}\t${line.level}\t${line.status}\t${line.pieceName ?? ""}\t${line.text}\t${
              line.method
            }\t${line.restriction ?? ""}`,
          );
          for (const step of line.provenance) out.push(`P\t${stage.id}\t${step.ok}\t${step.text}`);
        }
      }
    });
  }
  return out.join("\n") + "\n";
}
