import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "./canvas.ts";
import { createFlyerPreview } from "./preview.ts";
import { NO_LOGOS, testScene } from "./testing/test-scene.ts";
import { type DrawnFlyer, type FlyerFrame } from "./types.ts";

const FRAME: FlyerFrame = { scene: testScene(), values: { empresa: "ACME" }, scale: 0.1 };

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function setup(readFrame: () => FlyerFrame | null = () => FRAME) {
  const canvas = createCanvas(0, 0);
  const onDrawn = vi.fn<(drawn: DrawnFlyer) => void>();
  const read = vi.fn<() => FlyerFrame | null>(readFrame);
  return {
    canvas,
    onDrawn,
    read,
    preview: createFlyerPreview({ canvas, readFrame: read, logos: NO_LOGOS, onDrawn }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFlyerPreview", () => {
  it("drawNow draws before it returns, which the zoom needs", () => {
    const { canvas, onDrawn, preview } = setup();
    preview.drawNow();
    expect(canvas.width).toBe(124);
    expect(onDrawn).toHaveBeenCalledWith(expect.objectContaining({ extra: 0 }));
  });

  it("many requests within one frame are one draw", async () => {
    const { canvas, onDrawn, preview } = setup();
    preview.requestDraw();
    preview.requestDraw();
    preview.requestDraw();
    expect(canvas.width).toBe(0);
    await nextFrame();
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(124);
    preview.requestDraw();
    await nextFrame();
    expect(onDrawn).toHaveBeenCalledTimes(2);
  });

  it("a direct draw satisfies whoever was waiting for the frame", async () => {
    const { onDrawn, preview } = setup();
    preview.requestDraw();
    preview.drawNow();
    await nextFrame();
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });

  it("does not draw while there is no flyer to show", () => {
    const { canvas, onDrawn, read, preview } = setup(() => null);
    preview.drawNow();
    expect(read).toHaveBeenCalled();
    expect(onDrawn).not.toHaveBeenCalled();
    expect(canvas.width).toBe(0);
  });

  it("works with nobody listening", () => {
    const canvas = createCanvas(0, 0);
    createFlyerPreview({ canvas, readFrame: () => FRAME, logos: NO_LOGOS }).drawNow();
    expect(canvas.width).toBe(124);
  });

  it("once disposed, a pending frame does not draw", async () => {
    const { onDrawn, preview } = setup();
    preview.requestDraw();
    preview.dispose();
    await nextFrame();
    expect(onDrawn).not.toHaveBeenCalled();
    preview.dispose();
  });
});
