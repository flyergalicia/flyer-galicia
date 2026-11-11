import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleBackground } from "./background-sample.ts";
import { contextOf, createCanvas } from "./canvas.ts";
import { paintedCanvas, testScene } from "./testing/test-scene.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sampleBackground", () => {
  it("reads the color of the picture", () => {
    const scene = testScene({ art: paintedCanvas(1240, 100, "#102030") });
    expect(sampleBackground(scene, 0, 100, 50, "#fff")).toBe("rgb(16,32,48)");
  });

  it("a loose letter does not change the color: it takes the median of five points", () => {
    const art = paintedCanvas(1240, 100, "#102030");
    const ctx = contextOf(art);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 10, 100);
    expect(sampleBackground(testScene({ art }), 0, 100, 50, "#fff")).toBe("rgb(16,32,48)");
  });

  it("does not leave the picture, at any edge", () => {
    const art = paintedCanvas(1240, 100, "#102030");
    const scene = testScene({ art });
    expect(sampleBackground(scene, -50, -20, -10, "#fff")).toBe("rgb(16,32,48)");
    expect(sampleBackground(scene, 5000, 6000, 9000, "#fff")).toBe("rgb(16,32,48)");
  });

  it("measures in calibration pixels, whatever the real width", () => {
    const art = paintedCanvas(620, 100, "#ffffff");
    const ctx = contextOf(art);
    ctx.fillStyle = "#102030";
    ctx.fillRect(310, 0, 310, 100);
    const scene = testScene({ art });
    expect(sampleBackground(scene, 640, 1240, 10, "#000")).toBe("rgb(16,32,48)");
    expect(sampleBackground(scene, 0, 600, 10, "#000")).toBe("rgb(255,255,255)");
  });

  it("remembers the color of a point of a picture", () => {
    const read = vi.spyOn(CanvasRenderingContext2D.prototype, "getImageData");
    const scene = testScene({ art: paintedCanvas(1240, 100) });
    sampleBackground(scene, 0, 100, 10, "#fff");
    sampleBackground(scene, 0, 100, 10, "#fff");
    expect(read).toHaveBeenCalledTimes(1);
    sampleBackground(scene, 0, 100, 11, "#fff");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("forgets when the picture changes its size", () => {
    const art = paintedCanvas(1240, 100, "#102030");
    const scene = testScene({ art });
    sampleBackground(scene, 0, 100, 10, "#fff");
    art.height = 200;
    const ctx = contextOf(art);
    ctx.fillStyle = "#405060";
    ctx.fillRect(0, 0, 1240, 200);
    expect(sampleBackground(scene, 0, 100, 10, "#fff")).toBe("rgb(64,80,96)");
  });

  it("forgets everything past a limit, because the calibrator asks for many points", () => {
    const art = paintedCanvas(1240, 500, "#102030");
    const scene = testScene({ art });
    for (let y = 0; y <= 401; y += 1) sampleBackground(scene, 0, 10, y, "#fff");
    const read = vi.spyOn(CanvasRenderingContext2D.prototype, "getImageData");
    sampleBackground(scene, 0, 10, 0, "#fff");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("falls back when the picture cannot be read, and does not remember the failure", () => {
    const art = createCanvas(0, 0);
    const scene = testScene({ art });
    expect(sampleBackground(scene, 0, 100, 10, "#abcdef")).toBe("#abcdef");
    art.width = 1240;
    art.height = 100;
    expect(sampleBackground(scene, 0, 100, 10, "#abcdef")).toBe("rgb(0,0,0)");
  });
});
