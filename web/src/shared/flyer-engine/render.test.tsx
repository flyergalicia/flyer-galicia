import { describe, expect, it, vi } from "vitest";
import { contextOf, createCanvas } from "./canvas.ts";
import { finalHeight, renderFullResolution, renderPreview } from "./render.ts";
import { NO_LOGOS, paintedCanvas, TEST_ART_KEY, testScene } from "./testing/test-scene.ts";
import { type FlyerValues, type LogoSource } from "./types.ts";

const VALUES: FlyerValues = {
  empresa: "ALIMENTOS DEL SUR SA",
  m1: "$250.000",
  m2: "$180.000",
  m3: "$80.000",
  m4: "$30.000",
  legal: "Legal de prueba.",
  has1: true,
  nombre: "Ana Perez",
  celular: "Cel: 11 4444 5555",
  email: "ana.perez@bancogalicia.com.ar",
};

function pixelsOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return contextOf(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
}

/** How many bytes differ: comparing a whole flyer with toEqual takes minutes when it fails. */
function differences(first: Uint8ClampedArray, second: Uint8ClampedArray): number {
  if (first.length !== second.length) return Math.max(first.length, second.length);
  return first.reduce((total, value, index) => total + Number(value !== second[index]), 0);
}

describe("finalHeight", () => {
  const scene = testScene({ art: paintedCanvas(1240, 6000) });

  it("is the end of the content plus some air", () => {
    expect(finalHeight(scene, { extra: 0, contentBottom: 5000.2 })).toBe(5046);
  });

  it("never goes past the picture, and grows with it", () => {
    expect(finalHeight(scene, { extra: 0, contentBottom: 5990 })).toBe(6000);
    expect(finalHeight(scene, { extra: 130, contentBottom: 6090 })).toBe(6130);
  });

  it("does not cut anything when nothing was measured", () => {
    expect(finalHeight(scene, { extra: 10, contentBottom: 0 })).toBe(6010);
  });

  it("never goes below a quarter of the flyer", () => {
    expect(finalHeight(scene, { extra: 0, contentBottom: 10 })).toBe(1500);
  });

  it("a height fixed in the calibrator wins, up to the picture", () => {
    const fixed = testScene({ art: paintedCanvas(1240, 6000), calibration: { cropH: 3000.4 } });
    expect(finalHeight(fixed, { extra: 0, contentBottom: 5000 })).toBe(3000);
    const tooTall = testScene({ art: paintedCanvas(1240, 6000), calibration: { cropH: 9000 } });
    expect(finalHeight(tooTall, { extra: 0, contentBottom: 5000 })).toBe(6000);
  });

  it("the air scales with the real width", () => {
    const narrow = testScene({ art: paintedCanvas(620, 3000), calibration: { bottomMargin: 100 } });
    expect(finalHeight(narrow, { extra: 0, contentBottom: 2000 })).toBe(2050);
  });
});

describe("renderFullResolution", () => {
  it("comes out at the real width, with the white below it cut", () => {
    const canvas = renderFullResolution(testScene(), VALUES, NO_LOGOS);
    expect(canvas.width).toBe(1240);
    expect(canvas.height).toBe(5595 + 17 + 45);
  });

  it("returns a new canvas every time, which a later flyer does not change", () => {
    const scene = testScene();
    const first = renderFullResolution(scene, VALUES, NO_LOGOS);
    const before = pixelsOf(first).slice();
    const second = renderFullResolution(scene, { ...VALUES, empresa: "OTRA" }, NO_LOGOS);
    expect(second).not.toBe(first);
    expect(differences(pixelsOf(first), before)).toBe(0);
    expect(differences(pixelsOf(second), before)).toBeGreaterThan(0);
  });

  it("keeps one work canvas: a batch does not make one per flyer", () => {
    const scene = testScene();
    renderFullResolution(scene, VALUES, NO_LOGOS);
    const creating = vi.spyOn(document, "createElement");
    renderFullResolution(scene, VALUES, NO_LOGOS);
    expect(creating.mock.calls.filter(([tag]) => tag === "canvas")).toHaveLength(1);
    creating.mockRestore();
  });

  it("what a flyer with more officers leaves does not reach the next one", () => {
    const scene = testScene();
    const clean = pixelsOf(renderFullResolution(scene, VALUES, NO_LOGOS));
    const many: FlyerValues = {
      ...VALUES,
      has2: true,
      nombre2: "B",
      has3: true,
      nombre3: "C",
      has4: true,
      nombre4: "D",
    };
    expect(renderFullResolution(scene, many, NO_LOGOS).height).toBeGreaterThan(5657);
    expect(differences(pixelsOf(renderFullResolution(scene, VALUES, NO_LOGOS)), clean)).toBe(0);
  });

  it("the high smoothing of a logo does not stay for the next flyer", () => {
    const logo = paintedCanvas(40, 40, "#ff0000");
    const logos: LogoSource = { ...NO_LOGOS, imageFor: () => logo };
    const small = paintedCanvas(620, 3228);
    const scene = testScene({ art: small });
    const clean = pixelsOf(renderFullResolution(scene, VALUES, NO_LOGOS));
    const change = { x: 1, y: 1, w: 1, h: 1, bg: "#fff", tx: 1, ty: 1, tw: 1, th: 1, img: "a" };
    const drawImage = vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage");
    renderFullResolution(scene, { ...VALUES, logos: [change], logosSrc: TEST_ART_KEY }, logos);
    const [workContext] = drawImage.mock.contexts;
    drawImage.mockRestore();
    // At scale 1 no pixel shows it, so the state of the work canvas is what says it did not stay.
    if (!(workContext instanceof CanvasRenderingContext2D)) throw new Error("It drew nothing");
    expect(workContext.imageSmoothingQuality).toBe("low");
    expect(differences(pixelsOf(renderFullResolution(scene, VALUES, NO_LOGOS)), clean)).toBe(0);
  });

  it("does not leave the work canvas in a bad state if drawing fails", () => {
    const scene = testScene();
    const failing: LogoSource = {
      ...NO_LOGOS,
      imageFor: () => {
        throw new Error("no");
      },
    };
    const change = { x: 1, y: 1, w: 1, h: 1, bg: "#fff", tx: 1, ty: 1, tw: 1, th: 1, img: "a" };
    expect(() =>
      renderFullResolution(scene, { ...VALUES, logos: [change], logosSrc: TEST_ART_KEY }, failing),
    ).toThrow("no");
    expect(renderFullResolution(scene, VALUES, NO_LOGOS).width).toBe(1240);
  });
});

describe("renderPreview", () => {
  it("at scale 1, it gives the same pixels as the download", () => {
    const scene = testScene();
    const target = createCanvas(0, 0);
    renderPreview(target, createCanvas(0, 0), { scene, values: VALUES, scale: 1 }, NO_LOGOS);
    const download = renderFullResolution(scene, VALUES, NO_LOGOS);
    expect({ width: target.width, height: target.height }).toEqual({
      width: download.width,
      height: download.height,
    });
    expect(differences(pixelsOf(target), pixelsOf(download))).toBe(0);
  });

  it("at the zoom of the screen, it has the size of that zoom", () => {
    const target = createCanvas(0, 0);
    const drawn = renderPreview(
      target,
      createCanvas(0, 0),
      { scene: testScene(), values: VALUES, scale: 0.5 },
      NO_LOGOS,
    );
    expect(target.width).toBe(620);
    expect(target.height).toBe(Math.round(Math.ceil(drawn.contentBottom + 45) * 0.5));
  });

  it("reusing its canvases, it leaves nothing of the previous draw", () => {
    const scene = testScene();
    const target = createCanvas(0, 0);
    const work = createCanvas(0, 0);
    renderPreview(target, work, { scene, values: VALUES, scale: 1 }, NO_LOGOS);
    const clean = pixelsOf(target).slice();
    renderPreview(
      target,
      work,
      { scene, values: { ...VALUES, empresa: "OTRA" }, scale: 1 },
      NO_LOGOS,
    );
    renderPreview(target, work, { scene, values: VALUES, scale: 1 }, NO_LOGOS);
    expect(differences(pixelsOf(target), clean)).toBe(0);
  });

  it("as in the current app, the high smoothing of a logo stays while the canvas keeps its size", () => {
    const logo = paintedCanvas(40, 40, "#ff0000");
    const logos: LogoSource = { ...NO_LOGOS, imageFor: () => logo };
    const change = { x: 1, y: 1, w: 1, h: 1, bg: "#fff", tx: 1, ty: 1, tw: 1, th: 1, img: "a" };
    const target = createCanvas(0, 0);
    const work = createCanvas(0, 0);
    const scene = testScene();
    renderPreview(target, work, { scene, values: VALUES, scale: 0.5 }, logos);
    expect(contextOf(work).imageSmoothingQuality).toBe("low");
    renderPreview(
      target,
      work,
      { scene, values: { ...VALUES, logos: [change], logosSrc: TEST_ART_KEY }, scale: 0.5 },
      logos,
    );
    expect(contextOf(work).imageSmoothingQuality).toBe("high");
    renderPreview(target, work, { scene, values: VALUES, scale: 0.5 }, logos);
    expect(contextOf(work).imageSmoothingQuality).toBe("high");
  });
});
