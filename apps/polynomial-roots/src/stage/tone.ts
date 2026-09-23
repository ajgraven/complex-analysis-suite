// Turning a density into a picture — the step that decides whether the structure is visible at all.
//
// The root cloud's density spans six orders of magnitude in one frame: the band at the unit circle,
// where Bousch proved the roots are dense, saturates anything linear, while the dragon curves inside the
// disk carry a handful of roots per pixel and vanish. Baez's and Derbyshire's plots solve it with a
// black → dark red → yellow → white ramp over a compressed density, and the compression is doing as much
// work as the colours.
//
// Two stages, in this order:
//
//   1. `log(1 + c)`, normalised by `log(1 + max)`. A pure log would send an empty pixel to −∞; `log1p`
//      sends it to 0 and keeps the low counts — 1, 2, 3 roots — visibly apart, which is where the
//      dragons are.
//   2. HISTOGRAM EQUALISATION of what remains, over the OCCUPIED pixels only. Equalising over the whole
//      frame would let the background — usually most of it — eat the bottom of the ramp and flatten
//      everything else into the top few percent. The ramp is `@cas/gpu`'s `equalizedCdfLut`, shared with
//      Complex Dynamics (ADR-0046 / ADR-0007).
//
// Everything here is pure and node-tested; the GL half only uploads the ramp and samples it.
import { equalizedCdfLut } from "@cas/gpu/histogram";

/** The tone ramp for one frame, plus what it was built from. */
export interface ToneMap {
  /** `width`×1 RGBA8; the shader reads `.r` at the normalised log-density. */
  readonly lut: Uint8Array;
  readonly width: number;
  /** The largest density in the frame — the shader's normaliser. */
  readonly maxDensity: number;
  /** How many pixels carried any density at all. Zero means there is nothing to show. */
  readonly occupied: number;
}

/** Bins in the equalisation histogram. 256 matches the ramp width the shader samples. */
const BINS = 256;

/** A pixel counts as occupied above this; float accumulation leaves exact zeros where nothing landed. */
const FLOOR = 1e-6;

/**
 * Build the frame's tone ramp from its density buffer.
 *
 * `density[i]` is the accumulated weight at pixel `i` (the stage's R channel, read back). `exposure`
 * multiplies the density before the log, so the reader can lift the faint structure without changing
 * what is being equalised; `gamma` bends the equalised result (1 leaves it alone).
 */
export function buildToneMap(density: ArrayLike<number>, exposure = 1, gamma = 1): ToneMap {
  let maxDensity = 0;
  let occupied = 0;
  for (let i = 0; i < density.length; i++) {
    const d = density[i];
    if (d > FLOOR) {
      occupied++;
      if (d > maxDensity) maxDensity = d;
    }
  }
  if (occupied === 0 || maxDensity <= 0) {
    // Nothing to show. A flat ramp is honest here; an equalised one would be 0/0.
    return { lut: new Uint8Array(BINS * 4), width: BINS, maxDensity: 0, occupied: 0 };
  }

  const exp = exposure > 0 ? exposure : 1;
  const norm = Math.log1p(maxDensity * exp);
  const hist = new Float64Array(BINS);
  for (let i = 0; i < density.length; i++) {
    const d = density[i];
    if (d <= FLOOR) continue; // the background is not part of the distribution being equalised
    const t = norm > 0 ? Math.log1p(d * exp) / norm : 0;
    const bin = Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)));
    hist[bin]++;
  }

  const { data, width } = equalizedCdfLut(hist, BINS);
  if (gamma !== 1 && gamma > 0) {
    for (let j = 0; j < width; j++) {
      data[j * 4] = Math.round(255 * Math.pow(data[j * 4] / 255, 1 / gamma));
    }
  }
  return { lut: data, width, maxDensity, occupied };
}

/**
 * The same normalisation the shader applies, in TypeScript — so a test can check that a density maps to
 * the ramp position the picture will use, rather than trusting two copies of the formula to agree.
 */
export function normalisedDensity(d: number, maxDensity: number, exposure = 1): number {
  if (!(maxDensity > 0)) return 0;
  const exp = exposure > 0 ? exposure : 1;
  const norm = Math.log1p(maxDensity * exp);
  if (!(norm > 0)) return 0;
  return Math.min(1, Math.max(0, Math.log1p(Math.max(0, d) * exp) / norm));
}
