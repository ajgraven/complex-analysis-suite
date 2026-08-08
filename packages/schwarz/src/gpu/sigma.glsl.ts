// GPU σ evaluator — the WebGL2 (GLSL ES 3.00) half of @cas/schwarz, lifted from the Quadrature
// Domains app's hand-written Schwarz-reflection fragment shader (apps/quadrature-domains/app/schwarz/
// schwarz-webgl.mjs) at the S4b hand-off (docs/design/SIGMA-HANDOFF.md). It is the per-pixel GPU twin
// of the CPU engine in ../unbounded-laurent.ts: for one w it computes σ(w) = conj(F(φ⁻¹(w))) by the
// SAME numerical exterior-branch inverse (Newton), the SAME retry ladder, and the SAME formulas.
//
// SCOPE — one family, deliberately. QD's shader dispatches SIX inverse families on `u_family`
// (bounded/unbounded QD, bounded/unbounded LQD, and their singular variants, plus a polynomial-h
// β-correction). CD's σ import path reconstructs exactly ONE of them — the classical UNBOUNDED-Laurent
// map with optional finite-pole branches (`makeUnboundedLaurentSchwarz`) — so only that family is lifted
// here. The others have no second consumer, so per ADR-0007 they stay in QD's app-local shader rather
// than moving into this shared package. The dispatch is specialized away: no `u_family`, no `u_w0`, no
// `cexp`/`blaschke`, unbounded-only seeding/acceptance. What remains is byte-for-byte the family-1 math.
//
// The GLSL is emitted as tagged template strings (same convention as @cas/gpu's complexSingle.glsl.ts).
// A consumer assembles a complete fragment shader by concatenating, in order:
//   SIGMA_CONSTS_GLSL → SIGMA_UNIFORMS_GLSL → SIGMA_COMPLEX_GLSL → SIGMA_EVAL_GLSL
// then declares its own inputs (`uW`, or a view→w mapping) and a `main`. The parity probe
// (./probe.ts, buildSigmaProbeGLSL) is the minimal such assembly; CD's escape-time renderer is the
// production one.

/** Max finite-pole branches uploaded to the shader. Matches QD's `Schwarz._gpuCaps.MAX_BRANCHES`. */
export const MAX_BRANCHES = 12;
/** Max principal-part order per branch (Σₖ, k = 1..MAX_K). Matches QD's `MAX_K`. */
export const MAX_K = 8;
/** Max Laurent length (Σₗ F[l]/zˡ, l = 0..MAX_LAURENT-1). Matches QD's `MAX_LAURENT`. */
export const MAX_LAURENT = 12;

// Compile-time caps + Newton tolerances, baked as GLSL constants so array sizes are constant
// expressions (GLSL ES 3.00 requires it) and the JS-side packing (probe.ts) reads the SAME numbers.
// Tolerances are float32-sized, lifted verbatim from the QD shader:
//   CONVERGE_SQ 1e-14 → succeed when |fz| < 1e-7 (float32 machine-best)
//   FINAL_SQ    1e-10 → strict-validate a Newton run that used all its steps (kills speckle)
//   DIVERGE_SQ  1e8   → |z| > 1e4 ⇒ divergence
export const SIGMA_CONSTS_GLSL = /* glsl */ `
const int   MAX_BRANCHES = ${MAX_BRANCHES};
const int   MAX_K        = ${MAX_K};
const int   MAX_LAURENT  = ${MAX_LAURENT};
const float EPS_DIV      = 1e-30;
const int   NEWTON_MAX   = 40;
const float CONVERGE_SQ  = 1e-14;
const float FINAL_SQ     = 1e-10;
const float DIVERGE_SQ   = 1e8;
`;

// Uniforms describing φ(z) = c·z + Σₗ u_polyA[l]/zˡ + Σⱼ Σₖ conj(u_branchA[j,k])·u_j(z)ᵏ. `u_branchA`
// is flat, indexed `j * MAX_K + k`. See probe.ts `packPhi` for the CPU-side packing that fills these.
export const SIGMA_UNIFORMS_GLSL = /* glsl */ `
uniform float u_c;                              // leading coefficient (φ ~ c·z at ∞)
uniform vec2  u_polyA[MAX_LAURENT];             // Laurent coefficients F[l]
uniform int   u_polyALen;
uniform vec2  u_branchZ[MAX_BRANCHES];          // reflected pole locations z_j ∈ 𝔻
uniform vec2  u_branchA[MAX_BRANCHES * MAX_K];  // principal-part coefficients A_{j,k}
uniform int   u_branchACount[MAX_BRANCHES];     // order m_j of branch j
uniform int   u_nBranches;
`;

// Complex arithmetic (vec2, x=re, y=im). DELIBERATELY NOT @cas/gpu's COMPLEX_SINGLE_GLSL: the Schwarz
// reflection is pole-heavy, so cinv/cdiv floor the denominator at EPS_DIV (max(d, EPS_DIV)) — a point
// at/near a pole yields a huge FINITE value (which escapes) instead of the NaN/Inf that would poison the
// orbit and break the CPU↔GPU σ agreement. @cas/gpu's cdiv divides by dot(b,b) unguarded and offers no
// cinv, so importing it would strip the guard. This is the same local variant QD keeps, and the same
// reason it keeps it. (@cas/schwarz's CPU twin guards identically: A.abs(denom) < 1e-300 skips.)
export const SIGMA_COMPLEX_GLSL = /* glsl */ `
vec2 cmul(vec2 a, vec2 b)  { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cinv(vec2 a)          { float d = dot(a, a); return vec2(a.x, -a.y) / max(d, EPS_DIV); }
vec2 cdiv(vec2 a, vec2 b)  { return cmul(a, cinv(b)); }
vec2 cconj(vec2 a)         { return vec2(a.x, -a.y); }
`;

// The σ evaluator. Each function mirrors the identically-named piece of ../unbounded-laurent.ts, so the
// GPU and CPU results agree to float32 (the parity net in test/sigma-gpu.browser.test.ts pins this).
export const SIGMA_EVAL_GLSL = /* glsl */ `
// Branch contribution to φ and φ':  φ += Σ conj(A_{j,k})·u_j^k,  u_j = z/(1 − conj(z_j)·z);
// φ' += (1/(1−conj(z_j)z)²)·Σ k·conj(A_{j,k})·u_j^{k-1}. Computed together in one pass.
void branchPhi(vec2 z, out vec2 sum, out vec2 sumD) {
  sum  = vec2(0.0);
  sumD = vec2(0.0);
  for (int j = 0; j < MAX_BRANCHES; ++j) {
    if (j >= u_nBranches) break;
    vec2 zjC   = cconj(u_branchZ[j]);
    vec2 denom = vec2(1.0, 0.0) - cmul(zjC, z);
    vec2 u     = cdiv(z, denom);
    vec2 denom2 = cmul(denom, denom);
    int  count  = u_branchACount[j];
    vec2 uPow    = vec2(1.0, 0.0);   // u^0 → u^{k+1} in the loop
    vec2 uPowKm1 = vec2(1.0, 0.0);   // u^{k-1}, starting at k=1
    vec2 inner   = vec2(0.0);        // Σ k·conj(A)·u^{k-1}
    for (int k = 0; k < MAX_K; ++k) {
      if (k >= count) break;
      uPow = cmul(uPow, u);
      vec2 Aconj = cconj(u_branchA[j * MAX_K + k]);
      sum   = sum + cmul(Aconj, uPow);
      inner = inner + cmul(Aconj, uPowKm1) * float(k + 1);
      uPowKm1 = cmul(uPowKm1, u);
    }
    sumD = sumD + cdiv(inner, denom2);
  }
}

// Schwarz-extension branch contribution:  F += Σ A_{j,k}/(z − z_j)^k  (the reflected principal part).
vec2 branchSchwarz(vec2 z) {
  vec2 sum = vec2(0.0);
  for (int j = 0; j < MAX_BRANCHES; ++j) {
    if (j >= u_nBranches) break;
    vec2 d = z - u_branchZ[j];
    if (dot(d, d) < EPS_DIV) continue;
    vec2 dInv = cinv(d);
    vec2 dInvPow = vec2(1.0, 0.0);
    int  count = u_branchACount[j];
    for (int k = 0; k < MAX_K; ++k) {
      if (k >= count) break;
      dInvPow = cmul(dInvPow, dInv);
      sum = sum + cmul(u_branchA[j * MAX_K + k], dInvPow);
    }
  }
  return sum;
}

// φ(z) = c·z + Σ F[l]/z^l + branchPhi.
vec2 evalPhi(vec2 z) {
  vec2 sum, sumD;
  branchPhi(z, sum, sumD);
  vec2 acc = u_c * z;
  if (u_polyALen > 0) {
    vec2 zInv = cinv(z);
    vec2 zInvPow = vec2(1.0, 0.0);
    for (int l = 0; l < MAX_LAURENT; ++l) {
      if (l >= u_polyALen) break;
      acc = acc + cmul(u_polyA[l], zInvPow);
      zInvPow = cmul(zInvPow, zInv);
    }
  }
  return acc + sum;
}

// φ'(z) = c − Σ_{l≥1} l·F[l]/z^{l+1} + branchPhiDeriv.
vec2 evalPhiDeriv(vec2 z) {
  vec2 sum, sumD;
  branchPhi(z, sum, sumD);
  vec2 acc = vec2(u_c, 0.0);
  if (u_polyALen > 1) {
    vec2 zInv = cinv(z);
    vec2 zInvPow = cmul(zInv, zInv);   // 1/z^2 (l=1 term)
    for (int l = 1; l < MAX_LAURENT; ++l) {
      if (l >= u_polyALen) break;
      acc = acc - cmul(u_polyA[l], zInvPow) * float(l);
      zInvPow = cmul(zInvPow, zInv);
    }
  }
  return acc + sumD;
}

// The Schwarz extension F(z) = c/z + Σ conj(F[l])·z^l + branchSchwarz.
vec2 evalF(vec2 z) {
  vec2 branchPart = branchSchwarz(z);
  vec2 acc = u_c * cinv(z);
  vec2 zPow = vec2(1.0, 0.0);
  for (int l = 0; l < MAX_LAURENT; ++l) {
    if (l >= u_polyALen) break;
    acc = acc + cmul(cconj(u_polyA[l]), zPow);
    zPow = cmul(zPow, z);
  }
  return acc + branchPart;
}

// One Newton solve of φ(z) = w from zSeed. Strict-validates a run that used all NEWTON_MAX steps.
vec2 invertPhi(vec2 w, vec2 zSeed, out bool ok) {
  vec2 z = zSeed;
  for (int it = 0; it < NEWTON_MAX; ++it) {
    vec2 fz = evalPhi(z) - w;
    if (dot(fz, fz) < CONVERGE_SQ) { ok = true; return z; }
    vec2 dfz = evalPhiDeriv(z);
    if (dot(dfz, dfz) < EPS_DIV) { ok = false; return z; }
    z = z - cdiv(fz, dfz);
    if (any(isnan(z)) || any(isinf(z)) || dot(z, z) > DIVERGE_SQ) { ok = false; return z; }
  }
  vec2 fz = evalPhi(z) - w;
  ok = (dot(fz, fz) < FINAL_SQ);
  return z;
}

// Cold Newton seed for the exterior branch: z ≈ w/c (good when |w| large, φ ~ c·z at ∞), else pushed
// just outside the unit disk along the w/c ray so the inverse lands in φ's domain {|z|>1}.
vec2 newtonSeedFresh(vec2 w) {
  vec2 cand = w / u_c;
  float r = length(cand);
  if (r > 1.05) return cand;
  if (r < 1e-12) return vec2(1.1, 0.0);
  return cand * (1.1 / r);
}

// Accept a Newton result only if it landed on the exterior branch |z| > 1 (loosened by 1e-4 so
// near-boundary points don't flicker on float32 noise).
bool acceptZ(vec2 z) { return length(z) > 1.0 + 1e-4; }

// σ(w) = conj(F(ψ(w))). zSeed warm-starts Newton; on a miss (wrong basin / didn't converge) retry a
// small seed ladder — fresh, pushed-out ×1.6, and ±90° rotations — so one bad basin doesn't kill a pixel.
vec2 sigma(vec2 w, inout vec2 zSeed, out bool ok) {
  vec2 z = invertPhi(w, zSeed, ok);
  if (ok && acceptZ(z)) {
    // Fast path: warm seed worked.
  } else {
    vec2 fresh = newtonSeedFresh(w);
    float fr = max(length(fresh), 1e-20);
    vec2 fhat = fresh / fr;
    vec2 s1 = fresh;
    vec2 s2 = fresh * 1.6;                    // pushed out to stay in 𝔻*
    vec2 s3 = vec2(-fhat.y, fhat.x) * fr;     // +90°
    vec2 s4 = vec2( fhat.y,-fhat.x) * fr;     // −90°
    bool found = false;
    vec2 zTry;
    zTry = invertPhi(w, s1, ok); if (ok && acceptZ(zTry)) { z = zTry; found = true; }
    if (!found) { zTry = invertPhi(w, s2, ok); if (ok && acceptZ(zTry)) { z = zTry; found = true; } }
    if (!found) { zTry = invertPhi(w, s3, ok); if (ok && acceptZ(zTry)) { z = zTry; found = true; } }
    if (!found) { zTry = invertPhi(w, s4, ok); if (ok && acceptZ(zTry)) { z = zTry; found = true; } }
    if (!found) { ok = false; return vec2(0.0); }
    ok = true;
  }
  // Only the unbounded F has a genuine pole at z=0 (its c/z term); guard a ψ that converged to a
  // spurious tiny z. |z| < 1e-4 is float32-realistic (the CPU twin guards the same case at 1e-14, float64).
  if (dot(z, z) < 1e-8) { ok = false; return vec2(0.0); }
  zSeed = z;
  vec2 Sv = evalF(z);
  if (any(isnan(Sv)) || any(isinf(Sv))) { ok = false; return vec2(0.0); }
  return cconj(Sv);
}
`;
