/**
 * Histogram-equalisation CDF for colouring mode 5. The escape-count pre-pass (mode 6) is read back
 * as an RGBA buffer with the escape time `k = R + 256·G` per pixel; this builds the cumulative
 * distribution over escaped pixels (`k < n`) and returns it as the `uCdf` lookup texture.
 *
 * `n` MUST be the iteration cap the pre-pass ran at — i.e. the shader's `uN` (`targetIterations()`),
 * NOT the raw base count — because the shader indexes the texture at the normalised coordinate
 * `(kmax + 0.5) / (uN + 1)`. If the two disagree (e.g. auto-iterations scales `uN` above the base),
 * most escaping pixels fall outside `k < n` and the lookup coordinate no longer matches the texture.
 *
 * **This file is now only the DECODE.** The equalisation arithmetic — the inclusive cumulative
 * fraction and the resample onto a width-capped lookup — moved to `@cas/gpu`'s `equalizedCdfLut`
 * when Polynomial Roots became its second consumer (ADR-0007 / ADR-0046): that app bins log-density
 * over a root cloud, where this one bins escape times, and what the two share is exactly the
 * arithmetic and not the meaning of a bin. The output is unchanged — the histogram handed over has
 * `cap + 1` bins with the last one empty (the pre-pass counts only `k < cap`), so the shared
 * function's inclusive CDF reproduces this file's former `cdfK` entry for entry, and its
 * `width = min(m, maxWidth)` reproduces the former `min(cap + 1, maxTexSize)`.
 *
 * The texture width is capped at `maxTexSize`: since `n` can reach the auto-iter ceiling (20000),
 * which exceeds a typical `MAX_TEXTURE_SIZE` of 16384, the CDF is **resampled** onto
 * `min(n + 1, maxTexSize)` texels rather than truncated. The shader samples with NEAREST + CLAMP at
 * the normalised coordinate above, so texel `j` covers escape times near `k ≈ (j + 0.5)(n + 1)/width`
 * — the same mapping — and no escaped pixel is dropped from the distribution. When `n + 1 ≤ maxTexSize`
 * the resample is the identity (texel `j` = escape time `j`), so the common path is unchanged.
 */
import { equalizedCdfLut } from "@cas/gpu/histogram";

export function buildEqualizedCdf(
  px: Uint8Array,
  n: number,
  maxTexSize: number,
): { data: Uint8Array; width: number } {
  const cap = Math.max(1, Math.floor(n));

  // Distribution of escape times over pixels that actually escaped (k < cap). Bin `cap` exists and
  // stays empty so the ramp has `cap + 1` texels in the uncapped case — the coordinate the shader
  // samples at is `(kmax + 0.5) / (uN + 1)`.
  const hist = new Float64Array(cap + 1);
  for (let i = 0; i < px.length; i += 4) {
    const k = px[i] + px[i + 1] * 256;
    if (k < cap) hist[k]++;
  }

  const { data, width } = equalizedCdfLut(hist, maxTexSize);
  return { data, width };
}
