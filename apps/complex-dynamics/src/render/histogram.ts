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
 * The texture width is capped at `maxTexSize`: since `n` can reach the auto-iter ceiling (20000),
 * which exceeds a typical `MAX_TEXTURE_SIZE` of 16384, the CDF is **resampled** onto
 * `min(n + 1, maxTexSize)` texels rather than truncated. The shader samples with NEAREST + CLAMP at
 * the normalised coordinate above, so texel `j` covers escape times near `k ≈ (j + 0.5)(n + 1)/width`
 * — the same mapping — and no escaped pixel is dropped from the distribution. When `n + 1 ≤ maxTexSize`
 * the resample is the identity (texel `j` = escape time `j`), so the common path is unchanged.
 */
export function buildEqualizedCdf(
  px: Uint8Array,
  n: number,
  maxTexSize: number,
): { data: Uint8Array; width: number } {
  const cap = Math.max(1, Math.floor(n));

  // Distribution of escape times over pixels that actually escaped (k < cap).
  const hist = new Float64Array(cap + 1);
  let escaped = 0;
  for (let i = 0; i < px.length; i += 4) {
    const k = px[i] + px[i + 1] * 256;
    if (k < cap) {
      hist[k]++;
      escaped++;
    }
  }

  // Exact cumulative escaped fraction at each escape time k ∈ [0, cap].
  const cdfK = new Float64Array(cap + 1);
  let cum = 0;
  for (let k = 0; k <= cap; k++) {
    if (k < cap) cum += hist[k];
    cdfK[k] = escaped > 0 ? cum / escaped : 0;
  }

  // Resample onto the (capped) lookup texture; only the R channel is read by the shader.
  const width = Math.min(cap + 1, Math.max(1, Math.floor(maxTexSize)));
  const data = new Uint8Array(width * 4);
  for (let j = 0; j < width; j++) {
    const k = Math.min(cap, Math.floor(((j + 0.5) * (cap + 1)) / width));
    data[j * 4] = Math.round(cdfK[k] * 255);
  }
  return { data, width };
}
