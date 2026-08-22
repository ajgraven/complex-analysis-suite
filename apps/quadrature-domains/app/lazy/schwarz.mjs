// Schwarz dynamics and its optional sphere view are loaded together on first
// opening the Schwarz tab. Their modules rely on this registration order.
import '../schwarz/schwarz-common.mjs';
import '../schwarz/schwarz-inverse.mjs';
import '../schwarz/schwarz-analysis.mjs';
import '../schwarz/schwarz-forward.mjs';
import '../schwarz/schwarz-webgl.mjs';
import '../schwarz/schwarz-cpu-worker.mjs';
import '../schwarz/schwarz-paint.mjs';
import '../schwarz/schwarz-render.mjs';
import '../schwarz/schwarz-features.mjs';
import '../schwarz/schwarz-interaction.mjs';
import '../schwarz/schwarz-ui.mjs';
import '../sphere/sphere-common.mjs';
import '../sphere/sphere-webgl.mjs';
import '../sphere/sphere-ui.mjs';
