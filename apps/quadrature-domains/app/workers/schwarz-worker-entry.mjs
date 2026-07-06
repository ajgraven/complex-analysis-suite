// =============================================================================
// schwarz-worker-entry.mjs -- Native ES module worker entry for the CPU Schwarz
// escape-time field (Phase 2). Replaces schwarz-cpu-worker.js's runtime-Blob
// bundle (WORKER_BUNDLE_FILES + schwarz-common.js + handler string): imports the
// ESM solver graph + the Schwarz kernel directly. Rebuilds the Schwarz handle
// from the posted plain-data φ + boundary samples and runs the same progressive
// pyramid, posting one transferable snapshot per pass. Protocol unchanged.
//
// `self` is guarded so the module graph is importable headlessly (graph-load
// test); the render kernel only installs under a real worker `self`.
// =============================================================================
import QD from './solver-graph.mjs';
import '../schwarz/schwarz-common.mjs';

if (typeof self !== 'undefined') {
  const S = QD.Schwarz;
  self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || msg.kind !== 'schwarzRender') return;
    const jobId = msg.jobId;
    if (!S || typeof S.buildSchwarzFromPhi !== 'function') {
      self.postMessage({ kind: 'schwarzError', jobId, error: 'QD.Schwarz unavailable in worker' });
      return;
    }
    let sw;
    try {
      // hData is unused by every adapter; pass null. φ + boundaryPts are plain data.
      sw = S.buildSchwarzFromPhi(msg.phi, null, msg.boundaryPts || []);
    } catch (err) {
      self.postMessage({ kind: 'schwarzError', jobId, error: String((err && err.stack) || err) });
      return;
    }
    const W = msg.W, H = msg.H, maxIter = msg.maxIter;
    const v = msg.view;
    const domain = msg.domain || 'w';   // 'z' → sample 𝔻 and lift via w = φ(z)
    const cssW = v.cssW, cssH = v.cssH, cx = v.cx, cy = v.cy, scale = v.scale;
    const pxPerCellX = cssW / W, pxPerCellY = cssH / H;
    const field = new Int16Array(W * H);
    const kind  = new Uint8Array(W * H);     // KIND+1 offset; 0 = unresolved
    const strides = msg.strides || [4, 2, 1];
    for (let s = 0; s < strides.length; s++) {
      const stride = strides[s];
      for (let row = 0; row < H; row++) {
        // Per-row warm-start chain (matches the main-thread renderer): the
        // converged ψ-seed from the left neighbor seeds the next pixel's Newton.
        let leftSeed = null;
        for (let col = 0; col < W; col++) {
          if ((row % stride) !== 0 || (col % stride) !== 0) continue;
          const idx = row * W + col;
          if (kind[idx] && stride > 1) continue;        // already resolved coarser
          const px = (col + 0.5) * pxPerCellX;
          const py = (row + 0.5) * pxPerCellY;
          const aRe = cx + (px - cssW / 2) / scale;
          const aIm = cy - (py - cssH / 2) / scale;     // y flip (screen → world)
          let wpt;
          if (domain === 'z') {
            const r2 = aRe * aRe + aIm * aIm;
            if (sw.unbounded ? r2 <= 1 : r2 >= 1) { field[idx] = 0; kind[idx] = 4 + 1; continue; }
            wpt = sw.evalPhi({ re: aRe, im: aIm });
            if (!wpt || !isFinite(wpt.re) || !isFinite(wpt.im)) { field[idx] = 0; kind[idx] = 4 + 1; continue; }
          } else {
            wpt = { re: aRe, im: aIm };
          }
          if (!sw.isInOmega(wpt)) {
            field[idx] = 0;
            kind[idx]  = 4 + 1;                          // KIND_OUTSIDE + 1
          } else {
            const et = S.escapeTime(wpt, sw, { maxIter: maxIter, initialSeedHint: leftSeed });
            field[idx] = et.n;
            kind[idx] = ((et.kind === 'fundamental') ? 0 :
                         (et.kind === 'escaped')     ? 1 :
                         (et.kind === 'interior')    ? 2 : 3) + 1;
            if (et.firstZ) leftSeed = et.firstZ;
          }
        }
      }
      // Snapshot this pass and transfer copies (the worker keeps its own
      // field/kind arrays for the next, finer pass; transferring the live
      // buffers would detach them).
      const fCopy = field.slice();
      const kCopy = kind.slice();
      self.postMessage(
        { kind: 'schwarzPass', jobId, stride, W, H, field: fCopy, fieldKind: kCopy,
          done: (s === strides.length - 1) },
        [fCopy.buffer, kCopy.buffer]);
    }
  };
}
