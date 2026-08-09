// schwarzPhiForm.ts — the native "generate a σ fractal from a Riemann map φ" entry (S4b-iv). Pure: turns
// a preset choice OR a small text form into the φ coefficients the σ engine + its GPU twin take — the same
// `{ family, c, F, w0, branches }` shape schwarzPhiFromMapSpec produces on the import path, so native and
// imported σ share one render path.
//
// Both families @cas/schwarz reconstructs are authorable (S5-C2):
//   · UNBOUNDED-Laurent (default): φ(z) = c·z + Σₗ F[l]/zˡ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ, exterior branch.
//     c may be complex (S5-C1) — a CD-native map QD's real-c family never emits.
//   · BOUNDED: φ(z) = w₀ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ (no c·z / Laurent tail), interior branch —
//     buildBoundedSchwarzPhi, from the form's w₀ + poles.
// u_j(z) = z/(1 − conj(z_j)·z), z_j ∈ 𝔻. Kept free of the DOM so the parsing/validation is unit-tested.
import type { Complex, SchwarzBranch } from "@cas/schwarz";

/**
 * φ's coefficients — the σ engine input + its GPU-uniform source. The UNBOUNDED-Laurent family
 * (`family` "unbounded" or absent) reads `c` + `F` (+ `branches`) — the triple
 * `makeUnboundedLaurentSchwarz` takes; the BOUNDED family (S5-C2, `family:"bounded"`) reads `w0` (+
 * `branches`) — the pair `makeBoundedSchwarz` takes — and carries `c=[0,0]`, `F=[]` in the unused slots
 * so the shape is a single object the CPU builders, the GPU packer, and the σ-view serializer all consume.
 */
export interface SchwarzPhi {
  /** Which family φ belongs to (S5-C2). Absent ⇒ "unbounded" (every pre-C2 φ + the native form). */
  family?: "unbounded" | "bounded";
  /** Leading coefficient — complex since S5-C1 (real maps carry `[c, 0]`). `[0,0]` for a bounded φ. */
  c: Complex;
  F: Complex[];
  /** Bounded domain centre w₀ = φ(0) (S5-C2). Absent/`[0,0]` for an unbounded φ. */
  w0?: Complex;
  branches: SchwarzBranch[];
}

/** A named starting point for the form. `F`/`poles`/`w0` are the exact strings the form fields would hold. */
export interface SchwarzPreset {
  id: string;
  label: string;
  /** Which family φ belongs to (S5-C2). Absent ⇒ "unbounded" (the classical exterior-Laurent presets). */
  family?: "unbounded" | "bounded";
  /** Leading coefficient c (real, or complex like "1+0.5i" since S5-C1). Unused (empty) for a bounded φ. */
  c: string;
  /** Laurent coefficients, comma-separated, index 0 = constant, 1 = 1/z, 2 = 1/z², … (e.g. "0, 0, 0.5").
   *  Unused (empty) for a bounded φ. */
  F: string;
  /** Domain centre w₀ = φ(0) (bounded family only; e.g. "0"). Absent/unused for an unbounded φ. */
  w0?: string;
  /** Finite-pole branches, one per line "z ; A₁, A₂, …" (empty for a pole-free unbounded domain). */
  poles: string;
}

// Presets chosen because each renders a known, verifiable Ω — no mislabeled shapes (honest-labeling
// guardrail). UNBOUNDED (φ: |z|>1 → Ω): deltoid + ellipse are pole-free Laurent maps; "single exterior
// pole" exercises the branch term; all stay univalent on |z|>1 so the inverse is unambiguous. BOUNDED
// (φ: |z|<1 → Ω, S5-C2): the unit disk is exact ground truth (φ(z)=z ⇒ σ(w)=1/conj(w)); the single lobe is
// the cross-app golden's φ; the cardioid φ(z)=z+0.3z² is univalent on 𝔻 (φ'=1+0.6z ≠ 0 there) with a
// degree-2 boundary. A bounded preset carries `family:"bounded"` + `w0`, and its `c`/`F` are unused.
export const SCHWARZ_PRESETS: readonly SchwarzPreset[] = [
  // φ(z) = z + 1/(2z²): the classical 3-cusped deltoid (c=1, F₂=½).
  { id: "deltoid", label: "Deltoid (unbounded)", c: "1", F: "0, 0, 0.5", poles: "" },
  // φ(z) = z + 1/(2z): |z|=1 ↦ the ellipse with semi-axes 3/2, 1/2 (Ω = its exterior).
  { id: "ellipse", label: "Ellipse (unbounded)", c: "1", F: "0, 0.5", poles: "" },
  // φ(z) = z + 0.4·u, u = z/(1−0.3z): a single finite pole (z_j = 0.3, A = 0.4) — a one-lobe domain.
  { id: "single-pole", label: "Single exterior pole (unbounded)", c: "1", F: "", poles: "0.3 ; 0.4" },
  // φ(z) = z (z_j = 0, A = 1): the unit disk — exact ground truth, σ(w) = 1/conj(w).
  { id: "disk", label: "Unit disk (bounded)", family: "bounded", c: "", F: "", w0: "0", poles: "0 ; 1" },
  // φ(z) = ½·z/(1−0.3z): a single interior lobe (the cross-app golden's φ).
  { id: "lobe", label: "Single lobe (bounded)", family: "bounded", c: "", F: "", w0: "0", poles: "0.3 ; 0.5" },
  // φ(z) = z + 0.3z² (z_j = 0, A = [1, 0.3]): a cardioid-like bounded domain, degree-2 boundary.
  { id: "cardioid", label: "Cardioid (bounded)", family: "bounded", c: "", F: "", w0: "0", poles: "0 ; 1, 0.3" },
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
  /** Which family to build (S5-C2). Absent ⇒ "unbounded" (every pre-C2 caller passes no family). */
  family?: "unbounded" | "bounded";
  c: string;
  F: string;
  /** Domain centre w₀ = φ(0) — bounded family only; "" ⇒ 0. */
  w0?: string;
  poles: string;
}

/** Build φ's coefficients from the form fields, with validation. Throws a message suitable for the form's
 *  error line. Dispatches on the family: an UNBOUNDED φ needs a non-zero c and a non-trivial boundary
 *  (a Laurent term or a pole); a BOUNDED φ (S5-C2) needs its centre w₀ and at least one interior pole
 *  (φ = w₀ + branches; c / F are unused). Both share `parsePoles`'s |z_j| < 1 invariant. */
export function buildSchwarzPhi(fields: SchwarzFormFields): SchwarzPhi {
  if (fields.family === "bounded") return buildBoundedSchwarzPhi(fields);
  const cTrim = fields.c.trim();
  if (cTrim === "") throw new Error("enter a leading coefficient c");
  const cVal = parseComplex(cTrim);
  if (cVal[0] === 0 && cVal[1] === 0) throw new Error("c must be non-zero");
  const F = parseComplexList(fields.F);
  const branches = parsePoles(fields.poles);
  // A pole-free domain needs at least one Laurent term beyond c·z, or the boundary φ(|z|=1) is a circle
  // with no dynamics; with branches present the boundary is always non-trivial.
  if (branches.length === 0 && F.every((f) => f[0] === 0 && f[1] === 0)) {
    throw new Error("add a Laurent coefficient (e.g. F = 0, 0, 0.5) or a pole — c·z alone is just a circle");
  }
  return { c: cVal, F, branches };
}

/** Build a BOUNDED φ (S5-C2): φ(z) = w₀ + Σ_j Σ_k conj(A_{j,k})·u_j(z)^k, φ: 𝔻 → Ω. Needs the centre w₀
 *  ("" ⇒ 0) and ≥1 interior pole — a bounded QD is w₀ plus its branch terms, with no leading c·z / Laurent
 *  tail (those slots carry [0,0] / []). Throws the form-line message for a missing/unparseable w₀, a pole
 *  outside 𝔻 (via parsePoles), or a centre-only domain (a degenerate point). */
export function buildBoundedSchwarzPhi(fields: { w0?: string; poles: string }): SchwarzPhi {
  const w0Trim = (fields.w0 ?? "").trim();
  const w0: Complex = w0Trim === "" ? [0, 0] : parseComplex(w0Trim);
  const branches = parsePoles(fields.poles);
  if (branches.length === 0) {
    throw new Error("add at least one interior pole (e.g. 0.3 ; 0.5) — a bounded domain is w₀ plus its poles");
  }
  return { family: "bounded", c: [0, 0], F: [], w0, branches };
}
