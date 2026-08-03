// algebra-results-drawer.mjs -- the results drawer (P6b) + its verdict-routing to the canvas. Carved
// out of installAlgebra (algebra-ui.mjs) in refactor Phase 3 · D1d (seam 2) as a ctx-injected factory.
// BEHAVIOR-PRESERVING: every method body is the code that used to sit inline in the installAlgebra
// closure, verbatim (closure references → ctx). Pinned by vitest/algebra-results-drawer.test.ts (the
// resultStateOf decision + the structural invariants moved here with the code).
//
// Why this is a unit: every analysis wrote into ONE docked verdict slot. Eleven call sites — solve,
// classify, dimension, prove, bifurcation, resolvent, univalence, RCTD import, shape-from-moments —
// competed for a single lastVerdictData, so running Dimension after Classify DESTROYED Classify's
// answer with no way back, on results that cost tens of seconds each. They now go through showResult,
// which keeps each one keyed by the system it was computed about: (track, branchSig). That key is the
// whole point. A result computed three reductions ago, redisplayed beside today's column still wearing
// its original '=' pill, is a false attribution — the worst class of bug this project has (CLAUDE.md
// honest labeling). The key is what lets the drawer tell "still true of what you are looking at" from
// "was true of something else", and demote the second on sight.
//
// ctx — dependency-injected so the unit needs neither the algebra closure nor the solver import:
//   getCanvas     () => AlgebraCanvas|null   the LIVE canvas (assigned late by mountSurface — read per call)
//   store                                    the AlgebraStore (activeTrack, tracks, …)
//   branchSig     (tid) => string            cheap content signature of a branch's current last column
//   trackLabelOf  (id) => string             human label for a branch/track id
//   resultStateOf (eTrack,eSig,cTrack,cSig) => 'current'|'stale'|'branch'   the pure staleness decision (QD_UI)
//   rigorMeta     (rigor, bound) => {symbol,color,label}|null   the drawer pill's rigor glyph (AlgebraCanvas)
export function createResultsDrawer(ctx) {
  const getCanvas = ctx.getCanvas;
  const store = ctx.store;
  const branchSig = ctx.branchSig;
  const trackLabelOf = ctx.trackLabelOf;
  const resultStateOf = ctx.resultStateOf;
  const rigorMeta = ctx.rigorMeta;

  // Results are SESSION-scoped and deliberately not autosaved: restoring a verdict across a reload
  // would restore a claim about a system state that may no longer exist, which is the same false
  // attribution with a longer fuse.
  const RESULTS_CAP = 40;
  const _results = [];            // newest first: { id, track, sig, data }
  let _resultSeq = 0;
  let _resultsDropped = 0;        // surfaced in the drawer — a silent cap reads as "that's all"
  let _drawerOpen = true;         // results drawer (P6b): index above the docked verdict
  let _colCollapsed = false;      // whole result column collapsed to a 34px sliver

  function showResult(data) {
    const canvas = getCanvas();
    if (!canvas) return;
    if (data && data.text) {
      const track = store.activeTrack;
      _results.unshift({ id: ++_resultSeq, track, sig: branchSig(track), data });
      while (_results.length > RESULTS_CAP) { _results.pop(); _resultsDropped++; }
      renderDrawer();
    }
    canvas.setVerdict(data);
  }
  // Bind the pure decision (resultStateOf, module scope) to the live store.
  function resultState(r) {
    const cur = store.activeTrack;
    return resultStateOf(r.track, r.sig, cur, branchSig(cur));
  }
  function reshowResult(r) {
    const canvas = getCanvas();
    const st = resultState(r);
    if (st === 'current') { canvas.setVerdict(r.data); return; }
    canvas.setVerdict(Object.assign({}, r.data, {
      stale: true,
      // 'the derivation has changed since' is the right sentence for a same-branch result and
      // the WRONG one for a cross-branch result — it implies a history this branch never had.
      staleNote: st === 'branch'
        ? '⚠ Computed on ' + trackLabelOf(r.track) + ', and you are viewing ' + trackLabelOf(store.activeTrack)
          + '. It describes that branch’s system — not this one. Switch branches to see it in context.'
        : undefined,
    }));
  }
  function renderDrawer() {
    const canvas = getCanvas();
    const host = canvas && canvas.drawer; if (!host) return;
    host.innerHTML = '';
    if (!_results.length) { host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    const head = document.createElement('div'); head.className = 'algebra-drawer-head';
    // Column collapse lives HERE, not only on the verdict. P6b put the « on the verdict card,
    // so dismissing a result with × left the drawer holding 340px open with no control left to
    // reclaim it — the canvas stayed at 580px of a 920px row with no way out. The drawer is the
    // one element present whenever the column is, so the control belongs on it.
    const dock = document.createElement('button');
    dock.type = 'button'; dock.className = 'algebra-drawer-dock';
    dock.textContent = _colCollapsed ? '»' : '«';
    dock.title = _colCollapsed
      ? 'Expand the results panel'
      : 'Collapse the results panel (keeps every result — give the width back to the graph)';
    dock.addEventListener('click', () => setResultColCollapsed(!_colCollapsed));
    head.appendChild(dock);
    // Collapsed, the head is the whole panel: just the » to get back. Anything else would
    // either overflow the 34px sliver or be unreadable in it.
    if (_colCollapsed) { host.appendChild(head); return; }
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'algebra-drawer-toggle';
    toggle.textContent = _drawerOpen ? '▾' : '▸';
    toggle.title = _drawerOpen ? 'Collapse the results list' : 'Show the results list';
    toggle.addEventListener('click', () => { _drawerOpen = !_drawerOpen; renderDrawer(); });
    const lbl = document.createElement('span'); lbl.className = 'algebra-line-label';
    lbl.textContent = 'Results (' + _results.length + ')';
    head.appendChild(toggle); head.appendChild(lbl);
    host.appendChild(head);
    if (!_drawerOpen) return;
    const list = document.createElement('div'); list.className = 'algebra-drawer-list';
    _results.forEach((r) => {
      const st = resultState(r);
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'algebra-drawer-row is-' + st;
      const rm = rigorMeta(r.data.rigor, r.data.bound);
      if (rm) {
        const pill = document.createElement('span'); pill.className = 'algebra-drawer-pill';
        pill.textContent = rm.symbol; pill.style.background = rm.color;
        // The pill states the rigor of the ORIGINAL computation. On anything but a current
        // result that claim no longer applies to the visible system, so the row says so in
        // its own right rather than letting a green '=' speak for a system it never saw.
        pill.title = 'Rigor when computed: ' + rm.label;
        row.appendChild(pill);
      }
      const t = document.createElement('span'); t.className = 'algebra-drawer-title';
      t.textContent = r.data.title || 'Existence / uniqueness';
      row.appendChild(t);
      if (st !== 'current') {
        const tag = document.createElement('span'); tag.className = 'algebra-drawer-tag';
        tag.textContent = st === 'branch' ? trackLabelOf(r.track) : 'earlier';
        tag.title = st === 'branch'
          ? 'Computed on ' + trackLabelOf(r.track) + ' — a different system from the one shown'
          : 'Computed before the current reduction — no longer describes the visible column';
        row.appendChild(tag);
      }
      row.addEventListener('click', () => reshowResult(r));
      list.appendChild(row);
    });
    host.appendChild(list);
    if (_resultsDropped) {
      const note = document.createElement('div'); note.className = 'algebra-drawer-note';
      note.textContent = _resultsDropped + ' older result' + (_resultsDropped === 1 ? '' : 's')
        + ' dropped (keeps the most recent ' + RESULTS_CAP + ')';
      host.appendChild(note);
    }
  }
  // One place decides the column's width, because two controls drive it: the drawer's « (always
  // present while there are results) and the verdict's « (present only while a verdict shows).
  // Before this, only the verdict had one — so dismissing a result stranded the column open.
  function setResultColCollapsed(on) {
    const canvas = getCanvas();
    _colCollapsed = !!on;
    if (canvas && canvas.setVerdictCollapsed) canvas.setVerdictCollapsed(_colCollapsed);
    renderDrawer();
  }

  return {
    showResult,
    render: renderDrawer,                                        // rerender() calls this (aliased in the root)
    hasResults: () => _results.length > 0,                       // workflowFacts: resultAny
    hasCurrent: () => _results.some((r) => resultState(r) === 'current'),  // workflowFacts: resultCurrent
  };
}
