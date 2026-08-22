// Direct mode lives inside the QD tab but is not needed to solve an inverse QD.
// Keep its parsing, verification, and UI code out of the initial module graph.
import '../direct/direct-common.mjs';
import '../direct/direct-recompute.mjs';
import '../direct/direct-verify.mjs';
import '../direct/direct-ui.mjs';
