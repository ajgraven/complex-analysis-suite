// @cas/schwarz — the fundamental-domain tiling tree, grown by iterating the Schwarz inverse σ⁻¹.
// Ported from the QD app's schwarz-inverse.mjs `buildPreimageTree` (the [re,im]-tuple form). A free
// function over the minimal SchwarzInverse surface (just `sigmaInverse`) so it serves EVERY σ family —
// unbounded-Laurent, bounded, and any later family — exactly as `escapeTime` is a free function over σ.
import { type Complex } from "./branches.js";

/** The minimal σ-engine surface the tiling tree needs: the multivalued inverse. Both
 *  `UnboundedLaurentSchwarz` and `BoundedSchwarz` satisfy it structurally (as will any future family). */
export interface SchwarzInverse {
  sigmaInverse(w: Complex): Complex[];
}

export interface PreimageTreeOptions {
  /** Number of σ⁻¹ generations to expand past the seed (the tree depth). Default 4. */
  depth?: number;
  /** Hard cap on the TOTAL node count (the seed included). The tiling grows ~bⁿ where b is the number of
   *  preimages per node (2 for the deltoid, 1 for the disk/single-lobe), so a deep tree needs this cap to
   *  stay renderable. Default 4096. */
  visualBudget?: number;
}

/** A parent→child link, flat (each non-root node contributes exactly one): the gen-g parent at `fromIdx`
 *  spawned the gen-(g+1) child at `toIdx`. Lets a renderer stroke the tiling edges without re-deriving them. */
export interface PreimageEdge {
  fromGen: number;
  fromIdx: number;
  toGen: number;
  toIdx: number;
}

export interface PreimageTree {
  /** generations[g] = the σ⁻ᵍ preimages of the seed; generations[0] = [seed]. Length ≤ depth + 1 (shorter
   *  if a generation ran dry or the budget capped the growth). */
  generations: Complex[][];
  /** Every parent→child link, flat; edges.length = the number of non-root nodes. */
  edges: PreimageEdge[];
  /** True when `visualBudget` stopped the expansion before `depth` generations were reached. */
  truncatedByBudget: boolean;
}

/**
 * Grow the fundamental-domain tiling tree by iterating σ⁻¹ from `seed`. Generation g holds the σ⁻ᵍ
 * preimages (gen 0 = the seed); each node in gen g+1 carries an edge back to its gen-g parent so a
 * renderer can stroke parent→child lines. Expansion stops when it has reached `depth` generations, when a
 * generation yields no preimages (the tiling terminated), or when `visualBudget` total nodes is reached
 * (then `truncatedByBudget` is set and the partially-filled final generation is kept). A σ⁻¹ throw on any
 * node is swallowed as "no preimages" so one bad node never aborts the whole tree.
 */
export function buildPreimageTree(
  seed: Complex,
  schwarz: SchwarzInverse,
  opts: PreimageTreeOptions = {},
): PreimageTree {
  const depth = opts.depth != null ? Math.max(0, opts.depth | 0) : 4;
  const visualBudget = opts.visualBudget != null ? Math.max(1, opts.visualBudget | 0) : 4096;

  const generations: Complex[][] = [[[seed[0], seed[1]]]]; // copy the seed — never alias the caller's point
  const edges: PreimageEdge[] = [];
  let truncatedByBudget = false;
  let totalNodes = 1; // the seed counts against the budget

  for (let g = 0; g < depth; g++) {
    const parents = generations[g];
    const next: Complex[] = [];
    for (let p = 0; p < parents.length; p++) {
      if (totalNodes >= visualBudget) {
        truncatedByBudget = true;
        break;
      }
      let preimages: Complex[];
      try {
        preimages = schwarz.sigmaInverse(parents[p]);
      } catch {
        preimages = []; // a pathological node contributes no children rather than killing the tree
      }
      for (const wPre of preimages) {
        if (totalNodes >= visualBudget) {
          truncatedByBudget = true;
          break;
        }
        edges.push({ fromGen: g, fromIdx: p, toGen: g + 1, toIdx: next.length });
        next.push(wPre);
        totalNodes++;
      }
      if (truncatedByBudget) break;
    }
    generations.push(next);
    if (truncatedByBudget) break;
    if (next.length === 0) break; // the tiling ran dry — no point expanding an empty generation
  }

  return { generations, edges, truncatedByBudget };
}
