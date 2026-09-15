// Every sentence the app composes, in one document, for the owner to approve before Phase 0 merges.
//
// M8 step 0.5a. Step 0.5 rewrites the app's prose into textbook-neutral language; because these are
// the ledger's ASSERTIONS about whether an argument closes, the owner signs off on the wording
// before any of it changes. This builds that document.
//
// Three columns, and only the first is written by hand anywhere:
//
//  - **today** — read from the live code. The templates come out of `engine/claims.ts` and
//    `engine/vocabulary.ts`; everything a certificate composes is collected by running all 28
//    records at every fixture and grouping by the sentence with its numerals masked, so
//    `≤ 2.515e-5 at R = 50` and `≤ 1.1e-3 at R = 8` are one row rather than eighty.
//  - **proposed** — from `claimsProposals.ts`, which is CODE rather than a column in the markdown:
//    step 0.5b reads it to make the change, and regenerating the document cannot lose the owner's
//    edits because the document is a view of the table rather than the source of it.
//  - **flags** — computed. The plan states four rules for the new wording (no capitalised emphasis,
//    no citations of research notes or ledger passes, no lemma numbers, no house jargon), and they
//    are decidable, so every string that still breaks one says so. That is what makes the rows with
//    no proposal yet useful rather than a silent backlog.
import { readFileSync } from "node:fs";

import { CLAIM_IDS, claimTemplate } from "../../src/engine/claims.js";
import { buildDerivation, DERIVATION_STAGES } from "../../src/engine/derivation.js";
import { HEADLINES, headlineFails, stageTitle } from "../../src/engine/vocabulary.js";
import { FAMILIES } from "../../src/families/index.js";
import { solveFamily } from "../../src/families/runFamily.js";
import { PROPOSED, REPAIRS } from "./claimsProposals.js";

/** A sentence with its numbers masked, so one template does not appear eighty times. */
export function mask(s: string): string {
  return s.replace(/-?\d+(\.\d+)?([eE][-+]?\d+)?/g, "‹n›").replace(/\s+/g, " ").trim();
}

/** Capitalised words that are NOT emphasis: names, units, and the app's own notation. */
const SHOUTED_OK = new Set([
  "ML", "PV", "GLSL", "NOT", "ODE", "CPU", "GPU", "URL", "PNG", "I", "R", "N", "D", "K", "T", "S",
  "M", "L", "P", "Q", "W", "A", "B", "C", "E", "F", "G", "H", "X", "Y", "Z",
]);

/** Which of the plan's four wording rules a sentence still breaks. */
export function flagsFor(text: string): string[] {
  const flags: string[] = [];
  const shouted = [...text.matchAll(/\b[A-Z]{2,}\b/g)]
    .map((m) => m[0])
    .filter((w) => !SHOUTED_OK.has(w));
  if (shouted.length > 0) flags.push(`caps: ${[...new Set(shouted)].join(" ")}`);
  if (/research \d|§|\bPass \d|\bADR-|\bM\d\.\d|DESIGN|PLAN\.md/.test(text)) flags.push("citation");
  if (/\bL[1-6]\b/.test(text)) flags.push("lemma number");
  const jargon = ["the solve", "the family", "the record", "golden value", "the gallery", "Pass 5"]
    .filter((w) => text.includes(w));
  if (jargon.length > 0) flags.push(`jargon: ${jargon.join(", ")}`);
  // Mathematics outside `$…$`. Everything BETWEEN the delimiters is removed first, so a sentence
  // that typesets half its formulas and leaves the other half as characters is caught — which a
  // "does it contain a dollar sign" test would call clean, and which is the likelier mistake.
  // ` · ` between spaces is the app's own SEPARATOR — `boundary terms · the arc` — and not a
  // multiplication, so it is removed before the scan. Flagging it made every labelled statement read
  // as carrying undelimited mathematics when the only symbol outside the dollars was the bullet.
  const outside = text.replace(/\$[^$]*\$/g, "").replace(/ · /g, " ");
  if (/[∮∫Σπℚℤ√≤≥→∞αβγδεθλμνξρσφψω⁰¹²³⁴⁵⁶⁷⁸⁹·]/.test(outside)) flags.push("maths undelimited");
  return flags;
}

interface Row {
  readonly where: string;
  readonly today: string;
  readonly proposed: string | null;
  readonly seenIn?: number;
}

/** One `| … |` markdown row, with pipes and newlines made safe. */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/`/g, "`");
}

function table(rows: readonly Row[]): string {
  const out = ["| where | today | proposed | flags |", "|---|---|---|---|"];
  for (const r of rows) {
    // The flags describe what will SHIP: a row with a proposal is judged on the proposal, since that
    // is the sentence the rule is about. A proposal that still breaks a rule is a defect in the
    // draft, and `claimsDoc.test.ts` requires there to be none.
    const flags = flagsFor(r.proposed ?? r.today);
    const seen = r.seenIn === undefined ? "" : ` <br>*(${r.seenIn} record${r.seenIn === 1 ? "" : "s"})*`;
    out.push(
      `| \`${cell(r.where)}\`${seen} | ${cell(r.today)} | ${
        r.proposed === null
          ? "**—**"
          : r.proposed === ""
            ? "*(delete)*"
            : r.proposed === r.today
              ? "*(applied)*"
              : cell(r.proposed)
      } | ${flags.length === 0 ? "" : cell(flags.join("; "))} |`,
    );
  }
  return out.join("\n");
}

/** Everything a certificate composed, across the corpus, grouped by masked sentence. */
/** Which bucket a sentence belongs to in the review document. */
export type SentenceKind = "claim" | "method" | "provenance" | "restriction" | "statement";

/** One sentence the app composes, with where it came from. */
export interface Sentence {
  readonly kind: SentenceKind;
  readonly familyId: string;
  readonly text: string;
}

/**
 * **Every sentence the app composes, from one walk.**
 *
 * The review document and the corpus checks in `claims.test.ts` both need this, and when they each
 * had their own walk they disagreed: the check reached the ledger's rows only, so three sentences
 * that open a `$` and never close it — on DERIVATION certificates, which is where `solveTarget.ts`
 * and the bound modules do most of their talking — shipped past a test whose whole job is to catch
 * exactly that. A second reader with a narrower reach is not a weaker check, it is a check that
 * reports a clean corpus it has not read.
 */
export function everySentence(): readonly Sentence[] {
  const out: Sentence[] = [];
  const note = (kind: SentenceKind, familyId: string, text: string): void => {
    out.push({ kind, familyId, text });
  };
  for (const family of FAMILIES) {
    for (const golden of family.golden) {
      const r = solveFamily(family, golden);
      if (!r.ok) continue;
      for (const row of r.run.ledger.rows) {
        if (row.claimData.template === "certificate") note("claim", family.id, row.claim);
        note("method", family.id, row.evidence.method);
        for (const p of row.evidence.provenance) note("provenance", family.id, p.text);
        if (row.evidence.restriction !== undefined) {
          note("restriction", family.id, row.evidence.restriction);
        }
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
        for (const st of stage.statements) {
          note("statement", family.id, `${st.label} — ${st.text}`);
        }
        // **The derivation's LINES as well as its statements.** The first draft collected only the
        // statements, and so missed every sentence that reaches the reader through a line whose
        // evidence is a whole VERDICT rather than one ledger row — the solve's and the conclusion's,
        // which is where `solveTarget.ts` and `solveResidueTerm.ts` do their talking. Four citations
        // were reported where there are more.
        for (const line of stage.lines) {
          // **The line's own CLAIM, not only its method.** `line.text` is the sentence in the
          // derivation's left column — `∮ f dz = 2πi[…]`, `Res(f, ∞) = 0` — and it went uncollected
          // while `line.method` beside it was read, so the bound claims never faced the rules at
          // all. The same narrow reach as the `$`-balance check, one field over.
          note("claim", family.id, line.text);
          note("method", family.id, line.method);
          for (const step of line.provenance) note("provenance", family.id, step.text);
          if (line.restriction !== undefined) note("restriction", family.id, line.restriction);
        }
      }
    }
  }
  return out;
}

function fromCorpus(): {
  readonly claims: Row[];
  readonly methods: Row[];
  readonly provenance: Row[];
  readonly restrictions: Row[];
  readonly statements: Row[];
} {
  const buckets: Record<SentenceKind, Map<string, { text: string; n: number }>> = {
    claim: new Map(),
    method: new Map(),
    provenance: new Map(),
    restriction: new Map(),
    statement: new Map(),
  };
  for (const s of everySentence()) {
    const m = buckets[s.kind];
    const key = mask(s.text);
    const seen = m.get(key);
    if (seen === undefined) m.set(key, { text: s.text, n: 1 });
    else seen.n += 1;
  }
  const rows = (m: Map<string, { text: string; n: number }>, where: string): Row[] =>
    [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v], k) => ({
        where: `${where} ${k + 1}`,
        today: v.text,
        proposed: PROPOSED[mask(v.text)] ?? null,
        seenIn: v.n,
      }));
  return {
    claims: rows(buckets.claim, "bound claim"),
    methods: rows(buckets.method, "method"),
    provenance: rows(buckets.provenance, "provenance"),
    restrictions: rows(buckets.restriction, "restriction"),
    statements: rows(buckets.statement, "statement"),
  };
}

/** The whole review document. */
export function claimsDocument(): string {
  const corpus = fromCorpus();
  const templates: Row[] = CLAIM_IDS.filter((id) => id !== "certificate").map((id) => ({
    where: id,
    today: claimTemplate(id),
    proposed: PROPOSED[id] ?? null,
  }));
  const headlines: Row[] = [
    { where: "headline · closes", today: HEADLINES.closes, proposed: PROPOSED["headline.closes"] ?? null },
    {
      where: "headline · sandbox",
      today: HEADLINES.sandbox,
      proposed: PROPOSED["headline.sandbox"] ?? null,
    },
    { where: "headline · incomplete", today: HEADLINES.incomplete, proposed: PROPOSED["headline.incomplete"] ?? null },
    ...(["LEGALITY", "CATCH", "KILL", "COVER"] as const).map((id) => ({
      where: `headline · fails ${id}`,
      today: headlineFails(id),
      proposed: PROPOSED[`headline.fails.${id}`] ?? null,
    })),
  ];
  const stages: Row[] = DERIVATION_STAGES.flatMap((stage) => [
    { where: `stage ${stage.id} · title`, today: stageTitle(stage.id), proposed: PROPOSED[`stage.${stage.id}.title`] ?? null },
    { where: `stage ${stage.id} · why`, today: stage.why, proposed: PROPOSED[`stage.${stage.id}.why`] ?? null },
  ]);
  // **Repairs read the source, because nothing else can reach them.** A repair is only composed on a
  // FAILING row and every gallery record closes, so the corpus walk never yields one and the table
  // has to be written by hand. That is fine; freezing `today` was not. Step 0.5b applied eight of
  // these and the column went on printing the pre-0.5b sentence, which reported finished work as
  // outstanding — so `today` is now the proposal where the proposal is what the code says, decided
  // by looking. The needle is a VALUE and the haystack SOURCE, so a backslash is one character here
  // and two there.
  const composed = ["ledger.ts", "contour/integrate.ts"]
    .map((f) => readFileSync(new URL(`../../src/engine/${f}`, import.meta.url), "utf8"))
    .join("\n");
  const applied = (text: string): boolean => composed.includes(text.replace(/\\/g, "\\\\"));
  const repairs: Row[] = REPAIRS.map((r, k) => ({
    where: `repair ${k + 1}`,
    today: r.proposed !== null && applied(r.proposed) ? r.proposed : r.today,
    proposed: r.proposed,
  }));

  const everyRow = [
    ...templates, ...headlines, ...stages, ...repairs,
    ...corpus.claims, ...corpus.methods, ...corpus.provenance, ...corpus.restrictions,
    ...corpus.statements,
  ];

  /** One line per rule: how many sentences it names, and two of them. */
  const blanket = ([
    ["caps", "**De-shout every emphasised word.** A single word in capitals for emphasis — `the orders ADD`, `the bound's VALUE` — becomes ordinary type. Names keep their capitals."],
    ["citation", "**Delete every internal citation.** `research 06 §2.1`, `Pass 5`, `finding D-2`: a reader has no such documents. Each is replaced by the statement it was citing, or removed."],
    ["lemma number", "**Name the lemmas rather than numbering them.** `L4` becomes *the indentation lemma*, `L5` *the large-arc lemma*, `L3` *Jordan’s lemma*."],
    ["jargon", "**Drop the house words.** `the solve`, `the family`, `the record`, `golden value` name parts of this program, not of the mathematics."],
    ["maths undelimited", "**Every formula moves inside `$…$`** and is typeset. Text outside the dollars stays text."],
  ] as const)
    .map(([kind, sentence]) => {
      // Counted on TODAY, which is what the rule names — a row whose draft already satisfies the
      // rule is still one the decision covers, and saying so is how the owner sees that most of the
      // work is drafted rather than outstanding.
      const hit = everyRow.filter((r) => flagsFor(r.today).some((f) => f.startsWith(kind)));
      const open = hit.filter((r) => flagsFor(r.proposed ?? r.today).some((f) => f.startsWith(kind)));
      const sample = (open.length > 0 ? open : hit)
        .slice(0, 2)
        .map((r) => `  - \`${r.where}\` — ${cell(r.today)}`);
      const drafted = hit.length - open.length;
      return `- ${sentence} **${hit.length} sentence${hit.length === 1 ? "" : "s"}${
        drafted === 0 ? "" : `, ${drafted} already drafted below`
      }.**\n${sample.join("\n")}`;
    })
    .join("\n\n");

  const counted = (rows: readonly Row[]): string =>
    `${rows.filter((r) => r.proposed !== null).length} of ${rows.length} proposed`;
  const flagged = [
    ...templates, ...headlines, ...stages, ...repairs,
    ...corpus.claims, ...corpus.methods, ...corpus.provenance, ...corpus.restrictions, ...corpus.statements,
  ].filter((r) => flagsFor(r.proposed ?? r.today).length > 0).length;

  return `# M8 — every sentence the app composes

**Generated. Do not edit this file by hand** — it is a view of \`apps/contour-integration/test/helpers/claimsProposals.ts\`,
which is what step 0.5b reads. To change a proposal, change that table and regenerate:

\`\`\`
cd apps/contour-integration && M8_WRITE_CLAIMS=1 pnpm exec vitest run test/claimsDoc.test.ts
\`\`\`

## What this is, and what is being asked

Step 0.5 of [the M8 plan](../M8-plan.md) rewrites the app's prose into terse, textbook-neutral
language. These sentences are not decoration: they are the Closing Ledger's **assertions** about
whether a contour argument is complete, so the owner approves the wording before it changes.

**Applied.** The five blanket decisions below were approved and step 0.5b carried them out, so a
row reading ***(applied)*** is a sentence whose proposal is now what the app says. What is left is
the sentences the review flagged without rewriting — the bound and provenance strings — which are
still being worked through one module at a time.

**What to read.** The *today* column is the live code. The *proposed* column is a draft, taken from
[\`review-inputs/content-review.md\`](review-inputs/content-review.md) §2 where that review wrote one.
A **—** means no replacement is proposed yet: either the sentence is fine as it stands, or it needs a
decision. The *flags* column is computed against the plan's four rules — no capitalised emphasis, no
citations of research notes or ledger passes, no lemma numbers \`L1\`…\`L6\`, no house jargon — plus a
fifth note, \`maths undelimited\`, marking a sentence whose mathematics has to move inside \`$…$\` when
the shell starts typesetting. **A row with a proposal is flagged on the PROPOSAL**, since that is the
sentence that will ship.

**How to reply.** Anything: a line-by-line edit, a sweep of "these are fine, change only the flagged
ones", or a rule you want applied that is not in the list.

**Status:** ${counted([...templates, ...headlines, ...stages, ...repairs])} in the ledger's own
sentences; ${flagged} sentences across the whole document still break at least one rule.

---

## The five decisions, if you would rather not read 200 rows

Most of what the tables below flag is one habit repeated, so each rule is offered as a blanket
decision with its count and a sample. Approving a rule here settles every row it names; the tables
are then only for the sentences you want to word differently.

${blanket}

**A sixth, which no rule catches.** Several sentences argue with the reader rather than stating a
result — *"one number implying the other is the conflation the dogbone exists to break"*, *"the
single commonest error in the subject"*. The proposed replacements drop them. Say if you would
rather keep any.

---

## 1. Ledger row claims

The one sentence each row of the ledger asserts. \`{name}\` is a substituted value — a piece's name, a
count, a measured number — so the wording is everything around it.

${table(templates)}

## 2. Repairs

Shown beneath a failing row: what to do about it. Never seen in the gallery, because every record
closes; these are the sandbox's.

${table(repairs)}

## 3. Headlines

The single sentence above the ledger.

${table(headlines)}

## 4. Derivation stages

The seven headings of the generated derivation, and the paragraph under each.

${table(stages)}

## 5. Derivation statements

Lines the derivation states without a rigor label — an identity, a cross-check, a borrowed value.

${table(corpus.statements)}

## 6. Bound and limit claims

Composed in \`kernel/bounds/*\` and \`kernel/branch/*\`, and displayed as a ledger row's claim. Step
0.3 deliberately left these as strings: each bakes in the numbers next to the arithmetic that
produced them. One row per distinct sentence, numerals masked.

${table(corpus.claims)}

## 7. Methods

The "how do we know" line under every row.

${table(corpus.methods)}

## 8. Provenance steps

The ✓/✗ audit trail inside a row's evidence, shown when a row is expanded.

${table(corpus.provenance)}

## 9. Restrictions

${table(corpus.restrictions)}
`;
}
