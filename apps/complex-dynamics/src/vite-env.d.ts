/// <reference types="vite/client" />

/**
 * Minimal typings for `gif.js` (the MIT GIF encoder, which ships no types). Covers the
 * subset the animation/export studio uses. The worker is loaded via Vite's `?url` import.
 */
declare module "gif.js" {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    workerScript?: string;
    width?: number;
    height?: number;
    repeat?: number;
    background?: string;
    transparent?: number | null;
    dither?: boolean | string;
  }
  interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }
  type FrameSource = CanvasImageSource | CanvasRenderingContext2D | ImageData;
  export default class GIF {
    constructor(options?: GIFOptions);
    addFrame(image: FrameSource, opts?: AddFrameOptions): void;
    on(event: "finished", cb: (blob: Blob) => void): void;
    on(event: "progress", cb: (progress: number) => void): void;
    on(event: "start" | "abort", cb: () => void): void;
    render(): void;
    abort(): void;
  }
}
