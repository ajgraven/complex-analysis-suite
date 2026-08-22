// Algebra's symbolic workspace is the largest optional feature. It registers
// itself with QD_UI; ui.mjs mounts it after this entry resolves.
import '../algebra/sym-worker.mjs';
import '../algebra/cas-export.mjs';
import '../algebra/expr-parser.mjs';
import '../algebra/algebra-store.mjs';
import '../algebra/algebra-canvas.mjs';
import '../algebra/algebra-ui.mjs';
