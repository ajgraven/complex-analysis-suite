// LIVE σ/φ export path — the regression net that was missing (Phase 1).
//
// schwarz-export.test.ts serializes a HAND-BUILT deltoid literal
// ({ unbounded:true, c:1, polyA:[…], branches:[] }). That kept the serializer green while the real
// chain the app runs — solve on the Inverse tab → clonePhi(primary.phi) → buildSigmaEnvelope — was
// never exercised end-to-end. So "deltoid σ export works" was asserted about a literal, not about the
// solver's actual output shape. This file closes that gap: it boots the REAL QD solver (the same
// vm-context bootstrap app/test/*.test.js use — see vitest/node/_run.ts) and runs genuinely-solved φ
// objects through the REAL exporter, exactly as captureFromInverseTab() would.
import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  buildExportEnvelope,
  buildSigmaEnvelope,
  classifyPhiForExport,
  explainSigmaUnavailable,
  phiToMapSpec,
} from "../app/schwarz/schwarz-export.mjs";
import { isEnvelopeOfKind, validateEnvelope } from "@cas/interchange";

const require = createRequire(import.meta.url);
let QD: any;
let solveInverseQD: any;

beforeAll(async () => {
  // Memoised in bootstrap.js (_initPromise); a few seconds cold, cheap thereafter.
  const bootstrap = require("../app/test/bootstrap") as { init: () => Promise<unknown> };
  await bootstrap.init();
  QD = (globalThis as { QD?: any }).QD;
  solveInverseQD = (globalThis as { solveInverseQD?: any }).solveInverseQD;
}, 120_000);

const C = (re: number, im = 0) => ({ re, im });
const FIXED = { createdAt: "2026-08-07T00:00:00Z", appVersion: "0.1.0" };

// Exactly what captureFromInverseTab() stores: clonePhi(primary.phi).
function solveAndCapture(hData: unknown, opts: unknown) {
  const res = solveInverseQD(hData, opts);
  expect(res.success, res.error).toBe(true);
  return QD.clonePhi(res.primary.phi);
}

// The deltoid preset (ui-presets 'unb-deltoid' / ui-inputs.test.js §4): h = w², c = 0.5.
const deltoid = () => solveAndCapture({ poles: [], polyPart: [C(0), C(0), C(1)] }, { unbounded: true, c: 0.5 });

describe("σ/φ export — LIVE solver path (real solve → clonePhi → export)", () => {
  it("the real deltoid solves to the unbounded-Laurent shape the gate expects", () => {
    const phi = deltoid();
    expect(phi.unbounded).toBe(true);
    expect(classifyPhiForExport(phi).kind).toBe("unbounded-laurent");
    // The gate the UI hits — verified on the ACTUAL solver output, not a literal.
    expect(phiToMapSpec(phi)?.form).toBe("laurent");
  });

  it("a solved deltoid σ-exports a valid schwarz-reflection envelope (the case the UI error denied)", () => {
    const phi = deltoid();
    expect(explainSigmaUnavailable(phi)).toBeNull(); // UI proceeds — no error line
    const env = buildSigmaEnvelope(phi, FIXED);
    expect(env, "a solved deltoid must σ-export").not.toBeNull();
    expect(isEnvelopeOfKind(validateEnvelope(env), "schwarz-reflection")).toBe(true);
    const sigma = (env!.payload as { sigma: { form: string; disk: string; phi: { form: string } } }).sigma;
    expect(sigma.form).toBe("schwarz");
    expect(sigma.disk).toBe("D*");
    expect(sigma.phi.form).toBe("laurent");
  });

  it("a solved deltoid also φ-exports (quadrature-domain envelope, bounded=false)", () => {
    const phi = deltoid();
    const env = buildExportEnvelope(phi, FIXED);
    expect(env).not.toBeNull();
    expect(isEnvelopeOfKind(validateEnvelope(env), "quadrature-domain")).toBe(true);
    expect(env!.payload.bounded).toBe(false);
  });

  // Phase 2: a single exterior pole is a genuine UNBOUNDED QD whose φ carries a finite-pole branch term.
  // The engine (increment 1) and the wire (increment 2) now handle it, so the REAL solved domain emits a
  // valid branch-bearing σ envelope — the case the Phase-1 boundary test pinned as "not yet". CD
  // reconstructs it in increment 4.
  it("a single-exterior-pole unbounded QD now σ-exports, carrying its finite-pole branches", () => {
    const phi = solveAndCapture({ poles: [{ a: C(2), principal: [C(1)] }] }, { unbounded: true, c: 0.6 });
    expect(phi.unbounded).toBe(true);
    expect(classifyPhiForExport(phi)).toMatchObject({ kind: "unbounded-poles" });
    expect(explainSigmaUnavailable(phi)).toBeNull(); // the refusal is gone
    const env = buildSigmaEnvelope(phi, FIXED);
    expect(env, "the real single-pole domain must σ-export").not.toBeNull();
    expect(isEnvelopeOfKind(validateEnvelope(env), "schwarz-reflection")).toBe(true);
    const sigma = (env!.payload as { sigma: { form: string; phi: { form: string; branches?: unknown[] } } }).sigma;
    expect(sigma.form).toBe("schwarz");
    expect(sigma.phi.form).toBe("laurent");
    expect(sigma.phi.branches?.length ?? 0).toBeGreaterThan(0); // the pole rode along
    expect(buildExportEnvelope(phi, FIXED)).not.toBeNull(); // φ export works too
  });
});
