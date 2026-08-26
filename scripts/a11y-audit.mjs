#!/usr/bin/env node
// @ts-nocheck
//
// scripts/a11y-audit.mjs — U8 of ADR-0032: a NON-BLOCKING accessibility audit over the built apps.
//
// WHY THIS EXISTS
// ---------------
// The @cas/ui adoption (ADR-0032, U1–U6) *introduced* real accessibility across the suite —
// focusable canvases with `role="application"`/`role="img"` + aria-labels, ARIA live regions, a
// keyboard-driven pan/zoom/nudge layer, and a WebGL2-aware fatal-error banner. Nothing in CI
// *checks* that any of it stays. A future edit could quietly drop a label, flip a role, or mask the
// banner and every gate would stay green (the @cas/ui unit tests assert the primitives under jsdom;
// they never audit a fully-rendered app page). This script closes that gap: it loads each built app
// in headless Chromium and runs the axe-core WCAG ruleset against the real, initialized DOM.
//
// NON-BLOCKING BY DESIGN (ADR-0032, U8: "non-blocking … so a11y regressions are caught, not just
// introduced-once-and-forgotten")
// ---------------------------------------------------------------------------------------------
// Real apps carry pre-existing axe findings (a contrast ratio here, a missing landmark there).
// Failing on *all* of them would make the job perpetually red and therefore ignored; passing while
// ignoring *all* of them would make it useless. So this is a BASELINE tripwire: `a11y-baseline.json`
// records the currently-known findings per page (by rule id + node count), and only a *new* rule or
// an *increased* node count on a page counts as a regression. In CI (report mode, the default) the
// script always exits 0 — a noisy false-positive from one automated rule can never wedge `master` —
// and surfaces regressions through GitHub `::warning::` annotations and a `$GITHUB_STEP_SUMMARY`
// table. `--strict` (local / opt-in gating) exits non-zero when there are regressions.
//
// USAGE
// -----
//   node scripts/a11y-audit.mjs                 # report mode: audit, diff vs baseline, exit 0
//   node scripts/a11y-audit.mjs --strict        # exit 1 if there are regressions (local hard check)
//   node scripts/a11y-audit.mjs --update-baseline   # re-record the baseline from the current build
//   node scripts/a11y-audit.mjs riemann-map faber-transform   # audit only the named page(s)
//
// Requires the apps to be built first (`pnpm build`) — it serves the real `apps/*/dist` output, the
// exact same bytes deploy-pages.yml publishes. Chromium comes from Playwright (already a devDep and
// installed in the `browser` CI job); software WebGL2 (SwiftShader) is forced so the rendered DOM
// state matches CI regardless of the host GPU, which keeps the baseline portable.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BASELINE_PATH = join(HERE, "a11y-baseline.json");

// The pages to audit — mirrors deploy-pages.yml's _site layout (launcher at the root, each app under
// a subpath), PLUS correspondences (built but not yet published) and its mating explorer, both of
// which carry @cas/ui accessibility and so are worth guarding. `mount` is the URL segment the page's
// dist is served under; two pages may share one dist (correspondences index + mating).
const PAGES = [
  { id: "launcher", mount: "launcher", dist: "apps/launcher/dist", file: "index.html" },
  {
    id: "complex-dynamics",
    mount: "complex-dynamics",
    dist: "apps/complex-dynamics/dist",
    file: "index.html",
  },
  {
    id: "quadrature-domains",
    mount: "quadrature-domains",
    dist: "apps/quadrature-domains/dist",
    file: "index.html",
  },
  {
    id: "complex-function-plotter",
    mount: "complex-function-plotter",
    dist: "apps/complex-function-plotter/dist",
    file: "index.html",
  },
  {
    id: "riemann-map",
    mount: "riemann-map",
    dist: "apps/riemann-map/dist",
    file: "index.html",
  },
  {
    id: "argument-principle",
    mount: "argument-principle",
    dist: "apps/argument-principle/dist",
    file: "index.html",
  },
  {
    id: "faber-transform",
    mount: "faber-transform",
    dist: "apps/faber-transform/dist",
    file: "index.html",
  },
  {
    id: "correspondences",
    mount: "correspondences",
    dist: "apps/correspondences/dist",
    file: "index.html",
  },
  {
    id: "correspondences-mating",
    mount: "correspondences",
    dist: "apps/correspondences/dist",
    file: "mating.html",
  },
];

// The WCAG 2.0/2.1 A + AA conformance set plus axe's best-practice pack (landmarks/regions, valid
// ARIA usage) — the standard "does this page meet the accessibility bar" ruleset. Canvas pixels are
// opaque to axe; it audits the DOM/CSS around them, which is exactly the surface @cas/ui added.
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const SETTLE_MS = 700; // after network idle, let @cas/ui init apply roles/labels/live-regions.
const VIEWPORT = { width: 1280, height: 900 };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const pageFilter = argv.filter((a) => !a.startsWith("--"));
if (flags.has("--help")) {
  console.log(
    [
      "a11y-audit — non-blocking accessibility tripwire over the built apps (ADR-0032 U8)",
      "",
      "  node scripts/a11y-audit.mjs [pageId...] [--strict] [--update-baseline]",
      "",
      "  (no flags)          report mode: audit + diff vs baseline, always exit 0",
      "  --strict            exit 1 when there are regressions (local hard check)",
      "  --update-baseline   re-record scripts/a11y-baseline.json from the current build",
      "  pageId...           audit only the named page(s); default is all of:",
      "                      " + PAGES.map((p) => p.id).join(", "),
    ].join("\n"),
  );
  process.exit(0);
}
const STRICT = flags.has("--strict");
const UPDATE = flags.has("--update-baseline");

const selected = pageFilter.length
  ? PAGES.filter((p) => pageFilter.includes(p.id))
  : PAGES;
if (pageFilter.length) {
  const unknown = pageFilter.filter((f) => !PAGES.some((p) => p.id === f));
  if (unknown.length) {
    console.error(`Unknown page id(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
}

// ── Preflight: the apps must be built ────────────────────────────────────────
const missing = selected.filter((p) => !existsSync(join(ROOT, p.dist, p.file)));
if (missing.length) {
  console.error("✗ Missing built pages — run `pnpm build` first:");
  for (const p of missing) console.error(`    ${join(p.dist, p.file)}`);
  process.exit(2);
}

// ── Static file server over the dist trees ───────────────────────────────────
// Mounts each app's dist at /<mount>/… . Because every app builds with `base: "./"`, a page loaded
// at /<mount>/index.html resolves its assets (`./assets/…`) back under /<mount>/, so one server
// serves them all — the same relative-path property the GitHub Pages sub-paths rely on.
const mounts = new Map();
for (const p of selected) mounts.set(p.mount, resolve(ROOT, p.dist));

function serveFile(res, absPath) {
  readFile(absPath)
    .then((buf) => {
      res.writeHead(200, {
        "content-type":
          MIME[extname(absPath).toLowerCase()] ?? "application/octet-stream",
      });
      res.end(buf);
    })
    .catch(() => {
      res.writeHead(404);
      res.end("not found");
    });
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const segs = urlPath.split("/").filter(Boolean);
  const mount = segs[0];
  const distDir = mounts.get(mount);
  if (!distDir) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const rel = segs.slice(1).join("/") || "index.html";
  // Contain the resolved path within the mounted dist dir (no `..` traversal out of it).
  const abs = normalize(join(distDir, rel));
  if (!abs.startsWith(distDir)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  serveFile(res, abs);
});

async function listen() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return server.address().port;
}

// ── Audit one page ───────────────────────────────────────────────────────────
async function auditPage(context, baseUrl, page) {
  const url = `${baseUrl}/${page.mount}/${page.file}`;
  const tab = await context.newPage();
  const consoleErrors = [];
  tab.on("pageerror", (e) => consoleErrors.push(String(e)));
  try {
    // Prefer network idle so async @cas/ui init has settled; fall back to `load` if a render loop or
    // slow asset keeps the network from going quiet within the budget.
    try {
      await tab.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    } catch {
      await tab.goto(url, { waitUntil: "load", timeout: 20000 });
    }
    await tab.waitForTimeout(SETTLE_MS);
    const results = await new AxeBuilder({ page: tab }).withTags(AXE_TAGS).analyze();
    // Collapse to a per-rule fingerprint: rule id → { impact, count of violating nodes, help }.
    const rules = {};
    for (const v of results.violations) {
      rules[v.id] = { impact: v.impact ?? "n/a", count: v.nodes.length, help: v.help };
    }
    return { rules, pageErrors: consoleErrors };
  } finally {
    await tab.close();
  }
}

// ── Baseline diff ────────────────────────────────────────────────────────────
// A regression is a *new* rule on a page, or an *existing* rule whose violating-node count grew.
// (Node-count rather than brittle CSS-selector matching: robust to layout churn, still catches "this
// rule now fails on more elements".) Improvements — a rule gone or a lower count — are informational
// and prompt a baseline refresh.
function diff(current, baseline) {
  const regressions = [];
  const improvements = [];
  for (const [pageId, rules] of Object.entries(current)) {
    const base = baseline[pageId] ?? {};
    for (const [ruleId, cur] of Object.entries(rules)) {
      const b = base[ruleId];
      if (!b)
        regressions.push({
          pageId,
          ruleId,
          kind: "new",
          impact: cur.impact,
          count: cur.count,
          help: cur.help,
        });
      else if (cur.count > b.count)
        regressions.push({
          pageId,
          ruleId,
          kind: "increased",
          impact: cur.impact,
          from: b.count,
          count: cur.count,
          help: cur.help,
        });
    }
    for (const [ruleId, b] of Object.entries(base)) {
      const cur = rules[ruleId];
      if (!cur) improvements.push({ pageId, ruleId, kind: "resolved", was: b.count });
      else if (cur.count < b.count)
        improvements.push({
          pageId,
          ruleId,
          kind: "reduced",
          from: b.count,
          to: cur.count,
        });
    }
  }
  return { regressions, improvements };
}

// ── Reporting ────────────────────────────────────────────────────────────────
function summaryLine(current) {
  let rules = 0;
  let nodes = 0;
  for (const rulesForPage of Object.values(current)) {
    for (const r of Object.values(rulesForPage)) {
      rules += 1;
      nodes += r.count;
    }
  }
  return { rules, nodes };
}

function writeStepSummary(current, regressions, improvements) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const { rules, nodes } = summaryLine(current);
  const lines = [];
  lines.push("## Accessibility audit (axe-core · non-blocking)");
  lines.push("");
  lines.push(
    `Audited **${Object.keys(current).length}** page(s): **${rules}** rule finding(s), **${nodes}** node(s) — measured against the committed baseline.`,
  );
  lines.push("");
  if (regressions.length) {
    lines.push(
      `### ⚠️ ${regressions.length} regression(s) — new or increased vs baseline`,
    );
    lines.push("");
    lines.push("| Page | Rule | Impact | Detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const r of regressions) {
      const detail =
        r.kind === "new"
          ? `new (${r.count} node${r.count === 1 ? "" : "s"})`
          : `${r.from} → ${r.count} nodes`;
      lines.push(
        `| ${r.pageId} | \`${r.ruleId}\` | ${r.impact} | ${detail} — ${r.help} |`,
      );
    }
    lines.push("");
    lines.push(
      "Fix the finding, or — if it is intended — re-record the baseline with `node scripts/a11y-audit.mjs --update-baseline` and commit `scripts/a11y-baseline.json`.",
    );
  } else {
    lines.push("### ✅ No regressions against the baseline");
  }
  if (improvements.length) {
    lines.push("");
    lines.push(
      `### ✨ ${improvements.length} improvement(s) — baseline can be tightened`,
    );
    for (const i of improvements) {
      lines.push(
        i.kind === "resolved"
          ? `- ${i.pageId}: \`${i.ruleId}\` resolved (was ${i.was})`
          : `- ${i.pageId}: \`${i.ruleId}\` ${i.from} → ${i.to} nodes`,
      );
    }
  }
  lines.push("");
  writeFileSync(out, lines.join("\n") + "\n", { flag: "a" });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const port = await listen();
  const baseUrl = `http://127.0.0.1:${port}`;

  // Force software WebGL2 (SwiftShader) so the rendered DOM state — and therefore the audit — is the
  // same on any host GPU and matches the CI runner, keeping the committed baseline portable.
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE lets a host whose pre-installed Chromium build differs from the
  // pinned Playwright (e.g. this sandbox: /opt/pw-browsers/chromium) drive that binary instead of a
  // version-matched download; CI leaves it unset and uses the browser `playwright install` fetched.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });

  const current = {};
  try {
    for (const page of selected) {
      process.stdout.write(`  auditing ${page.id} … `);
      const { rules, pageErrors } = await auditPage(context, baseUrl, page);
      current[page.id] = rules;
      const nRules = Object.keys(rules).length;
      const nNodes = Object.values(rules).reduce((a, r) => a + r.count, 0);
      console.log(
        nRules
          ? `${nRules} rule(s), ${nNodes} node(s)` +
              (pageErrors.length ? `  [${pageErrors.length} page error(s)]` : "")
          : "clean",
      );
    }
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  if (UPDATE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
    const { rules, nodes } = summaryLine(current);
    console.log(
      `\n✓ Baseline written to ${BASELINE_PATH} — ${rules} rule finding(s), ${nodes} node(s) across ${Object.keys(current).length} page(s).`,
    );
    return 0;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.log("\nNo baseline found. Recording one is the next step:");
    console.log("    node scripts/a11y-audit.mjs --update-baseline");
    return 0;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const { regressions, improvements } = diff(current, baseline);

  console.log("");
  if (regressions.length) {
    console.log(`✗ ${regressions.length} accessibility regression(s) vs baseline:`);
    for (const r of regressions) {
      const detail =
        r.kind === "new"
          ? `NEW rule (${r.count} node${r.count === 1 ? "" : "s"})`
          : `node count ${r.from} → ${r.count}`;
      console.log(`    ${r.pageId}: ${r.ruleId} [${r.impact}] — ${detail}`);
      console.log(`      ${r.help}`);
      // GitHub Actions annotation — surfaces on the PR even though the job stays green (non-blocking).
      console.log(
        `::warning title=a11y regression (${r.pageId})::${r.ruleId} — ${detail}: ${r.help}`,
      );
    }
    console.log(
      "\n  If intended, re-baseline: node scripts/a11y-audit.mjs --update-baseline",
    );
  } else {
    console.log("✓ No accessibility regressions against the baseline.");
  }
  if (improvements.length) {
    console.log(
      `\nℹ ${improvements.length} improvement(s) — the baseline can be tightened (--update-baseline):`,
    );
    for (const i of improvements) {
      console.log(
        i.kind === "resolved"
          ? `    ${i.pageId}: ${i.ruleId} resolved (was ${i.was})`
          : `    ${i.pageId}: ${i.ruleId} ${i.from} → ${i.to} nodes`,
      );
    }
  }

  writeStepSummary(current, regressions, improvements);

  // Report mode (CI default) always exits 0 — the audit is non-blocking. --strict makes it a hard
  // check for local use or opt-in gating.
  return STRICT && regressions.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
