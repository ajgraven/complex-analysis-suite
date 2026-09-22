/**
 * Histogram equalisation as a lookup ramp — the shared middle of a tone map that has to adapt to a
 * distribution the renderer cannot predict.
 *
 * A renderer that colours by a COUNT (escape time, root density, hits per pixel) cannot use a fixed
 * transfer curve: the distribution moves with the parameters, and a linear or fixed-gamma ramp spends
 * most of its colours on counts almost no pixel has. Equalisation fixes that by making the transfer
 * curve the distribution's own cumulative fraction, so each colour covers an equal share of pixels.
 *
 * What is shared here is only that arithmetic — build the inclusive cumulative fraction of a histogram
 * and RESAMPLE it onto a lookup texture of bounded width. Deciding what a bin MEANS is the caller's:
 * Complex Dynamics bins escape times (`apps/complex-dynamics/src/render/histogram.ts` decodes its
 * `k = R + 256·G` pre-pass into the histogram this takes), Polynomial Roots bins log-density over the
 * root cloud. That split is why this is a package function and the decode is not
 * ([ADR-0007](../../../docs/DECISIONS.md) — Polynomial Roots is the second consumer that justified the
 * extraction; [ADR-0046](../../../docs/DECISIONS.md#adr-0046)).
 *
 * **The width cap is a resample, not a truncation.** A histogram may be longer than
 * `MAX_TEXTURE_SIZE` (CD's auto-iteration ceiling reaches 20000 against a typical 16384), so texel `j`
 * covers bin `⌊(j + ½)·m / width⌋` of `m` bins and no bin is dropped from the distribution. When
 * `m ≤ maxWidth` the resample is the identity, so the common path is unchanged.
 *
 * Only the R channel carries the ramp; G/B/A are left zero, because both consumers sample it with
 * NEAREST and read `.r`. An empty distribution (every bin zero) yields an all-zero ramp rather than
 * `0/0` — a caller whose frame happens to contain nothing cannot produce NaNs.
 */

/** An equalisation ramp: `data` is `width`×1 RGBA8 with the cumulative fraction in R. */
export interface EqualizedCdf {
  readonly data: Uint8Array;
  readonly width: number;
}

/**
 * Build the equalisation ramp of a histogram.
 *
 * `hist[k]` is the number of samples in bin `k`; the ramp's texel `j` holds
 * `255 × (Σ_{i ≤ k} hist[i]) / Σ hist`, where `k = min(m−1, ⌊(j + ½)·m / width⌋)` and
 * `width = min(m, maxWidth)`. The cumulative fraction is INCLUSIVE of its own bin, so a ramp read at
 * bin `k` answers *"what fraction of samples landed at or below `k`?"* — the equalised colour.
 *
 * `maxWidth` is the caller's texture-size cap; values below 1 are treated as 1. A zero-length
 * histogram yields a single black texel.
 */
export function equalizedCdfLut(hist: ArrayLike<number>, maxWidth: number): EqualizedCdf {
  const m = hist.length;
  const width = Math.max(1, Math.min(m, Math.max(1, Math.floor(maxWidth))));
  const data = new Uint8Array(width * 4);
  if (m === 0) return { data, width };

  let total = 0;
  for (let k = 0; k < m; k++) total += hist[k];

  // Inclusive cumulative fraction per bin. An empty distribution leaves every entry 0 (not 0/0).
  const cdf = new Float64Array(m);
  let cum = 0;
  for (let k = 0; k < m; k++) {
    cum += hist[k];
    cdf[k] = total > 0 ? cum / total : 0;
  }

  for (let j = 0; j < width; j++) {
    const k = Math.min(m - 1, Math.floor(((j + 0.5) * m) / width));
    data[j * 4] = Math.round(cdf[k] * 255);
  }
  return { data, width };
}
