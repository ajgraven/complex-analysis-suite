/**
 * Drag-representative micro-benchmark for the QD live solver (valid domains).
 *
 * The stock harness (measure.mjs) times ONE discrete preset change. A live drag
 * is instead a rapid SEQUENCE of solves, each a small perturbation of the
 * previous pole configuration. This script times that sequence over KNOWN-VALID
 * domains and contrasts two modes:
 *   - COLD:       each step solved from scratch (no warm start).
 *   - WARM-START: each step warm-started from the previous step's phi via
 *                 opts.warmPhi — the continuation reuse the app's live path uses.
 * The gap between them is the payoff of warm-start/continuation reuse.
 *
 * It reports per-step solve latency (min / median / p95 / max) and the success
 * rate, so a run that silently stopped producing valid QDs is visible rather
 * than being mistaken for a fast result.
 *
 * Usage (run from anywhere; paths are resolved relative to this file):
 *   pnpm --filter quadrature-domains build      # once, so dist/ exists
 *   node apps/quadrature-domains/perf/drag-bench.mjs
 *   QD_CPU_SLOWDOWN=4 node apps/quadrature-domains/perf/drag-bench.mjs   # mid-range model
 *
 * On Windows the script uses installed Chrome by default; elsewhere set
 * QD_CHROME_PATH to a Chromium executable Playwright can launch.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { preview } from "vite";
import { chromium } from "playwright";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const configFile = resolve(packageRoot, "vite.config.mjs");
const slowdown = process.env.QD_CPU_SLOWDOWN ? Number(process.env.QD_CPU_SLOWDOWN) : 1;
const STEPS = 20;

const chromeCandidates = [
  process.env.QD_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

// The two known-valid fixtures the stock harness uses.
const twoPoint = {
  poles: [
    { a: { re: -0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: 0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
  ],
};
const triangle = {
  poles: [
    { a: { re: 1, im: 0 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: -0.5, im: 0.8660254 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: -0.5, im: -0.8660254 }, principal: [{ re: 1, im: 0 }] },
  ],
};

function stats(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
  return {
    min: +s[0].toFixed(1), median: +q(0.5).toFixed(1),
    p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1),
  };
}

const server = await preview({
  configFile,
  preview: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "error",
});
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error("Vite preview did not report a local URL (did you build first?)");

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (slowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown });
await page.goto(`${baseUrl}?dragBench=1`, { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.QD && window.QD.PrimarySolverWorker));
await page.evaluate(() => window.QD.PrimarySolverWorker.ensureReady());

const results = [];
try {
  for (const [label, base] of [["2-point", twoPoint], ["3-point triangle", triangle]]) {
    for (const warm of [false, true]) {
      // eslint-disable-next-line no-await-in-loop
      const out = await page.evaluate(async ({ base, warm, STEPS }) => {
        const clone = (o) => JSON.parse(JSON.stringify(o));
        const PSW = window.QD.PrimarySolverWorker;
        const seed = await PSW.solve(clone(base), { findAlternates: false });
        let prevPhi = seed && seed.success ? seed.primary.phi : null;
        const times = [];
        let ok = 0;
        for (let i = 0; i < STEPS; i++) {
          const data = clone(base);
          const d = 0.02; // small nudge — keeps the domain realizable
          data.poles[0].a.re += d * Math.cos(i * 0.6);
          data.poles[0].a.im += d * Math.sin(i * 0.6);
          const opts = { findAlternates: false };
          if (warm && prevPhi) opts.warmPhi = prevPhi;
          const t0 = performance.now();
          let r = null;
          try { r = await PSW.solve(data, opts); } catch { r = null; }
          times.push(performance.now() - t0);
          if (r && r.success) { ok++; if (warm) prevPhi = r.primary.phi; }
        }
        return { times, ok, STEPS };
      }, { base, warm, STEPS });
      results.push({
        scenario: label,
        mode: warm ? "warm-start" : "cold",
        okRate: `${out.ok}/${out.STEPS}`,
        ms: stats(out.times),
      });
    }
  }
} finally {
  await context.close();
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

console.log(JSON.stringify({
  environment: {
    browser: executablePath ?? "Playwright-managed Chromium",
    browserVersion: browser.version(),
    cpuSlowdown: slowdown,
    hardwareConcurrency: results.length ? undefined : undefined,
  },
  note: "Each step is one full PSW.solve() of a slightly-perturbed VALID domain. 'warm-start' threads the previous step's phi via opts.warmPhi (the live path's continuation reuse). Times are milliseconds.",
  results,
}, null, 2));
