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
// THE TREE WALK IS A SECOND INSTRUMENT, NOT A SECOND RULESET (M8 step 5.2)
// ------------------------------------------------------------------------
// axe answers *does this page break a WCAG rule?*; the tree walk answers *is every control a
// screen reader can reach one it can NAME?* — which axe's rules only cover for the element types
// they know about. **Measured, and it is why this is here at all:** a `<div tabindex="0">` with no
// role and no text is a tab stop announced as nothing, and axe reports the page CLEAN; the tree
// walk catches it (`generic`, 1 of 58). It runs in the same visit as axe, against the same roster,
// the same hashes and the same `expect` guard, so it audits exactly the states axe audits.
//
// It has **no baseline of its own and no flag**, both deliberately. No baseline, because there is
// no acceptable non-zero number: recording tolerated unnamed controls would be recording that some
// of this suite cannot be operated without sight. No flag, because measured over the whole roster
// it costs **2.4%** (52.66 s → 53.93 s across 20 pages) and the suite is already at zero — 845
// interactive nodes, none unnamed — so it starts from a clean sheet and a knob nobody turns would
// only be a way to stop looking.
//
// **The tree is the instrument, and a DOM walk is not.** M6.4 established this and M8 steps 5.1
// and 5.2 each re-established it: a walk reading `aria-label ?? textContent` reported twelve
// unnamed controls on a page whose tree has none, because a wrapping `<label>` names an input that
// carries no `aria-label` of its own.
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
// dist is served under; a multi-page app lists one entry per page, all sharing the app's one dist
// (2d-electrostatics index/polygon; hele-shaw-flow index/twist/droplet; correspondences
// index/mating). The three ADR-0036 apps carry the @cas/ui canvas/boundary a11y, so all their pages
// are audited here. (Re-read 2026-09-20: this also credited the shared nav header, `mountNavHeader`
// — ADR-0044 deleted it along with `packages/ui/src/nav.css`, and the roster entries stand on the
// canvas/boundary half alone.)
/**
 * A `#vs=` permalink for this suite's view-state envelope, written out rather than pasted.
 *
 * One roster entry needs a page state that is NOT the default: M7.1 found that this roster audits
 * every page in its landing state, so a panel nobody opens — or a drill rung nobody reaches — is
 * never audited at all, and the alternative was measuring those states by hand once. Contour
 * Integration's drill rungs are addressable by design (M7's gate clause 2), so the roster can simply
 * ASK for one. The wire keys are the app's (`shell/viewState.ts`); if they ever change, the `expect`
 * selector below fails loudly rather than quietly auditing the default page.
 */
const viewState = (app, state) =>
  `#vs=${Buffer.from(JSON.stringify({ v: 1, app, state }), "utf8").toString("base64url")}`;

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
    id: "2d-electrostatics",
    mount: "2d-electrostatics",
    dist: "apps/2d-electrostatics/dist",
    file: "index.html",
  },
  {
    id: "2d-electrostatics-polygon",
    mount: "2d-electrostatics",
    dist: "apps/2d-electrostatics/dist",
    file: "polygon.html",
  },
  {
    id: "2d-hydrodynamics",
    mount: "2d-hydrodynamics",
    dist: "apps/2d-hydrodynamics/dist",
    file: "index.html",
  },
  {
    id: "hele-shaw-flow",
    mount: "hele-shaw-flow",
    dist: "apps/hele-shaw-flow/dist",
    file: "index.html",
  },
  {
    id: "hele-shaw-flow-twist",
    mount: "hele-shaw-flow",
    dist: "apps/hele-shaw-flow/dist",
    file: "twist.html",
  },
  {
    id: "hele-shaw-flow-droplet",
    mount: "hele-shaw-flow",
    dist: "apps/hele-shaw-flow/dist",
    file: "droplet.html",
  },
  {
    id: "potential-theory",
    mount: "potential-theory",
    dist: "apps/potential-theory/dist",
    file: "index.html",
  },
  {
    id: "contour-integration",
    mount: "contour-integration",
    dist: "apps/contour-integration/dist",
    file: "index.html",
  },
  {
    // The faded drill at rung ii (M7.3), reached by its own permalink: the ledger's KILL column is
    // masked and replaced by a question per piece, which is a different set of controls from
    // anything the default page shows. `expect` is what keeps this honest — a link this build no
    // longer honours leaves the card absent, and the run fails by name instead of auditing the
    // landing state under a label that claims otherwise.
    //
    // **The selector changed at M8 step 1.12**, with the shell it points into: the drill is a
    // right-rail card rather than a full-screen overlay, so it is `[data-card="drill"]` and its
    // question rows are ordinary selects inside `.pickRow` rather than a class of their own. It is
    // also no longer `hidden` when shut — it is simply not rendered, which is what `render.ts` does
    // with every card a mode does not offer.
    id: "contour-integration-drill",
    mount: "contour-integration",
    dist: "apps/contour-integration/dist",
    file: "index.html",
    hash: viewState("ci", { m: "g", r: "jordan-cosine-kernel", bi: { a: 1, b: 1 }, dr: ["oscillatory", 2] }),
    expect: '[data-card="drill"] .pickRow select',
  },
  {
    // **Rung iii's PREDICTION** — M8 step 3.4, and it is here for M7.1's reason: the roster audits
    // every page in its LANDING state, so a control that appears only after a reader has pressed
    // something is a control nobody audits. The prediction is stricter than that even — it is
    // replaced by its own reveal the moment it is answered, so it exists only in the state this
    // link opens. `expect` is what keeps it honest: a build that stopped asking the question would
    // fail by name here rather than quietly auditing the menu under a label claiming otherwise.
    //
    // `rational` rather than `oscillatory`: both get the half-plane question, and this one's answer
    // is `either`, so the roster's entry does not turn into a hint about the interesting task.
    id: "contour-integration-predict",
    mount: "contour-integration",
    dist: "apps/contour-integration/dist",
    file: "index.html",
    hash: viewState("ci", { m: "g", r: "jordan-cosine-kernel", bi: { a: 0, b: 1 }, dr: ["rational", 3] }),
    expect: "[data-card=\"drill\"] [data-predict-option]",
  },
  {
    // **The WORKED EXAMPLE, at the limit step** — M8 step 3.6, and the plan's own gate clause for
    // this phase. Its wording is *a Worked-example permalink at step 5 of A6*, written before the
    // step list existed; measured, A6 (`semicircle-quartic`, the app's cold start) has eight steps
    // and the fifth is a static bound with no controls at all, while `st: 5` — step 6 of 8,
    // *Let R → ∞* — is step 3.2's Play / Step pair and its checkpoint table, the largest control
    // set Phase 3 added. A roster entry is worth having for the controls it reaches, so it is that
    // step. **And the first draft named B1**, which has seven: the same index is a different step
    // in every record, which is exactly why `expect` names a selector and not a step.
    //
    // **The link could not be written until this step**, which is the other half of the clause:
    // the reader's place in an argument is SESSION state and no field on the wire carried it, so
    // the stepper's step bodies, its callouts and 3.2's table were a surface the roster could never
    // reach — it audits a page in the state a link opens it in. `expect` keeps it honest: a build
    // that stopped honouring the step would leave `.stepBody` absent and fail by name, rather than
    // auditing the whole-argument view under a label claiming otherwise.
    id: "contour-integration-worked",
    mount: "contour-integration",
    dist: "apps/contour-integration/dist",
    file: "index.html",
    hash: viewState("ci", { m: "g", r: "semicircle-quartic", we: 1, st: 5 }),
    expect: '[data-card="derivation"] .stepBody[data-step]',
  },
  {
    id: "polynomial-roots",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
  },
  {
    // A NAMED PLACE, reached through its own permalink. The roster audits a page in its landing state,
    // so the places panel's captions — which carry the cited theorems — would otherwise only ever be
    // audited in the default view. This one also proves the link still opens: `expect` names a selector
    // the place's own state produces, so a build that stopped honouring the link fails by name instead of
    // quietly auditing the front page under a label claiming otherwise (the M7.1 / M7.4 lesson).
    id: "polynomial-roots-place",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { preset: "trinary", dmax: 14 }),
    // Keyed on the DECODED alphabet, not on anything the default page also has: `.place-fact` was the
    // first choice and is present whatever link opened the page, so it would have audited the front page
    // under this name without noticing.
    expect: '.controls[data-alphabet="trinary"]',
  },
  {
    // THE LIMIT-SET ENGINE, through its own permalink. Its three controls — the engine picker's second
    // choice, the depth slider and the band toggle — are `hidden` under the root engine, and a hidden
    // element is not in the accessibility tree, so the landing-state audit above can never reach them.
    // The M7.1 lesson again: a panel nothing opens is never audited.
    id: "polynomial-roots-limit",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { engine: "limit", depth: 26 }),
    expect: '.controls[data-engine="limit"]',
  },
  {
    // THE DEEP ENGINE, through its own permalink. Its panel — the probe, the arithmetic, the residual —
    // exists only at a zoom the front page cannot reach, and the reader who gets there arrives by a
    // link. The centre is carried as a decimal STRING, so this entry also proves the codec still
    // honours one: a link the app stopped reading would audit the landing page under this name.
    id: "polynomial-roots-deep",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", {
      engine: "deep",
      cx: "4.206512041286740015298812143756041e-1",
      cy: "4.8372964222232227103378339664795e-1",
      h: 1e-18,
    }),
    expect: '.controls[data-engine="deep"]',
  },
  {
    // The dragon inset, PINNED. A hover is not state, so the only way the roster can reach the inset at
    // all is through a link that carries a lamp — which is the M7.4 lesson (a panel nothing opens is
    // never audited) arriving as a reason for the field to be in the permalink in the first place.
    id: "polynomial-roots-dragon",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { cx: "0.375453", cy: "0.544825", h: 0.06, dmax: 18, lamp: [0.375453, 0.544825] }),
    expect: '.panel.dragon[data-pinned="yes"]',
  },
  {
    // PR-5: the published-bound overlay. Its legend and its toggle exist only for an alphabet the
    // literature bounds and only with the bound drawn, so the default page never shows them.
    id: "polynomial-roots-bounds",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { preset: "zero-one", h: 1.75, dmax: 18, bounds: true }),
    expect: '.controls[data-bounds="on"]',
  },
  {
    // PR-5: the per-degree statistics table, through the zoom story's first frame. The table appears
    // only once two degrees have reported, so an audit of the landing page can run before it exists;
    // this entry WAITS for it, which makes the table's audit deterministic rather than a race.
    id: "polynomial-roots-story",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { cx: "0.42065", cy: "0.48354", h: 0.31254, dmax: 20 }),
    expect: ".panel.stats table.degree-table",
  },
  {
    // M6: Egan's hue. Its coefficient slider and legend exist only in that mode, so the landing page
    // never shows them; the panel's `data-colour` is set from the state, which is the proof the link
    // was honoured rather than the landing page audited under this entry's name.
    id: "polynomial-roots-egan",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { colour: "egan", hue: 4 }),
    expect: '.controls[data-colour="egan"]',
  },
  {
    // M6.3: the custom alphabet's symmetry readout — a list that exists only for a typed alphabet.
    id: "polynomial-roots-custom",
    mount: "polynomial-roots",
    dist: "apps/polynomial-roots/dist",
    file: "index.html",
    hash: viewState("pr", { preset: "custom", custom: "1, i, -1", dmax: 10 }),
    expect: '.controls[data-alphabet="custom"] ul.symmetries:not([hidden])',
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
  {
    // Built but not yet published (ADR-0047 publishes at PRA-5), audited from PRA-0 like
    // correspondences so the page is clean before it has anything on it.
    id: "polynomial-root-analysis",
    mount: "polynomial-root-analysis",
    dist: "apps/polynomial-root-analysis/dist",
    file: "index.html",
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
      "",
      "  Every run also walks the accessibility TREE and reports each page's interactive",
      "  node count and its unnamed count, which must be zero (--strict makes it fail).",
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
// The roles a screen-reader user OPERATES. Not a closed list of what matters — it is unioned with
// everything the tree marks `focusable`, because a role list alone misses controls that have no
// widget role at all. Measured on this suite: the union adds eleven `DisclosureTriangle`s (the
// `<summary>` of every derivation stage) on the contour app's landing page, so the app's most
// numerous control is exactly the one a role-keyed walk cannot see.
const WIDGET_ROLES = new Set([
  "button", "link", "textbox", "combobox", "checkbox", "radio", "slider", "application",
  "tab", "switch", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "searchbox", "treeitem",
]);

/**
 * Walk the page's ACCESSIBILITY TREE over CDP and count what a screen reader can operate.
 *
 * `ignored` nodes are excluded — they are in the tree but not exposed — and a node counts as named
 * when its computed name is non-empty after trimming, which is the same question a screen reader
 * asks when it announces a control.
 *
 * **Both of those guards are currently unobservable on this suite, measured.** No ignored node on
 * the audited pages is focusable or widget-roled, so dropping `!ignored` changes no count; and
 * Chromium computes `aria-label=" "` to an EMPTY name already, so dropping `.trim()` changes no
 * count either. They stay because each states what the question IS — an ignored node is one a
 * screen reader cannot reach, and a name of spaces is not a name — rather than because a number
 * moves today.
 */
async function walkTree(context, tab) {
  const cdp = await context.newCDPSession(tab);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const focusable = (n) => n.properties?.some((q) => q.name === "focusable" && q.value?.value === true);
    const live = nodes.filter(
      (n) => !n.ignored && ((n.role && WIDGET_ROLES.has(n.role.value)) || focusable(n)),
    );
    const unnamed = live.filter((n) => !(n.name?.value && n.name.value.trim()));
    return {
      interactive: live.length,
      unnamed: unnamed.length,
      // Enough to FIND it: the role plus whatever the DOM node was, since by definition there is no
      // name to quote back.
      detail: unnamed.slice(0, 10).map((n) => n.role?.value ?? "(no role)"),
    };
  } finally {
    await cdp.detach();
  }
}

async function auditPage(context, baseUrl, page) {
  const url = `${baseUrl}/${page.mount}/${page.file}${page.hash ?? ""}`;
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
    // A page audited in a NON-default state has to prove it got there. Loud on purpose: a silent
    // fallback to the landing state would keep reporting "clean" about something else entirely.
    if (page.expect !== undefined) {
      try {
        await tab.waitForSelector(page.expect, { timeout: 5000 });
      } catch {
        throw new Error(
          `${page.id}: '${page.expect}' never appeared — the state this entry audits was not reached ` +
            `(its permalink is probably no longer honoured), so the audit would have been of the ` +
            `default page under the wrong name`,
        );
      }
    }
    // Before axe rather than after. **Measured, axe's injection does not move the numbers** (57
    // interactive / 0 unnamed on the contour app's landing page either side of an `analyze()`), so
    // this is an ordering preference and not a fix: the tree is asked about the page as the app
    // rendered it, with nothing else's script in the DOM.
    const tree = await walkTree(context, tab);
    const results = await new AxeBuilder({ page: tab }).withTags(AXE_TAGS).analyze();
    // Collapse to a per-rule fingerprint: rule id → { impact, count of violating nodes, help }.
    const rules = {};
    for (const v of results.violations) {
      rules[v.id] = { impact: v.impact ?? "n/a", count: v.nodes.length, help: v.help };
    }
    return { rules, pageErrors: consoleErrors, tree };
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

function writeStepSummary(current, regressions, improvements, trees) {
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
  // The tree walk's own row — apart from the baseline table because it is a different instrument
  // (see the header): axe asks whether a rule is broken, this asks whether every control a screen
  // reader can reach has a name.
  const unnamed = Object.entries(trees).filter(([, t]) => t.unnamed > 0);
  const total = Object.values(trees).reduce((a, t) => a + t.interactive, 0);
  lines.push("");
  lines.push("### Accessibility tree");
  lines.push("");
  if (unnamed.length === 0) {
    lines.push(`✅ **${total}** interactive node(s), **0** unnamed.`);
  } else {
    lines.push(`⚠️ **${total}** interactive node(s); **unnamed** on ${unnamed.length} page(s):`);
    lines.push("");
    lines.push("| Page | Unnamed | Of | Roles |");
    lines.push("| --- | --- | --- | --- |");
    for (const [pageId, t] of unnamed) {
      lines.push(`| ${pageId} | ${t.unnamed} | ${t.interactive} | ${t.detail.join(", ")} |`);
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
  // Lets a host whose pre-installed Chromium build differs from the pinned Playwright (e.g. this
  // sandbox: /opt/pw-browsers/chromium) drive that binary instead of a version-matched download; CI
  // leaves both unset and uses the browser `playwright install` fetched.
  //
  // Two names and a probe, matching `packages/gpu/vitest.browser.config.ts`:
  // `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is this script's own, `CAS_CHROMIUM_EXECUTABLE` is the one the
  // app browser suites use and the one CLAUDE.md documents, and `/opt/pw-browsers/chromium` is the
  // managed dev container's path — so the roster runs there with nothing set at all. A documented
  // variable that works for `pnpm test:browser` and silently not for `pnpm a11y` costs a session the
  // time to find out why; in CI all three are absent and the provider uses its own build.
  const LOCAL_CHROME = "/opt/pw-browsers/chromium";
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    process.env.CAS_CHROMIUM_EXECUTABLE ||
    (existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });

  const current = {};
  const trees = {};
  try {
    for (const page of selected) {
      process.stdout.write(`  auditing ${page.id} … `);
      const { rules, pageErrors, tree } = await auditPage(context, baseUrl, page);
      current[page.id] = rules;
      trees[page.id] = tree;
      const nRules = Object.keys(rules).length;
      const nNodes = Object.values(rules).reduce((a, r) => a + r.count, 0);
      console.log(
        (nRules
          ? `${nRules} rule(s), ${nNodes} node(s)` +
              (pageErrors.length ? `  [${pageErrors.length} page error(s)]` : "")
          : "clean") +
          `  ·  tree: ${tree.interactive} interactive, ${tree.unnamed} unnamed` +
          (tree.unnamed ? ` (${tree.detail.join(", ")})` : ""),
      );
    }
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  if (UPDATE) {
    // Sorted by page id: the roster's own order changes whenever an entry is inserted, and writing in
    // that order made adding two clean pages produce a 90-line diff of pure reordering, in a file whose
    // only job is to let a reviewer see which findings moved.
    const sorted = Object.fromEntries(Object.keys(current).sort().map((k) => [k, current[k]]));
    writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
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

  // ── the tree walk's own verdict (M8 step 5.2) ───────────────────────────────────────────────
  // Reported apart from the baseline diff, and deliberately WITHOUT a baseline of its own: there is
  // no acceptable non-zero number here. An unnamed control is one a screen reader announces as its
  // role alone — "button", "slider" — so recording a count of them as tolerated would be recording
  // that some of this suite cannot be operated without sight.
  const unnamedPages = Object.entries(trees).filter(([, t]) => t.unnamed > 0);
  const totalInteractive = Object.values(trees).reduce((a, t) => a + t.interactive, 0);
  if (unnamedPages.length === 0) {
    console.log(
      `✓ Accessibility tree: ${totalInteractive} interactive node(s) across ${Object.keys(trees).length} page(s), 0 unnamed.`,
    );
  } else {
    console.log(`\n✗ ${unnamedPages.length} page(s) with UNNAMED interactive nodes:`);
    for (const [pageId, t] of unnamedPages) {
      console.log(`    ${pageId}: ${t.unnamed} of ${t.interactive} — ${t.detail.join(", ")}`);
      console.log(
        `::warning title=unnamed interactive node (${pageId})::${t.unnamed} of ${t.interactive} interactive nodes have no accessible name (${t.detail.join(", ")})`,
      );
    }
  }

  writeStepSummary(current, regressions, improvements, trees);

  // Report mode (CI default) always exits 0 — the audit is non-blocking. --strict makes it a hard
  // check for local use or opt-in gating.
  return STRICT && (regressions.length || unnamedPages.length) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
