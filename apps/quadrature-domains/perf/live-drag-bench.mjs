/**
 * Live-DRAG benchmark for the QD app.
 *
 * The stock harness (measure.mjs) measures ONE discrete preset change, which
 * takes the full/authoritative solve+render path. This script measures the
 * per-frame LIVE path instead — quickSolveAndRender -> showSolution(live) — by
 * oscillating a residue |C| slider (its `input` event -> scheduleQuickSolve)
 * over a sustained ~2.5 s "drag", exactly as a user dragging the slider would.
 *
 * It reports, for the measured drag window:
 *   - longTaskMs   : total main-thread blocking time (lower = better; the headline)
 *   - liveCycles   : showSolution live cycles that painted (throughput)
 *   - perCycleMs   : main-thread cost per live cycle (showSolution start->end)
 *   - boundarySampleMs : the boundary-resample slice of each cycle
 *   - katexRenders : showSolution:riemann-rendered marks during the drag
 *                    (KaTeX is deferred OFF the live path, so this should be 0)
 *   - qdCustomized : qd-customized dispatches during the drag (idempotent
 *                    markAsCustom makes this ~1, not one-per-frame)
 *
 * Usage (run from the repo so vite/playwright resolve; build dist/ first):
 *   pnpm --filter quadrature-domains build
 *   node apps/quadrature-domains/perf/live-drag-bench.mjs
 *   QD_CPU_SLOWDOWN=4 node apps/quadrature-domains/perf/live-drag-bench.mjs   # mid-range model
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

const chromeCandidates = [
  process.env.QD_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

const server = await preview({ configFile, preview: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "error" });
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error("Vite preview did not report a local URL (did you build first?)");

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
await page.addInitScript(() => {
  window.__qdPerf = { longTaskMs: 0 };
  window.__qdPerfMarks = [];
  window.__qdCustomCount = 0;
  document.addEventListener("qd-customized", () => { window.__qdCustomCount++; });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__qdPerf.longTaskMs += e.duration;
  }).observe({ type: "longtask", buffered: true });
});
const cdp = await context.newCDPSession(page);
if (slowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown });

let result;
try {
  await page.goto(`${baseUrl}?liveDragBench=1`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.QD && window.QD_UI && window.QD.PrimarySolverWorker));
  const settled = () => {
    const busy = document.querySelector("#solve-busy-row");
    const status = document.querySelector("#status");
    const text = status?.textContent || "";
    return Boolean(busy?.classList.contains("hidden") && text && !/^(Idle|Solving…?)$/.test(text.trim()));
  };
  await page.waitForFunction(settled, { timeout: 20_000 });
  // A valid 3-point bounded QD with residue sliders — a known drag start state.
  await page.evaluate(() => {
    const preset = document.querySelector("#preset-select");
    preset.value = "triangle";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => document.querySelector("#solve-busy-row")?.classList.contains("hidden"), { timeout: 20_000 });

  result = await page.evaluate(async () => {
    const slider = document.querySelector("#poles-list .slider1d-mag");
    if (!slider) return { error: "no residue |C| slider found" };
    const min = +slider.min || 0;
    const max = +slider.max || 5;
    const v0 = +slider.value || 1;
    const amp = Math.max((max - min) * 0.05, 0.15);
    window.__qdPerf.longTaskMs = 0;
    window.__qdPerfMarks.length = 0;
    window.__qdCustomCount = 0;
    const t0 = performance.now();
    const FRAMES = 150; // ~2.5 s at 60 fps
    for (let i = 0; i < FRAMES; i++) {
      const v = Math.max(min, Math.min(max, v0 + amp * Math.sin(i * 0.4)));
      slider.value = String(v);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
    }
    await new Promise((r) => setTimeout(r, 400)); // let the final live solve settle
    const elapsedMs = performance.now() - t0;

    const marks = window.__qdPerfMarks;
    const cycles = [];
    const boundaryDeltas = [];
    let katexRenders = 0;
    let cur = null;
    for (const m of marks) {
      if (m.name === "showSolution:start") cur = { start: m.t };
      else if (cur && m.name === "showSolution:boundary-sampled") cur.bnd = m.t;
      else if (m.name === "showSolution:riemann-rendered") katexRenders++;
      else if (cur && m.name === "showSolution:end") {
        cycles.push(m.t - cur.start);
        if (cur.bnd != null) boundaryDeltas.push(cur.bnd - cur.start);
        cur = null;
      }
    }
    const stat = (xs) => {
      const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
      if (!s.length) return null;
      const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
      return { median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
    };
    return {
      elapsedMs: Math.round(elapsedMs),
      longTaskMs: Math.round(window.__qdPerf.longTaskMs),
      liveCycles: cycles.length,
      perCycleMs: stat(cycles),
      boundarySampleMs: stat(boundaryDeltas),
      katexRenders,
      qdCustomized: window.__qdCustomCount,
    };
  });
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
  },
  note: "Oscillates a residue |C| slider for ~150 frames (the real live path). longTaskMs is total main-thread blocking during the drag; katexRenders should be 0 (KaTeX deferred off the live path).",
  result,
}, null, 2));
