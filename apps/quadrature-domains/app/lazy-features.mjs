// =============================================================================
// lazy-features.mjs -- demand-load the optional QD application surfaces.
//
// The inverse QD tab is the first-screen experience. Loading all four other
// feature graphs there made its entry chunk include the algebra workspace,
// WebGL Schwarz renderer, parameter-slice pool, and Direct editor. Each loader
// is memoized, preserves side-effect module order in lazy/*.mjs, and replays
// tab activation once its UI listener has registered.
// =============================================================================
const loaders = {
  algebra: () => import('./lazy/algebra.mjs'),
  schwarz: () => import('./lazy/schwarz.mjs'),
  'param-slice': () => import('./lazy/param-slice.mjs'),
  direct: () => import('./lazy/direct.mjs'),
};

const pending = new Map();
const loaded = new Set();
function load(feature) {
  if (!loaders[feature]) return Promise.resolve();
  if (!pending.has(feature)) {
    pending.set(feature, loaders[feature]().then(() => {
      loaded.add(feature);
      document.dispatchEvent(new CustomEvent('qd:feature-loaded', { detail: { feature } }));
    }).catch((error) => {
      pending.delete(feature);
      console.error('[qd] optional feature failed to load:', feature, error);
      throw error;
    }));
  }
  return pending.get(feature);
}

document.addEventListener('tab-changed', (event) => {
  const tab = event.detail && event.detail.tab;
  if (!loaders[tab] || loaded.has(tab)) return;
  load(tab).then(() => {
    // The tab switch can occur before a lazily imported module registers its
    // own lifecycle listener. Replay it once only if the user has not already
    // moved on to another tab.
    const active = document.querySelector('.tab-btn.active');
    if (active && active.dataset.tab === tab) {
      document.dispatchEvent(new CustomEvent('tab-changed', { detail: { tab } }));
    }
  }).catch(() => {});
});

document.addEventListener('qd:view-mode', (event) => {
  if (event.detail && event.detail.mode === 'direct') load('direct').catch(() => {});
});

export { load as loadQdFeature };
