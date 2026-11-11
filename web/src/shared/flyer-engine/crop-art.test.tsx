import { describe, expect, it, vi } from "vitest";
import { contextOf, createCanvas, pictureSize } from "./canvas.ts";
import { applyCuts, artFileName, cutsSignature } from "./crop-art.ts";
import { paintedCanvas, pixelAt } from "./testing/test-scene.ts";
import { type FlyerArt } from "./types.ts";

function stripes(...colors: string[]): HTMLCanvasElement {
  const canvas = createCanvas(40, colors.length * 10);
  const ctx = contextOf(canvas);
  for (const [index, color] of colors.entries()) {
    ctx.fillStyle = color;
    ctx.fillRect(0, index * 10, 40, 10);
  }
  return canvas;
}

function asCanvas(art: FlyerArt): HTMLCanvasElement {
  if (art instanceof HTMLCanvasElement) return art;
  throw new Error("Expected a canvas");
}

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];

async function imageOf(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = canvas.toDataURL("image/png");
  await image.decode();
  return image;
}

describe("applyCuts", () => {
  it("with no cuts, it is the same picture", () => {
    const art = stripes("#ff0000");
    expect(applyCuts(art, [], new Map())).toBe(art);
  });

  it("removes a band, and what is below goes up", () => {
    const result = asCanvas(
      applyCuts(stripes("#ff0000", "#00ff00", "#0000ff"), [{ y: 10, h: 10 }], new Map()),
    );
    expect(result.height).toBe(20);
    expect(pixelAt(result, 5, 5)).toEqual(RED);
    expect(pixelAt(result, 5, 15)).toEqual(BLUE);
  });

  it("each cut is measured on what the one before left", () => {
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000", "#00ff00", "#0000ff", "#ff0000"),
        [
          { y: 0, h: 10 },
          { y: 0, h: 10 },
        ],
        new Map(),
      ),
    );
    expect(result.height).toBe(20);
    expect(pixelAt(result, 5, 5)).toEqual(BLUE);
  });

  it("a cut at the edges does not leave the picture", () => {
    const art = stripes("#ff0000", "#00ff00");
    expect(asCanvas(applyCuts(art, [{ y: 15, h: 100 }], new Map())).height).toBe(15);
    expect(asCanvas(applyCuts(art, [{ y: -5, h: 10 }], new Map())).height).toBe(10);
    expect(asCanvas(applyCuts(art, [{ y: 500, h: 10 }], new Map())).height).toBe(20);
  });

  it("rounds the cut", () => {
    expect(asCanvas(applyCuts(stripes("#ff0000"), [{ y: 1.4, h: 2.6 }], new Map())).height).toBe(7);
  });
});

describe("inserting a section", () => {
  const SECTION = "https://flyers.invalid/s.jpg";

  it("the picture grows and the section goes in its place", async () => {
    const image = await imageOf(paintedCanvas(40, 50, "#0000ff"));
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000", "#00ff00"),
        [{ y: 10, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
        new Map([[SECTION, image]]),
      ),
    );
    expect(result.height).toBe(40);
    expect(pixelAt(result, 5, 5)).toEqual(RED);
    expect(pixelAt(result, 5, 20)).toEqual(BLUE);
    expect(pixelAt(result, 5, 35)).toEqual(GREEN);
  });

  it("with no image, the gap repeats the row above it: nothing fails", () => {
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000", "#00ff00"),
        [{ y: 10, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
        new Map(),
      ),
    );
    expect(result.height).toBe(40);
    expect(pixelAt(result, 5, 20)).toEqual(RED);
    expect(pixelAt(result, 5, 35)).toEqual(GREEN);
  });

  it("at the top there is no row above: it takes the first one", () => {
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000"),
        [{ y: 0, h: 10, ins: { u: SECTION, sy: 0, sh: 1 } }],
        new Map(),
      ),
    );
    expect(pixelAt(result, 5, 5)).toEqual(RED);
  });

  it("at the end it has nothing below", () => {
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000"),
        [{ y: 10, h: 5, ins: { u: SECTION, sy: 0, sh: 1 } }],
        new Map(),
      ),
    );
    expect(result.height).toBe(15);
    expect(pixelAt(result, 5, 12)).toEqual(RED);
  });

  it("with a margin, it keeps the color of this flyer around the section", async () => {
    const image = await imageOf(paintedCanvas(40, 50, "#0000ff"));
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000", "#ff0000"),
        [{ y: 10, h: 40, ins: { u: SECTION, sy: 0, sh: 50, pad: 5 } }],
        new Map([[SECTION, image]]),
      ),
    );
    expect(pixelAt(result, 5, 12)).toEqual(RED);
    expect(pixelAt(result, 5, 30)).toEqual(BLUE);
    expect(pixelAt(result, 5, 47)).toEqual(RED);
  });

  it("the margin cannot eat the section", async () => {
    const image = await imageOf(paintedCanvas(40, 50, "#0000ff"));
    const result = asCanvas(
      applyCuts(
        stripes("#ff0000"),
        [{ y: 0, h: 11, ins: { u: SECTION, sy: 0, sh: 50, pad: 500 } }],
        new Map([[SECTION, image]]),
      ),
    );
    expect(pixelAt(result, 5, 5)).toEqual(BLUE);
  });

  it("a similar background fades at the joints, and a different one stays sharp", async () => {
    const similar = await imageOf(paintedCanvas(40, 50, "#f0f0f0"));
    const faded = asCanvas(
      applyCuts(
        stripes("#ffffff", "#ffffff"),
        [{ y: 10, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
        new Map([[SECTION, similar]]),
      ),
    );
    expect(pixelAt(faded, 5, 10)[0]).toBeGreaterThan(240);
    expect(pixelAt(faded, 5, 29)[0]).toBeGreaterThan(240);
    expect(pixelAt(faded, 5, 20)).toEqual([240, 240, 240, 255]);

    const different = await imageOf(paintedCanvas(40, 50, "#0000ff"));
    const sharp = asCanvas(
      applyCuts(
        stripes("#ffffff", "#ffffff"),
        [{ y: 10, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
        new Map([[SECTION, different]]),
      ),
    );
    expect(pixelAt(sharp, 5, 10)).toEqual(BLUE);

    const equal = await imageOf(paintedCanvas(40, 50, "#ffffff"));
    const same = asCanvas(
      applyCuts(
        stripes("#ffffff", "#ffffff"),
        [{ y: 0, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
        new Map([[SECTION, equal]]),
      ),
    );
    expect(pixelAt(same, 5, 25)).toEqual([255, 255, 255, 255]);
  });

  it("a seam that cannot be read stays as it is", async () => {
    const image = await imageOf(paintedCanvas(40, 50, "#f0f0f0"));
    const reading = vi
      .spyOn(CanvasRenderingContext2D.prototype, "getImageData")
      .mockImplementation(() => {
        throw new DOMException("tainted");
      });
    const result = applyCuts(
      stripes("#ffffff", "#ffffff"),
      [{ y: 10, h: 20, ins: { u: SECTION, sy: 0, sh: 50 } }],
      new Map([[SECTION, image]]),
    );
    expect(pictureSize(result).height).toBe(40);
    reading.mockRestore();
  });
});

describe("the names", () => {
  it("artFileName takes the file of an address", () => {
    expect(artFileName("https://a.invalid/flyers/flyer_t9.jpg?v=1#rec=1")).toBe("flyer_t9.jpg");
    expect(artFileName("flyer.jpg")).toBe("flyer.jpg");
    expect(artFileName("")).toBe("");
  });

  it("the signature tells cuts apart, as the old app writes it", () => {
    expect(cutsSignature([{ y: 669.4, h: 340.2 }])).toBe("669-340");
    expect(
      cutsSignature([
        { y: 1, h: 2 },
        {
          y: 3,
          h: 4,
          ins: { u: "https://a.invalid/fuente_1234567890123.jpg?v=2", sy: 7.6, sh: 1 },
        },
      ]),
    ).toBe("1-2_i567890123jpg8.3-4");
  });
});

describe("pictureSize", () => {
  it("is that of the picture itself", async () => {
    const image = await imageOf(paintedCanvas(40, 50));
    image.width = 7;
    expect(pictureSize(image)).toEqual({ width: 40, height: 50 });
    expect(pictureSize(new Image())).toEqual({ width: 0, height: 0 });
    expect(pictureSize(createCanvas(3, 4))).toEqual({ width: 3, height: 4 });
  });
});
