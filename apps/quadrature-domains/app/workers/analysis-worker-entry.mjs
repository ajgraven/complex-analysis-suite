// =============================================================================
// analysis-worker-entry.mjs -- Deferred status-analysis worker entry.
//
// This graph deliberately stays separate from solver-worker-entry.mjs: primary,
// alternate-search, and live-solve workers do not need its critical-point,
// geometry, observables, or symmetry implementations.  It loads only after a
// successful solve asks for status data.
// =============================================================================
import QD from './solver-graph.mjs';
import { dispatch } from './protocol.mjs';
import '../analysis/critical-set.mjs';
import '../analysis/univalence.mjs';
import '../analysis/cusps.mjs';
import '../analysis/observables.mjs';
import '../analysis/symmetry.mjs';

function analyze(phi, hData, opts = {}) {
  const samples = Math.max(64, opts.samples || 500);
  const observableSamples = Math.max(64, opts.observableSamples || 1024);
  const geom = QD.classifyUnivalence ? QD.classifyUnivalence(phi, { samples, univalent: opts.univalent }) : null;
  const cuspProps = QD.classifyCusps ? QD.classifyCusps(phi, {}) : null;
  const obs = QD.boundaryObservables ? QD.boundaryObservables(phi, { samples: observableSamples }) : null;
  const acc = !opts.live && hData && QD.estimateAccuracy ? QD.estimateAccuracy(phi, hData, {}) : null;
  const symmetry = QD.detectSymmetry ? QD.detectSymmetry(phi) : null;
  const observableResult = obs && !opts.includeObservableSeries
    ? (() => {
        const summary = { ...obs };
        delete summary.w;
        delete summary.curvature;
        return { obs: summary, acc, hasSeries: false };
      })()
    : (obs ? { obs, acc, hasSeries: true } : null);
  return { geom, cuspProps, observables: observableResult, symmetry };
}

const handlers = {
  analyze: (m) => analyze(m.phi, m.hData, m.opts || {}),
};

if (typeof self !== 'undefined') {
  self.onmessage = (e) => dispatch(e.data, handlers, (m) => self.postMessage(m));
}
