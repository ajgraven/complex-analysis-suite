// generate-invariants.ts — the G-relative invariant for every maximal transitive pair of degree ≤ 7,
// written to src/engine/galois/data/invariants.json (ADR-0047 PRA-5, DESIGN §4.6 step 3).
//
//   node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/generate-invariants.ts
//
// The search is `findInvariant` itself — lowest degree, then smallest orbit — so the stored monomial is
// exactly what the runtime would find; storing it saves the one expensive search (S₆ ⊃ PGL(2,5): none of
// degree ≤ 5 exists, and proving that takes seconds). The runtime still checks each stored monomial's
// stabiliser before using it. The index-2 even subgroup (G ∩ Aₙ) is decided by the discriminant, so it
// has no entry.
import { readFileSync, writeFileSync } from "node:fs";
import { findInvariant } from "../src/engine/galois/invariant.ts";

interface Raw {
  label: string;
  order: number;
  even: boolean;
  generators: number[][];
  maximalTransitive?: { label: string; generators: number[][] }[];
}
const url = new URL("../src/engine/galois/data/transitive.json", import.meta.url);
const degrees = (
  JSON.parse(readFileSync(url, "utf8")) as { degrees: Record<string, Raw[]> }
).degrees;
const byLabel = new Map(
  Object.values(degrees)
    .flat()
    .map((g) => [g.label, g]),
);

const out: Record<string, number[]> = {};
for (let n = 3; n <= 7; n++)
  for (const g of degrees[n])
    (g.maximalTransitive ?? []).forEach((m, i) => {
      const h = byLabel.get(m.label);
      if (!h) throw new Error(`unknown ${m.label}`);
      if (h.even && !g.even && 2 * h.order === g.order) return;
      const inv = findInvariant(`${g.label}/${i}`, g.generators, m.generators, n);
      out[`${g.label}/${i}`] = [...inv.monomial];
      console.info(
        `${g.label}/${i} → ${m.label}: ${inv.monomial.join("")} (orbit ${inv.orbit.length})`,
      );
    });
// PRA-6: one Sₙ-relative invariant per transitive group H (Sₙ and Aₙ aside). Stab_{Sₙ}(F) = H makes
// Stab_G(F) = H ∩ G = H for EVERY G ⊇ H, so these serve the correspondence's transitive nodes and the
// groups containing Gal at once, whatever G the descent ended at.
for (let n = 3; n <= 7; n++) {
  const sn = degrees[n].reduce((a, b) => (b.order > a.order ? b : a));
  for (const h of degrees[n]) {
    if (h.label === sn.label || (h.even && 2 * h.order === sn.order)) continue;
    const inv = findInvariant(`Sn/${h.label}`, sn.generators, h.generators, n);
    out[`Sn/${h.label}`] = [...inv.monomial];
    console.info(`S${n} ⊃ ${h.label}: ${inv.monomial.join("")} (orbit ${inv.orbit.length})`);
  }
}
writeFileSync(
  new URL("../src/engine/galois/data/invariants.json", import.meta.url),
  `${JSON.stringify(out, null, 1)}\n`,
);
