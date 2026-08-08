// schwarzPhiForm.ts — the native "generate a σ fractal from a Riemann map φ" entry (S4b-iv). Pure: turns
// a preset choice OR a small text form (leading c, Laurent coefficients F, finite-pole branches) into the
// φ coefficients the σ engine + its GPU twin take — the same `{ c, F, branches }` shape
// schwarzPhiFromMapSpec produces on the import path, so native and imported σ share one render path.
//
// The supported family is the classical UNBOUNDED-Laurent quadrature domain (the only one @cas/schwarz
// reconstructs): φ(z) = c·z + Σₗ F[l]/zˡ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ, u_j = z/(1 − conj(z_j)·z), z_j ∈ 𝔻.
// c is real (the engine's constraint). Kept free of the DOM so the parsing/validation is unit-tested.
import type { Complex, SchwarzBranch } from "@cas/schwarz";

/** φ's coefficients — the argument triple `makeUnboundedLaurentSchwarz(c, F, branches)` takes. */
export interface SchwarzPhi {
  c: number;
  F: Complex[];
  branches: SchwarzBranch[];
}

/** A named starting point for the form. `F`/`poles` are the exact strings the form fields would hold. */
export interface SchwarzPreset {
  id: string;
  label: string;
  /** Real leading coefficient c. */
  c: string;
  /** Laurent coefficients, comma-separated, index 0 = constant, 1 = 1/z, 2 = 1/z², … (e.g. "0, 0, 0.5"). */
  F: string;
  /** Finite-pole branches, one per line "z ; A₁, A₂, …" (empty for a pole-free domain). */
  poles: string;
}

// Presets chosen because each renders a known, verifiable Ω — no mislabeled shapes (honest-labeling
// guardrail). Deltoid + ellipse are pole-free Laurent maps; "single exterior pole" exercises the branch
// term. All stay univalent on |z|>1 so the numerical inverse is unambiguous.
export const SCHWARZ_PRESETS: readonly SchwarzPreset[] = [
  // φ(z) = z + 1/(2z²): the classical 3-cusped deltoid (c=1, F₂=½).
  { id: "deltoid", label: "Deltoid", c: "1", F: "0, 0, 0.5", poles: "" },
  // φ(z) = z + 1/(2z): |z|=1 ↦ the ellipse with semi-axes 3/2, 1/2 (Ω = its exterior).
  { id: "ellipse", label: "Ellipse", c: "1", F: "0, 0.5", poles: "" },
  // φ(z) = z + 0.4·u, u = z/(1−0.3z): a single finite pole (z_j = 0.3, A = 0.4) — a one-lobe domain.
  { id: "single-pole", label: "Single exterior pole", c: "1", F: "", poles: "0.3 ; 0.4" },
];

/** Parse a complex literal: "a", "bi"/"b*i", "a+bi", "a-bi", "i", "-i" (whitespace/`*` ignored). */
export function parseComplex(raw: string): Complex {
  const s = raw.trim().replace(/\s+/g, "").replace(/\*/g, "").replace(/I/g, "i");
  if (s === "") throw new Error("empty number");
  if (s === "i" || s === "+i") return [0, 1];
  if (s === "-i") return [0, -1];
  if (!s.includes("i")) {
    const v = Number(s);
    if (!Number.isFinite(v)) throw new Error(`"${raw}" is not a number`);
    return [v, 0];
  }
  // pure imaginary "bi"
  const pim = s.match(/^([+-]?\d*\.?\d+)i$/);
  if (pim) return [0, Number(pim[1])];
  // a ± bi  (bare "+i"/"-i" tail handled as ±1)
  const m = s.match(/^([+-]?\d*\.?\d+)([+-](?:\d*\.?\d+)?)i$/);
  if (m) {
    const re = Number(m[1]);
    const imTok = m[2] === "+" ? "1" : m[2] === "-" ? "-1" : m[2];
    const im = Number(imTok);
    if (Number.isFinite(re) && Number.isFinite(im)) return [re, im];
  }
  throw new Error(`cannot parse complex number "${raw}"`);
}

/** Parse a comma-separated complex list; "" → []. */
export function parseComplexList(raw: string): Complex[] {
  const t = raw.trim();
  if (t === "") return [];
  return t.split(",").map((part) => parseComplex(part));
}

/** Parse the pole lines "z ; A₁, A₂, …" (one per line) into branches; blank lines ignored. Each z_j must
 *  lie strictly inside the unit disk (a reflected finite pole). Throws a legible message on bad input. */
export function parsePoles(raw: string): SchwarzBranch[] {
  const branches: SchwarzBranch[] = [];
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter((l) => l !== "");
  for (const line of lines) {
    const semi = line.indexOf(";");
    if (semi < 0) throw new Error(`pole "${line}" needs a ";" separating z from its coefficients`);
    const z = parseComplex(line.slice(0, semi));
    if (Math.hypot(z[0], z[1]) >= 1) {
      throw new Error(`pole z = ${line.slice(0, semi).trim()} must be inside the unit disk (|z| < 1)`);
    }
    const A = parseComplexList(line.slice(semi + 1));
    if (A.length === 0) throw new Error(`pole "${line}" needs at least one coefficient after ";"`);
    branches.push({ z, A });
  }
  return branches;
}

export interface SchwarzFormFields {
  c: string;
  F: string;
  poles: string;
}

/** Build φ's coefficients from the form fields, with validation. Throws a message suitable for the form's
 *  error line (empty c, non-real c, |z_j| ≥ 1, unparseable coefficient, or a domain with no boundary at all). */
export function buildSchwarzPhi(fields: SchwarzFormFields): SchwarzPhi {
  const cTrim = fields.c.trim();
  if (cTrim === "") throw new Error("enter a leading coefficient c");
  const cVal = parseComplex(cTrim);
  if (cVal[1] !== 0) throw new Error("c must be real for this family (a real leading coefficient)");
  if (cVal[0] === 0) throw new Error("c must be non-zero");
  const F = parseComplexList(fields.F);
  const branches = parsePoles(fields.poles);
  // A pole-free domain needs at least one Laurent term beyond c·z, or the boundary φ(|z|=1) is a circle
  // with no dynamics; with branches present the boundary is always non-trivial.
  if (branches.length === 0 && F.every((f) => f[0] === 0 && f[1] === 0)) {
    throw new Error("add a Laurent coefficient (e.g. F = 0, 0, 0.5) or a pole — c·z alone is just a circle");
  }
  return { c: cVal[0], F, branches };
}
