/**
 * Minimal canvas → WebM recorder (Phase 17), built on `MediaRecorder` +
 * `canvas.captureStream`. The GL canvases use `preserveDrawingBuffer: true`, so the
 * stream captures rendered frames rather than black. No external dependency.
 */

export interface CanvasRecorder {
  /** Stop recording and resolve the captured clip as a WebM Blob. */
  stop(): Promise<Blob>;
}

const MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** Whether this browser can record a canvas to WebM. */
export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    MIME_CANDIDATES.some((m) => MediaRecorder.isTypeSupported(m))
  );
}

function pickMime(): string {
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

/** Begin recording `canvas` at `fps`; call `stop()` to finish and get the WebM blob. */
export function startRecording(canvas: HTMLCanvasElement, fps = 30): CanvasRecorder {
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: pickMime() });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          // Stop the capture tracks too: MediaRecorder.stop() ends the recording but leaves the
          // captureStream's video track live, so each recording would leak an active track (and keep
          // the canvas-capture pipeline running). Releasing them here bounds it to one live stream.
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: "video/webm" }));
        };
        rec.stop();
      }),
  };
}

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the download isn't cancelled mid-flight (revoking the URL
  // synchronously after click() drops larger downloads in Firefox). Mirrors
  // downloadCanvas in hiResExport.ts.
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
