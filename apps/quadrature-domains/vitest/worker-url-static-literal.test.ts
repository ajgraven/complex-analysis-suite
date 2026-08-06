// @vitest-environment node
//
// Regression net (refactor review — P0: solver-worker bundling). Every
// `new Worker(new URL(<url>, import.meta.url), …)` in the QD app MUST pass a STRING LITERAL as the
// first argument to `new URL`. Vite's `worker-import-meta-url` transform only recognizes a literal
// first arg; a VARIABLE (e.g. `new URL(cfg.entryUrl, import.meta.url)`) is left untransformed, so the
// worker's entry chunk is silently omitted from the production build and 404s at runtime.
//
// This is invisible to the rest of the suite: node/jsdom have no `Worker` (tests take the main-thread
// fallback path) and `vite dev` serves modules from source (the chunk is only needed by `vite build`).
// The only signals are the built `dist/` (a missing `*-worker-entry-*.js` chunk) or the deployed app.
//
// It bit the primary-solver worker (all three lanes — primary / aux / live) after the Stage C1
// `createWorkerLane` unification collapsed three literal URLs into one shared `cfg.entryUrl` variable.
// The other three workers (param-slice-pool / schwarz-cpu-worker / algebra/sym-worker) kept literal
// URLs and were unaffected. Tests-only; source-text scan, no app import.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));
const mjsFiles = (readdirSync(APP_DIR, { recursive: true }) as string[]).filter((p) => p.endsWith(".mjs"));

// `new Worker( new URL(  X …` where X's first non-space char is NOT a string quote (' " `) → a VARIABLE
// URL. `\s` spans newlines, so a construction split across lines is still caught.
const VARIABLE_WORKER_URL = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*[^'"`\s]/g;

describe("QD worker URLs are static string literals (Vite bundling — P0 regression net)", () => {
  it("no `new Worker(new URL(<variable>))` anywhere in app/ — Vite would drop the worker chunk", () => {
    const offenders: string[] = [];
    for (const rel of mjsFiles) {
      const src = readFileSync(join(APP_DIR, rel), "utf8");
      VARIABLE_WORKER_URL.lastIndex = 0;
      for (let m = VARIABLE_WORKER_URL.exec(src); m; m = VARIABLE_WORKER_URL.exec(src)) {
        offenders.push(`app/${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(
      offenders,
      "worker URL must be a string literal so Vite's worker-import-meta-url transform emits the chunk " +
        "(a variable is left untransformed → 404 in the built app):\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("primary-solver-worker spawns from the literal '../workers/solver-worker-entry.mjs'", () => {
    const src = readFileSync(join(APP_DIR, "solvers", "primary-solver-worker.mjs"), "utf8");
    expect(src).toMatch(
      /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"]\.\.\/workers\/solver-worker-entry\.mjs['"]\s*,\s*import\.meta\.url\s*\)/
    );
  });
});
