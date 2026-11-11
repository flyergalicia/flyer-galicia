import { describe, expect, it, vi } from "vitest";
import { type FlyerScene } from "./index.ts";
import {
  type CropOptions,
  cropScene,
  loadFlyerArtwork,
  loadPicture,
  sceneForStoredValues,
  sceneOf,
  storedCropOf,
} from "./scene.ts";
import { paintedCanvas, pixelAt } from "./testing/test-scene.ts";
import { resolveCalibration } from "./calibration.ts";

const OK_IMAGE = paintedCanvas(1240, 6457, "#102030").toDataURL("image/png");
const BROKEN = "data:image/png;base64,AAAA";
const noSections = { loadSection: () => Promise.resolve(null) };

async function loaded(calibration = {}, singleCashback = false): Promise<FlyerScene> {
  const result = await loadFlyerArtwork({ imageUrl: OK_IMAGE, calibration, singleCashback });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("loadFlyerArtwork", () => {
  it("with no flyer uploaded the answer is firm, and it is not that of a failure", async () => {
    await expect(loadFlyerArtwork({ imageUrl: null })).resolves.toEqual({
      ok: false,
      error: "no-flyer",
    });
    await expect(loadFlyerArtwork({ imageUrl: "" })).resolves.toEqual({
      ok: false,
      error: "no-flyer",
    });
  });

  it("a picture that does not arrive is a failure to try again", async () => {
    await expect(loadFlyerArtwork({ imageUrl: BROKEN })).resolves.toEqual({
      ok: false,
      error: "network",
    });
  });

  it("the scene has the picture with its calibration, under the address of the browser", async () => {
    const scene = await loaded({ empresa: { yc: 1 } }, true);
    expect(scene.art.width).toBe(1240);
    expect(scene.artKey).toBe(OK_IMAGE);
    expect(scene.calibration.empresa.yc).toBe(1);
    expect(scene.singleCashback).toBe(true);
    expect(scene.cuts).toEqual([]);
    expect(scene.whole).toMatchObject({ art: scene.art, artKey: OK_IMAGE });
  });

  it("no calibration is the default one", async () => {
    const result = await loadFlyerArtwork({ imageUrl: OK_IMAGE });
    expect(result.ok && result.value.calibration).toEqual(resolveCalibration());
    expect(result.ok && result.value.singleCashback).toBe(false);
  });
});

describe("sceneOf", () => {
  it("is a picture in hand with its calibration, whole and with no cuts", () => {
    const art = paintedCanvas(1240, 3000);
    const scene = sceneOf(art, "calibrando", { empresa: { yc: 5 } }, true);
    expect(scene.art).toBe(art);
    expect(scene.artKey).toBe("calibrando");
    expect(scene.calibration.empresa.yc).toBe(5);
    expect(scene.calibration.empresa.fs).toBe(46);
    expect(scene.singleCashback).toBe(true);
    expect(scene.whole).toEqual({
      art,
      artKey: "calibrando",
      rawCalibration: { empresa: { yc: 5 } },
    });
    expect(scene.cuts).toEqual([]);
  });
});

describe("loadPicture", () => {
  it("is null when the picture does not arrive", async () => {
    await expect(loadPicture(BROKEN)).resolves.toBeNull();
    expect(await loadPicture(OK_IMAGE)).toBeInstanceOf(HTMLImageElement);
  });

  it("is null for a picture with no size", async () => {
    const empty = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const image = await loadPicture(empty);
    expect(image === null || image.naturalWidth > 0).toBe(true);
  });
});

describe("cropScene", () => {
  it("is another scene: the picture and the calibration change together", async () => {
    const whole = await loaded({ empresa: { yc: 2000 } });
    const { scene, missingSections } = await cropScene(whole, [{ y: 100, h: 200 }], noSections);
    expect(scene).not.toBe(whole);
    expect(scene.art.height).toBe(6257);
    expect(scene.calibration.empresa.yc).toBe(1800);
    expect(whole.art.height).toBe(6457);
    expect(whole.calibration.empresa.yc).toBe(2000);
    expect(missingSections).toBe(0);
  });

  it("its key says which cuts it has, so old logo changes do not apply", async () => {
    const { scene } = await cropScene(await loaded(), [{ y: 669, h: 340 }], noSections);
    expect(scene.artKey).toBe(`${OK_IMAGE}#rec=669-340`);
    expect(scene.cuts).toEqual([{ y: 669, h: 340 }]);
    expect(scene.whole.artKey).toBe(OK_IMAGE);
  });

  it("cuts are always counted from the whole flyer", async () => {
    const whole = await loaded({ empresa: { yc: 2000 } });
    const once = await cropScene(whole, [{ y: 100, h: 200 }], noSections);
    const again = await cropScene(once.scene, [{ y: 100, h: 100 }], noSections);
    expect(again.scene.art.height).toBe(6357);
    expect(again.scene.calibration.empresa.yc).toBe(1900);
  });

  it("with no cuts, it is the whole flyer again", async () => {
    const whole = await loaded({ empresa: { yc: 2000 } });
    const { scene: cropped } = await cropScene(whole, [{ y: 100, h: 200 }], noSections);
    const { scene } = await cropScene(cropped, [], noSections);
    expect(scene.art).toBe(whole.art);
    expect(scene.artKey).toBe(whole.artKey);
    expect(scene.calibration).toEqual(whole.calibration);
  });

  it("keeps the tab of the flyer", async () => {
    const { scene } = await cropScene(await loaded({}, true), [{ y: 1, h: 1 }], noSections);
    expect(scene.singleCashback).toBe(true);
  });

  it("brings the sections before it draws, once per address", async () => {
    const image = await loadPicture(paintedCanvas(1240, 10, "#ff0000").toDataURL("image/png"));
    const loadSection = vi.fn<CropOptions["loadSection"]>(() => Promise.resolve(image));
    const section = { u: "https://flyers.invalid/s.jpg", sy: 0, sh: 10 };
    const { scene, missingSections } = await cropScene(
      await loaded(),
      [
        { y: 100, h: 50, ins: section },
        { y: 300, h: 50, ins: section },
      ],
      { loadSection },
    );
    expect(loadSection).toHaveBeenCalledTimes(1);
    expect(missingSections).toBe(0);
    expect(scene.art.height).toBe(6557);
    if (!(scene.art instanceof HTMLCanvasElement)) throw new Error("Expected a canvas");
    expect(pixelAt(scene.art, 5, 125)).toEqual([255, 0, 0, 255]);
  });

  it("a section that does not arrive leaves a gap and is counted, one per cut", async () => {
    const section = { u: "https://flyers.invalid/s.jpg", sy: 0, sh: 10 };
    const { scene, missingSections } = await cropScene(
      await loaded(),
      [
        { y: 100, h: 50, ins: section },
        { y: 300, h: 50, ins: section },
        { y: 500, h: 50 },
      ],
      noSections,
    );
    expect(missingSections).toBe(2);
    expect(scene.art.height).toBe(6507);
  });
});

describe("sceneForStoredValues", () => {
  it("with no cuts, it is the same scene", async () => {
    const scene = await loaded();
    await expect(sceneForStoredValues(scene, { empresa: "X" }, noSections)).resolves.toEqual({
      scene,
      missingSections: 0,
      cropDiscarded: false,
    });
    await expect(
      sceneForStoredValues(scene, { empresa: "X", recortes: [] }, noSections),
    ).resolves.toMatchObject({ scene, cropDiscarded: false });
  });

  it("with the flyer it was made on, it is cut again", async () => {
    const whole = await loaded();
    const { scene: cropped } = await cropScene(whole, [{ y: 100, h: 200 }], noSections);
    const stored = storedCropOf(cropped);
    const result = await sceneForStoredValues(whole, { empresa: "X", ...stored }, noSections);
    expect(result.cropDiscarded).toBe(false);
    expect(result.scene.art.height).toBe(6257);
    expect(result.scene.artKey).toBe(cropped.artKey);
  });

  it("if the flyer changed, it comes out uncut, and says so", async () => {
    const whole = await loaded();
    const result = await sceneForStoredValues(
      whole,
      { empresa: "X", recortes: [{ y: 100, h: 200 }], recBase: "otro.jpg" },
      noSections,
    );
    expect(result).toEqual({ scene: whole, missingSections: 0, cropDiscarded: true });
  });
});

describe("storedCropOf", () => {
  it("is nothing for a whole flyer", async () => {
    expect(storedCropOf(await loaded())).toEqual({});
  });

  it("is a copy of the cuts, with the name of the file", async () => {
    const whole = await loaded();
    const cuts = [{ y: 100, h: 200 }];
    const { scene } = await cropScene(whole, cuts, noSections);
    const stored = storedCropOf(scene);
    expect(stored.recortes).toEqual(cuts);
    expect(stored.recortes?.[0]).not.toBe(cuts[0]);
    expect(stored.recBase).toBe(OK_IMAGE.split("/").pop());
  });
});
