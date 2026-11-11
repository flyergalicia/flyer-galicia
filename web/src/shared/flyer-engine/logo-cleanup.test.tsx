import { describe, expect, it } from "vitest";
import { contextOf, createCanvas } from "./canvas.ts";
import { cleanLogo } from "./logo-cleanup.ts";
import { paintedCanvas, pixelAt } from "./testing/test-scene.ts";

const CLEAR = [0, 0, 0, 0];

function withBlock(background: string, ink: string, size = 40): HTMLCanvasElement {
  const canvas = paintedCanvas(size, size, background);
  const ctx = contextOf(canvas);
  ctx.fillStyle = ink;
  ctx.fillRect(10, 10, 20, 20);
  return canvas;
}

function isEmpty(canvas: HTMLCanvasElement): boolean {
  const { data } = contextOf(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return data.every((value, index) => index % 4 !== 3 || value === 0);
}

function transparentWith(paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = createCanvas(100, 100);
  paint(contextOf(canvas));
  return canvas;
}

describe("cleanLogo", () => {
  it("takes out the background and cuts to the ink", () => {
    const logo = cleanLogo(withBlock("#ffffff", "#ff0000"));
    expect({ width: logo.width, height: logo.height }).toEqual({ width: 20, height: 20 });
    expect(pixelAt(logo, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it("works with any light background, taken from the corners", () => {
    const logo = cleanLogo(withBlock("#e0e0a0", "#000080"));
    expect(logo.width).toBe(20);
    expect(pixelAt(logo, 10, 10)).toEqual([0, 0, 128, 255]);
  });

  it("does not touch what is enclosed by the drawing", () => {
    const canvas = paintedCanvas(40, 40, "#ffffff");
    const ctx = contextOf(canvas);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(10, 10, 20, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(18, 18, 4, 4);
    const logo = cleanLogo(canvas);
    expect(pixelAt(logo, 10, 10)).toEqual([255, 255, 255, 255]);
  });

  it("softens an edge that mixes ink and background, and leaves no halo", () => {
    const canvas = paintedCanvas(40, 40, "#ffffff");
    const ctx = contextOf(canvas);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(10, 10, 20, 20);
    ctx.fillStyle = "#ffb0b0";
    ctx.fillRect(9, 10, 1, 20);
    const logo = cleanLogo(canvas);
    const [r, g, , alpha] = pixelAt(logo, 0, 10);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
    expect(r).toBe(255);
    expect(g).toBeLessThan(0xb0);
    expect(pixelAt(logo, 5, 5)[3]).toBe(255);
  });

  it("keeps the margins when it is told to: a moved logo must not stretch", () => {
    const logo = cleanLogo(withBlock("#ffffff", "#ff0000"), { keepMargins: true });
    expect(logo.width).toBe(40);
    expect(pixelAt(logo, 0, 0)).toEqual(CLEAR);
    expect(pixelAt(logo, 20, 20)).toEqual([255, 0, 0, 255]);
  });

  it("a picture that is all background gives back the empty picture", () => {
    const logo = cleanLogo(paintedCanvas(20, 20, "#ffffff"));
    expect(logo.width).toBe(20);
    expect(isEmpty(logo)).toBe(true);
  });

  it("reads images too", async () => {
    const image = new Image();
    image.src = withBlock("#ffffff", "#ff0000").toDataURL("image/png");
    await image.decode();
    expect(cleanLogo(image).width).toBe(20);
  });

  describe("a PNG that already has a transparent background", () => {
    it("keeps its light letters", () => {
      const logo = cleanLogo(
        transparentWith((ctx) => {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(10, 10, 5, 5);
          ctx.fillStyle = "#ff0000";
          ctx.fillRect(30, 30, 10, 10);
        }),
      );
      expect(logo.width).toBe(30);
      expect(pixelAt(logo, 2, 2)).toEqual([255, 255, 255, 255]);
    });

    it("loses a big white box inside it, which on a cream flyer would be a patch", () => {
      const logo = cleanLogo(
        transparentWith((ctx) => {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(10, 10, 80, 80);
          ctx.fillStyle = "#ff0000";
          ctx.fillRect(40, 40, 20, 20);
        }),
      );
      expect({ width: logo.width, height: logo.height }).toEqual({ width: 20, height: 20 });
    });

    it("a thin white frame covers a big box, but does not fill it: it stays", () => {
      const logo = cleanLogo(
        transparentWith((ctx) => {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.strokeRect(10, 10, 80, 80);
        }),
      );
      expect(logo.width).toBeGreaterThan(70);
    });
  });

  describe("a dark background", () => {
    it("with light letters, they take its color and the square goes away", () => {
      const logo = cleanLogo(withBlock("#102a60", "#ffffff"));
      expect(logo.width).toBe(20);
      expect(pixelAt(logo, 10, 10)).toEqual([16, 42, 96, 255]);
    });

    it("with colors, the whole square stays", () => {
      const logo = cleanLogo(withBlock("#102a60", "#ff0000"));
      expect(logo.width).toBe(40);
      expect(pixelAt(logo, 20, 20)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(logo, 0, 0)[3]).toBe(255);
    });

    it("with nothing inside, the square stays too", () => {
      expect(cleanLogo(paintedCanvas(20, 20, "#102a60")).width).toBe(20);
    });

    it("half light letters and half color count as colors", () => {
      const canvas = paintedCanvas(40, 40, "#102a60");
      const ctx = contextOf(canvas);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(10, 10, 10, 20);
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(20, 10, 10, 20);
      expect(cleanLogo(canvas).width).toBe(40);
    });
  });

  it("opaque corners of different colors take the median", () => {
    const canvas = paintedCanvas(30, 30, "#ffffff");
    const ctx = contextOf(canvas);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(12, 12, 6, 6);
    const logo = cleanLogo(canvas);
    expect(logo.width).toBeLessThan(30);
  });
});
