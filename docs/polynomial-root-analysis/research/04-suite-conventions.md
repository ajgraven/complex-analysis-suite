> Research track 4 for `apps/polynomial-root-analysis`. Surveyed 2026-09-22 against the tree at HEAD by a
> read-only agent (compressed by the planner; the wiring list was verified file by file). The source of
> PLAN §6.1. Re-verify against the tree before PRA-0: registries move.
>
> _(Corrected 2026-09-23: PR #348 — `apps/polynomial-roots`, ADR-0046 — landed after this survey. It
> brought `eslint.config.js` `APP_NAMES` current (row 10 below is stale), took port 5184 (the new app
> takes 5185), took ADR-0046 (this app's record is ADR-0047), and moved Contour Integration's
> `cetC6.ts` to `@cas/gpu` as `CET_C6` (§5 below names the old path).)_

# Suite conventions survey (Explore agent, 2026-09-22)

## 1. Smallest recent app anatomy

Sizes (TS LOC): 2d-hydrodynamics 2095 (smallest), potential-theory 2643, argument-principle 5388. Template: potential-theory or 2d-hydrodynamics; argument-principle richest (expr editor + interchange import + KaTeX).
Top level: apps/<slug>/{package.json, tsconfig.json, eslint.config.js, vite.config.ts, index.html, README.md?, src/, test/}. No root tsconfig; each app extends tsconfig.base.json.
package.json: name = bare slug, private, type module, MIT, author Andrew Graven, long prose description naming maths + ADR + @cas packages. Scripts: dev/build/preview/test (vitest run --passWithNoTests)/test:watch/lint/typecheck. deps workspace:_; devDeps fixed five (@eslint/js ^9.17, eslint ^9.17, globals ^15.14, typescript ^5.7.2, typescript-eslint ^8.18, vite ^5.4.10, vitest ^2.1.4).
vite.config.ts: defineConfig from "vitest/config"; base "./"; server {port, strictPort}; test {environment node, include test/\*\*/_.test.ts}. Ports used: 5173 CD, 5175 corr, 5176 plotter+riemann(collision), 5177 AP+contour(collision), 5178 faber, 5180 2de, 5181 hele-shaw, 5182 PT, 5183 2dh, 5199 QD. New app: 5184+.
tsconfig: extends base; ES2020; strict; noUnusedLocals/Params; noImplicitOverride; verbatimModuleSyntax; types []; include src,test,vite.config.ts.
eslint.config.js identical across greenfield apps (eqeqeq, no-console allow warn/info/error, no-non-null-assertion).
index.html: lang en, title, long meta description ending "Part of the Complex Analysis Suite.", #boot-loading, #app with noscript, module script /src/main.ts.
src/: flat engine modules; src/render/; src/styles/; main.ts ends with runWithFatalBoundary(main); viewState.ts codec; engine/shell split by file in small apps; contour-integration has src/{kernel,engine,families,shell,ui}.
@cas/ui exports: mountCanvas, attachCanvasA11y, runWithFatalBoundary, showFatalBanner, createComputeClient, drawDirectionTicks. attachCanvasA11y(canvas,{role:"img"|"application", label, keyboard map}). createComputeClient consumers: complex-dynamics juliaMetricsClient.ts and polynomial-roots main.ts (the deep reference walk) — *corrected 2026-09-26 from "sole consumer"*. SUITE_APPS/mountNavHeader removed by ADR-0044.
@cas/export: injectPngText/readPngText/crc32/pngChunk/PNG_SIGNATURE. Per-app src/pngExport.ts composites layers; stamps Software + "<ns>:url". GL canvas needs preserveDrawingBuffer.
Permalinks: src/viewState.ts wrapping encodeViewState(APP,state)/decodeViewState; namespaces 2–4 chars ("cd","ap","2dh","ci","2de"); decoder rejects foreign app; defensive; new fields optional with DEFAULTS; AP carries ConventionTag (ADR-0006). Hand-off arrives as #s=, own share link #vs=.
@cas/rigor: Level/LEVELS/meet/meetAll/describeLevel; exact, bound, estimate, refuse, unknown; assembleVerdict, failures, mayReportValue. Sole consumer contour-integration.
Tests: apps/<slug>/test/\*.test.ts, import ../src/x.js; jsdom per-file docblock line 1; golden corpora as committed data module + spec (packages/interchange/src/goldens.ts, contour familyGolden.test.ts).

## 2. Registration checklist (ADR-0037 "Wiring per new app"; PLAN.md §6.2)

1 pnpm-workspace.yaml: nothing (glob).
2 vitest.workspace.ts: add "./apps/<slug>/vite.config.ts" (else invisible to pnpm test).
3 scripts/assert-test-census.mjs PROJECTS: { name, match:'/apps/<slug>/', floor:1 }.
4 scripts/a11y-audit.mjs roster: { id, mount, dist:"apps/<slug>/dist", file:"index.html" } (+ hash: viewState(ns,{...}), expect selector for deep-linked states).
5 scripts/a11y-baseline.json: "<slug>": {}.
6 .github/workflows/deploy-pages.yml Assemble \_site: cp -r apps/<slug>/dist \_site/<slug> (this IS the publish mechanism).
7 apps/launcher/index.html: card + 3 SEO meta blobs.
8 root vitest.config.ts coverage include (optional).
9 root package.json test:browser chain (only if browser suite).
10 eslint.config.js APP_NAMES (stale: lists 9 of 13; add new slug).
11 .dependency-cruiser.cjs: nothing.
12 README.md: app table row, count in intro, deploy sentence (~line 100), tree (~139).
13 CLAUDE.md: enumeration :14, tree :58, decision 11 list, Status paragraph.
14 docs/ARCHITECTURE.md §8 publish list, §3 consumer lists.
15 docs/DECISIONS.md new ADR (next = ADR-0046; latest ADR-0045 "One predicate decides whether a value may be shown") + index row.
16 docs/design/<slug>-plan.md.
17 docs/design/future-app-ideas.md status marker.
18 .claude/launch.json optional entry {"name","runtimeExecutable":"node","runtimeArgs":[".../vite.js","apps/<slug>","--port","NNNN","--strictPort"],"port"}.
19 scripts/check-built-artifacts.mjs APPS only if Web Workers.

## 3. House style

ADRs: append-only; index table at top; sections Status / (Date, Deciders) / Context / Decision (numbered bold claims + Rejected alternative) / Consequences (Positive; Migration is staged, each an independently-green gate; Wiring; Trade-off accepted) / Action items checklist. Dated self-corrections in italic parentheses.
App plans docs/design/<slug>-plan.md (model: 2d-hydrodynamics-plan.md, 167 lines): # <App> — app plan; > Status blockquote; ## What this app is (+ Page|Content|Honesty table); ## The reuse foundation; ## The design spine; ## Roadmap ("Milestones numbered XX-n. Nothing committed beyond XX-0; each a separately-approved gate, green before and after"); ## Non-goals; ## References. potential-theory-plan adds Carried-over foundation and Future expansions backlog.
Large-app: docs/contour-integration/PLAN.md §1 what/§1.1 gap/§1.2 not · §2 intellectual core · §3 rigor architecture · §4 system architecture (data model…perf budget) · §5 UI spec (ten interaction rules, pedagogy, colour/type) · §6 reuse strategy incl §6.2 new-app checklist · §7 Milestones and gates ("### M1 — name · _M_", scope, **Gate:** falsifiable clauses) · §8 testing · §9 risk register · §10 sizing · §11 first commit · §12 decisions taken/remaining. DESIGN.md: §1 module layout, §2 core types, §3 verdict algebra, §4 algorithm passes, §5 record format, §6 kernel algorithms, §7 worker protocol, §8 state/URL/undo, §9 test corpus, §10 deliberately unspecified.
Research docs docs/contour-integration/research/01-08 (prior art tools; pedagogy w/ [R]/[R-abs]/[E] evidence labels; method taxonomy; numerics; symbolic; branch cuts; ux explorables; repo reuse survey) each opening with blockquote naming track, date, evidence standard.
MIGRATION phase style: Goal/Steps/Gate/Notes. RISKS: register table, landmine, hard parts, subtleties, solo guardrails, open questions.
STATUS.md: "read first, update last"; Current/Done/Findings/Open questions/Decisions taken.

## 4. Expression parsing / exact coefficients

@cas/expr: lexer→parser→ast; precedence cmp < +- < \*/ < unary < ^ (right assoc); nodes num|const|var|bool|neg|not|arith|compare|call|if|assign|seq; consts i,e,pi,tau,phi,γ; evaluate/makeComplexFn (JS) and compileF/compileEscape (GLSL). Free variable convention is z (c, a params); `x` would be Unknown variable.
Exact extraction: (1) fToRational (packages/expr/src/rational.ts) float coefficients, not exact; (2) toExactRational/simplestRational in apps/contour-integration/src/kernel/exactRational.ts → {num:QiPoly, den:QiPoly} over ℚ(i) or refuse; simplestRational via continued fractions; consumed by kernel/poles.ts ("guess with DK then verify exactly"); (3) expandBivariate Scalar<T> in plotter riemann/implicitPoly.ts. No toPoly API. Reuse of toExactRational = ADR-0007 second-consumer extraction.

## 5. GPU idiom

compileF → GLSL body; @cas/gpu COMPLEX_SINGLE_GLSL etc + createProgram; contour glStage.ts canonical header. phase.glsl.ts: hue=arg f, lightness=log|f| (not HSV); uMode quiet/full/iso/textbook. CET-C6 (cetC6.ts, CC-BY 4.0) 256×1 texture REPEAT. Layers: gl (data, aria-hidden), ink (2D canvas: everything the argument is about, in exports), overlay (DOM transient text). GL program rebuilt only when integrand changes, keyed by value.
Drag handles: contour edits pure functions (engine/contour/edit.ts), shell keeps pointers/hit radii/cursors (stageController.ts); cursor set in JS; snap with named intent (why string). Riemann-map draggable vertices: world-space hit radius 0.06/zoom left, 14px client right; stopImmediatePropagation, registered before attachPanZoom; pointermove/up/cancel on window.

## 6. Mutation sweeps

No tooling; manual per-slice: introduce N defects, run suite, report killed/N + recorded equivalents with reasons; verify tree green BEFORE sweeping; survivor refused for wrong reason = gap.

## 7. Launcher

apps/launcher: static index.html, no JS/registry; cards are literal <a class="card" href="slug/"><span class="badge">…</span><h2>…</h2><p>…</p></a>; "Coming soon" = <div class="card soon"> with badge "Coming soon"; publishing = add cp line + turn div into a. Launcher in a11y roster; SEO metas enumerate apps.

## Cross-cutting rules

Working software each step; gate after last edit, never piped; zero new packages without second consumer (ADR-0007); no app imports app; convention-neutral core (ADR-0006); honest labelling via @cas/rigor if = is earned; share-link back-compat; launch.json entry; browser suites separate with CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium; LF; prettier.
