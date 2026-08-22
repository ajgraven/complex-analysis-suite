/**
 * Repeatable local Chrome baseline for Quadrature Domains.
 *
 * Runs the production Vite build, serves it locally, then reports cold-page boot,
 * JS heap, long-task, transfer, worker-solve, and UI interaction measurements. It
 * intentionally prints measurements without asserting budgets: a baseline must be
 * gathered on the target laptop before CI thresholds are chosen.
 *
 * Usage:
 *   pnpm --filter quadrature-domains perf:measure
 *   node apps/quadrature-domains/perf/measure.mjs --runs 7 --skip-build
 *   node apps/quadrature-domains/perf/measure.mjs --runs 1 --skip-build --profile
 *
 * On Windows the script uses installed Chrome by default. Set QD_CHROME_PATH to
 * measure another Chromium executable.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { build, preview } from "vite";
import { chromium } from "playwright";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const configFile = resolve(packageRoot, "vite.config.mjs");
const runsArg = process.argv.indexOf("--runs");
const requestedRuns = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 5;
const runs = Number.isInteger(requestedRuns) && requestedRuns > 0 ? requestedRuns : 5;
const slowdownArg = process.argv.indexOf("--cpu-slowdown");
const requestedSlowdown = slowdownArg >= 0 ? Number(process.argv[slowdownArg + 1]) : 1;
const cpuSlowdown = Number.isFinite(requestedSlowdown) && requestedSlowdown >= 1 ? requestedSlowdown : 1;
const skipBuild = process.argv.includes("--skip-build");
const captureProfile = process.argv.includes("--profile");

const chromeCandidates = [
  process.env.QD_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!skipBuild) {
  console.log("Building Quadrature Domains for measurement…");
  await build({ configFile });
}

const server = await preview({
  configFile,
  preview: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "error",
});
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error("Vite preview did not report a local URL");

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--disable-background-networking", "--disable-component-update"],
});
const browserVersion = browser.version();

const quickFixture = {
  poles: [
    { a: { re: -0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: 0.5, im: 0 }, principal: [{ re: 1, im: 0 }] },
  ],
};
// Matches the built-in "Equilateral 3-point on unit circle" preset.  Keeping this
// fixture in step with user-facing data gives a representative multi-pole measurement
// without treating an arbitrary, possibly unrealizable input as a performance result.
const triangleFixture = {
  poles: [
    { a: { re: 1, im: 0 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: -0.5, im: 0.8660254 }, principal: [{ re: 1, im: 0 }] },
    { a: { re: -0.5, im: -0.8660254 }, principal: [{ re: 1, im: 0 }] },
  ],
};

const samples = [];
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__qdPerf = { longTaskMs: 0, longTaskCount: 0 };
      window.__qdPerfMarks = [];
      const replaceState = history.replaceState.bind(history);
      history.replaceState = (...args) => {
        window.__qdPerfMarks.push({ name: "url:replace-state:start", t: performance.now() });
        try { return replaceState(...args); }
        finally { window.__qdPerfMarks.push({ name: "url:replace-state:end", t: performance.now() }); }
      };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__qdPerf.longTaskMs += entry.duration;
          window.__qdPerf.longTaskCount++;
        }
      }).observe({ type: "longtask", buffered: true });
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (cpuSlowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    const before = await cdp.send("Performance.getMetrics");
    const navigationStart = Date.now();
    await page.goto(`${baseUrl}?perfRun=${run}`, { waitUntil: "load" });
    await page.waitForFunction(() =>
      Boolean(window.QD && window.QD_UI && typeof window.QD_UI.snapshotScenario === "function"));
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
    // The app starts its initial solve on boot.  Do not let that lifecycle race
    // with the later, deliberately-triggered interaction measurement.
    await page.waitForFunction(() => {
      const busy = document.querySelector("#solve-busy-row");
      const status = document.querySelector("#status");
      const text = status?.textContent || "";
      return Boolean(busy?.classList.contains("hidden") && text && !/^(Idle|Solving…?)$/.test(text.trim()));
    }, { timeout: 20_000 });
    const bootWallMs = Date.now() - navigationStart;
    const afterBoot = await cdp.send("Performance.getMetrics");
    const coldMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const resources = performance.getEntriesByType("resource");
      const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
      const heap = performance.memory?.usedJSHeapSize ?? null;
      return {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
        loadMs: navigation?.loadEventEnd ?? null,
        firstContentfulPaintMs: fcp?.startTime ?? null,
        jsTransferBytes: resources
          .filter((entry) => entry.initiatorType === "script")
          .reduce((total, entry) => total + entry.transferSize, 0),
        resourceTransferBytes: resources.reduce((total, entry) => total + entry.transferSize, 0),
        heapBytes: heap,
        longTaskMs: window.__qdPerf.longTaskMs,
        longTaskCount: window.__qdPerf.longTaskCount,
      };
    });

    // Worker construction is synchronous; its first request is the meaningful module-load/startup cost.
    const workerCreation = await page.evaluate(async () => {
      const started = performance.now();
      await window.QD.PrimarySolverWorker.ensureReady();
      return performance.now() - started;
    });
    // Boot itself performs the initial solve, so this is a post-boot comparison
    // fixture rather than an attempt to re-measure worker startup.
    const postBootSolve = await page.evaluate(async (data) => {
      const started = performance.now();
      const result = await window.QD.PrimarySolverWorker.solve(data, { findAlternates: false });
      return { ms: performance.now() - started, success: Boolean(result?.success) };
    }, quickFixture);
    const solveSamples = await page.evaluate(async (data) => {
      const out = [];
      for (let i = 0; i < 5; i++) {
        const started = performance.now();
        const result = await window.QD.PrimarySolverWorker.solve(data, { findAlternates: false });
        out.push({ ms: performance.now() - started, success: Boolean(result?.success) });
      }
      return out;
    }, quickFixture);
    const triangleSolveSamples = await page.evaluate(async (data) => {
      const out = [];
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        const result = await window.QD.PrimarySolverWorker.solve(data, { findAlternates: false });
        out.push({ ms: performance.now() - started, success: Boolean(result?.success) });
      }
      return out;
    }, triangleFixture);
    // Flush the initial result's idle analyses before starting the measured
    // interaction. Otherwise their unrelated work may overlap this trace.
    await page.evaluate(async () => {
      const marks = window.__qdPerfMarks;
      let lastCount = marks.length;
      let stableSince = performance.now();
      await new Promise((resolve) => {
        const deadline = performance.now() + 3_000;
        const check = () => {
          if (marks.length !== lastCount) { lastCount = marks.length; stableSince = performance.now(); }
          if (performance.now() - stableSince >= 350 || performance.now() >= deadline) return resolve();
          setTimeout(check, 25);
        };
        check();
      });
    });
    // A selection change exercises the app's actual event handler, its documented
    // 60 ms debounce, worker solve, DOM/canvas update, and the following paint.
    // This is deliberately measured after the worker is warm: it describes the
    // interaction a user experiences after initial app boot, not worker startup.
    const interactionBefore = await cdp.send("Performance.getMetrics");
    const interactionLongTasksBefore = await page.evaluate(() => ({ ...window.__qdPerf }));
    const interactionMarkStart = await page.evaluate(() => window.__qdPerfMarks.length);
    if (captureProfile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.start");
    }
    const interaction = await page.evaluate(async () => {
      const preset = document.querySelector("#preset-select");
      const busy = document.querySelector("#solve-busy-row");
      const status = document.querySelector("#status");
      if (!preset || !busy || !status) throw new Error("QD performance hooks are missing");
      const started = performance.now();
      const waitForBusy = new Promise((resolveBusy, rejectBusy) => {
        const observer = new MutationObserver(() => {
          if (!busy.classList.contains("hidden")) {
            observer.disconnect();
            resolveBusy(performance.now());
          }
        });
        observer.observe(busy, { attributes: true, attributeFilter: ["class"] });
        setTimeout(() => { observer.disconnect(); rejectBusy(new Error("QD interaction never became busy")); }, 10_000);
      });
      preset.value = "triangle";
      preset.dispatchEvent(new Event("change", { bubbles: true }));
      const busyAt = await waitForBusy;
      const busyVisibleMs = busyAt - started;
      await new Promise((resolveSettled, rejectSettled) => {
        // A quick worker solve may hide the row before this continuation runs.
        // Checking its current state prevents a later deferred analysis update
        // from being mistaken for the interaction's settled paint.
        if (busy.classList.contains("hidden") && !/Solving/i.test(status.textContent || "")) {
          resolveSettled();
          return;
        }
        const observer = new MutationObserver(() => {
          if (busy.classList.contains("hidden") && !/Solving/i.test(status.textContent || "")) {
            observer.disconnect();
            resolveSettled();
          }
        });
        observer.observe(busy, { attributes: true, attributeFilter: ["class"] });
        setTimeout(() => { observer.disconnect(); rejectSettled(new Error("QD interaction did not settle")); }, 20_000);
      });
      await new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)));
      return {
        busyVisibleMs,
        settledAndPaintedMs: performance.now() - started,
        finalStatus: status.textContent || "",
        canvasPixels: [document.querySelector("#canvas")?.width ?? 0, document.querySelector("#canvas")?.height ?? 0],
      };
    });
    const interactionProfile = captureProfile ? await cdp.send("Profiler.stop") : null;
    const interactionAfter = await cdp.send("Performance.getMetrics");
    const interactionLongTasksAfter = await page.evaluate(() => ({ ...window.__qdPerf }));
    const interactionMarks = await page.evaluate((start) => window.__qdPerfMarks.slice(start), interactionMarkStart);
    const metricValue = (report, name) => report.metrics.find((metric) => metric.name === name)?.value ?? 0;
    const beforeTaskDuration = metricValue(before, "TaskDuration");
    const afterBootTaskDuration = metricValue(afterBoot, "TaskDuration");
    const interactionBeforeTaskDuration = metricValue(interactionBefore, "TaskDuration");
    const interactionAfterTaskDuration = metricValue(interactionAfter, "TaskDuration");
    samples.push({
      bootWallMs,
      workerCreationMs: workerCreation,
      postBootSolveMs: postBootSolve.ms,
      solveMs: solveSamples.map((sample) => sample.ms),
      triangleSolveMs: triangleSolveSamples.map((sample) => sample.ms),
      uiInteraction: interaction,
      interactionCdpTaskMs: (interactionAfterTaskDuration - interactionBeforeTaskDuration) * 1000,
      interactionLongTaskMs: interactionLongTasksAfter.longTaskMs - interactionLongTasksBefore.longTaskMs,
      interactionLongTaskCount: interactionLongTasksAfter.longTaskCount - interactionLongTasksBefore.longTaskCount,
      interactionMarks,
      interactionProfile: interactionProfile ? summarizeCpuProfile(interactionProfile.profile) : null,
      solveSuccess: postBootSolve.success && solveSamples.every((sample) => sample.success),
      triangleSolveSuccess: triangleSolveSamples.every((sample) => sample.success),
      cdpTaskMs: (afterBootTaskDuration - beforeTaskDuration) * 1000,
      ...coldMetrics,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.httpServer.close(resolveClose));
}

function round(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}
function percentile(values, q) {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * q) - 1)];
}
function summary(values) {
  return { median: round(percentile(values, 0.5)), p75: round(percentile(values, 0.75)), p95: round(percentile(values, 0.95)) };
}

function summarizeCpuProfile(profile) {
  const nodes = new Map((profile?.nodes || []).map((node) => [node.id, node.callFrame]));
  const totals = new Map();
  for (let i = 0; i < (profile?.samples || []).length; i++) {
    const frame = nodes.get(profile.samples[i]);
    if (!frame) continue;
    const url = frame.url ? frame.url.split("/").slice(-2).join("/") : "(runtime)";
    const name = frame.functionName || "(anonymous)";
    const key = `${name} @ ${url}:${frame.lineNumber + 1}`;
    totals.set(key, (totals.get(key) || 0) + (profile.timeDeltas?.[i] || 0));
  }
  return [...totals.entries()]
    .map(([label, microseconds]) => ({ label, ms: round(microseconds / 1000) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12);
}

function summarizePhaseMarks(marks) {
  const starts = new Map();
  const durations = [];
  for (const mark of marks || []) {
    if (mark.name.endsWith(":start")) starts.set(mark.name.slice(0, -6), mark.t);
    if (mark.name.endsWith(":end")) {
      const key = mark.name.slice(0, -4);
      const started = starts.get(key);
      if (started != null) durations.push({ phase: key, ms: round(mark.t - started) });
    }
  }
  return durations;
}

const report = {
  environment: {
    browser: executablePath ?? "Playwright-managed Chromium",
    browserVersion,
    userAgent: samples[0]?.userAgent ?? null,
    hardwareConcurrency: samples[0]?.hardwareConcurrency ?? null,
    deviceMemoryGiB: samples[0]?.deviceMemoryGiB ?? null,
    cpuSlowdown,
    captureProfile,
    runs,
    fixtures: [
      "two-point symmetric bounded QD; five warm worker solves per page",
      "built-in equilateral three-point bounded-QD preset; three warm worker solves per page",
      "warm UI preset selection from initial state to the three-point preset",
    ],
  },
  coldPage: {
    bootWallMs: summary(samples.map((sample) => sample.bootWallMs)),
    domContentLoadedMs: summary(samples.map((sample) => sample.domContentLoadedMs)),
    loadMs: summary(samples.map((sample) => sample.loadMs)),
    firstContentfulPaintMs: summary(samples.map((sample) => sample.firstContentfulPaintMs)),
    cdpTaskMs: summary(samples.map((sample) => sample.cdpTaskMs)),
    longTaskMs: summary(samples.map((sample) => sample.longTaskMs)),
    longTaskCount: summary(samples.map((sample) => sample.longTaskCount)),
    heapMiB: summary(samples.map((sample) => sample.heapBytes == null ? null : sample.heapBytes / 1024 / 1024)),
    jsTransferKiB: summary(samples.map((sample) => sample.jsTransferBytes / 1024)),
    resourceTransferKiB: summary(samples.map((sample) => sample.resourceTransferBytes / 1024)),
  },
  worker: {
    creationMs: summary(samples.map((sample) => sample.workerCreationMs)),
    postBootSolveMs: summary(samples.map((sample) => sample.postBootSolveMs)),
    warmSolveMs: summary(samples.flatMap((sample) => sample.solveMs)),
    allSolvesSucceeded: samples.every((sample) => sample.solveSuccess),
    triangleWarmSolveMs: summary(samples.flatMap((sample) => sample.triangleSolveMs)),
    allTriangleSolvesSucceeded: samples.every((sample) => sample.triangleSolveSuccess),
  },
  warmInteraction: {
    presetChangeToBusyVisibleMs: summary(samples.map((sample) => sample.uiInteraction.busyVisibleMs)),
    presetChangeToSettledPaintMs: summary(samples.map((sample) => sample.uiInteraction.settledAndPaintedMs)),
    cdpTaskMs: summary(samples.map((sample) => sample.interactionCdpTaskMs)),
    longTaskMs: summary(samples.map((sample) => sample.interactionLongTaskMs)),
    longTaskCount: summary(samples.map((sample) => sample.interactionLongTaskCount)),
    cpuProfile: captureProfile ? samples.map((sample) => sample.interactionProfile) : undefined,
    phaseMarks: samples.map((sample) => sample.interactionMarks),
    phaseDurations: samples.map((sample) => summarizePhaseMarks(sample.interactionMarks)),
    finalStatuses: samples.map((sample) => sample.uiInteraction.finalStatus),
    canvasPixels: samples.map((sample) => sample.uiInteraction.canvasPixels),
  },
  samples,
};
console.log(JSON.stringify(report, null, 2));
