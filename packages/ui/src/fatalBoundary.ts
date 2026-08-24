// @cas/ui — fatal-error boundary + banner.
//
// Ports Complex Dynamics' init boundary (apps/complex-dynamics/src/main.ts:6876-6892, and
// `showFatalBanner` at :260-266): run the app's init inside try/catch, detect a missing-WebGL2 failure
// and show tailored copy in a `role="alert"` banner, and ALWAYS remove the boot overlay once init
// settles. The newest apps have NO error element — an uncaught init throw white-screens into an empty
// <div id="app"> (UX audit finding #3) — so when the banner element is absent this creates one, giving
// every app a graceful failure instead of a blank page. Supports a sync OR async `init`.

const DEFAULT_WEBGL_MESSAGE =
  "This tool needs WebGL2, which isn't available in your browser. Try a recent version of Chrome, " +
  "Firefox, Edge, or Safari 15+, and make sure hardware acceleration is enabled.";
const DEFAULT_GENERIC_MESSAGE =
  "Something went wrong starting this tool. See the browser console for details.";

export interface FatalBoundaryOptions {
  /** Boot/loading overlay element id, removed once init settles (default "boot-loading" — CD's id). */
  readonly bootOverlayId?: string;
  /** `role="alert"` banner element id; created and prepended to <body> if absent (default "app-error"). */
  readonly bannerId?: string;
  /** Copy for a WebGL2-unavailable failure. */
  readonly webglMessage?: string;
  /** Copy for any other init failure. */
  readonly genericMessage?: string;
  /** Error sink (default `console.error`). */
  readonly onError?: (err: unknown) => void;
  /** Document to operate on (default the global). Injectable for tests. */
  readonly doc?: Document;
}

/** Show (creating if needed) the fatal-error banner with `message`. */
export function showFatalBanner(message: string, opts: FatalBoundaryOptions = {}): void {
  const doc = opts.doc ?? document;
  const id = opts.bannerId ?? "app-error";
  let banner = doc.getElementById(id);
  if (!banner) {
    banner = doc.createElement("div");
    banner.id = id;
    banner.setAttribute("role", "alert");
    doc.body?.prepend(banner);
  }
  banner.textContent = message;
  banner.hidden = false;
}

/**
 * Run `init` inside a fatal-error boundary: on throw/rejection show a tailored banner (WebGL2-aware);
 * always remove the boot overlay once init settles. A synchronous `init` is handled synchronously; a
 * returned promise is awaited.
 */
export function runWithFatalBoundary(
  init: () => void | Promise<void>,
  opts: FatalBoundaryOptions = {},
): void {
  const doc = opts.doc ?? document;
  const removeBoot = (): void => {
    doc.getElementById(opts.bootOverlayId ?? "boot-loading")?.remove();
  };
  const fail = (err: unknown): void => {
    (opts.onError ?? ((e) => console.error("Failed to initialize:", e)))(err);
    const webglMissing = err instanceof Error && /WebGL2/i.test(err.message);
    showFatalBanner(
      webglMissing
        ? (opts.webglMessage ?? DEFAULT_WEBGL_MESSAGE)
        : (opts.genericMessage ?? DEFAULT_GENERIC_MESSAGE),
      opts,
    );
  };

  let result: void | Promise<void>;
  try {
    result = init();
  } catch (err) {
    fail(err);
    removeBoot();
    return;
  }
  if (result && typeof (result as Promise<void>).then === "function") {
    (result as Promise<void>).then(removeBoot, (err) => {
      fail(err);
      removeBoot();
    });
  } else {
    removeBoot();
  }
}
