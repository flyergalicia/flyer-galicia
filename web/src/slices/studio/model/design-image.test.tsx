// The picture of a design, as it would be published.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogoLibrary, loadFlyerArtwork } from "@/shared/flyer-engine/index.ts";
import { createSectionLibrary } from "@/shared/lib/flyer-workspace/index.ts";
import {
  LOGO_A,
  paintedFlyer,
  paintedLogo,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { Bucket } from "@/shared/supabase/index.ts";
import { contentOf } from "../api/designs.ts";
import {
  baseFlyerScene,
  DesignImageError,
  type DesignPainter,
  type PaintOptions,
  paintDesign,
} from "./design-image.ts";

const SECTION = { u: "https://bucket/fuente_1.jpg", sy: 0, sh: 100, sw: 800, pad: 0 };
const PLACE = { x: 10, y: 10, w: 80, h: 40, bg: "rgb(255,255,255)" };
const OLD_SECTION_PIXEL = 300;

function painter(load: (key: string) => Promise<Blob> = () => paintedLogo(40, 20)): DesignPainter {
  return {
    logos: createLogoLibrary({ fetchLogo: load, onArrival: () => undefined }),
    sections: createSectionLibrary({
      isOurs: (address) => address.startsWith("https://bucket/"),
      load: () => Promise.resolve(null),
    }),
    origins: new Map(),
  };
}

async function wholeFlyer() {
  const artwork = await loadFlyerArtwork({ imageUrl: paintedFlyer([LOGO_A]), calibration: {} });
  if (!artwork.ok) throw new Error("It did not load");
  return artwork.value;
}

function options(strict: boolean) {
  const notify = vi.fn<PaintOptions["notify"]>();
  return { strict, notify };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the picture of a design", () => {
  it("has no sense without changes", async () => {
    await expect(
      paintDesign(painter(), await wholeFlyer(), contentOf({}), options(false)),
    ).rejects.toThrow("el diseño no tiene cambios");
  });

  it("comes with the cuts already made, and its logos brought first", async () => {
    const load = vi.fn<(key: string) => Promise<Blob>>(() => paintedLogo(40, 20));
    const { canvas } = await paintDesign(
      painter(load),
      await wholeFlyer(),
      contentOf({
        cambios: [
          { ...PLACE, img: "marca.png", t: "Marca", tx: 10, ty: 10, tw: 80, th: 40 },
          { ...PLACE, img: "orig:1,2,3,4", t: "Del flyer" },
          { ...PLACE, tipo: "txt", texto: "Hola", img: "" },
        ],
        recortes: [{ y: 500, h: 100 }],
      }),
      options(true),
    );
    expect(canvas.height).toBe(800);
    expect(canvas.width).toBe(800);
    expect(load).toHaveBeenCalledExactlyOnceWith("marca.png");
  });

  it("a logo of Promociones that does not arrive does not stop it", async () => {
    const { canvas } = await paintDesign(
      painter(() => Promise.reject(new Error("HTTP 404"))),
      await wholeFlyer(),
      contentOf({ cambios: [{ ...PLACE, img: "marca.png", t: "x", tx: 1, ty: 1, tw: 1, th: 1 }] }),
      options(true),
    );
    expect(canvas.height).toBe(900);
  });

  it("a section that did not arrive stops a publication", async () => {
    await expect(
      paintDesign(
        painter(),
        await wholeFlyer(),
        contentOf({ recortes: [{ y: OLD_SECTION_PIXEL, h: 100, ins: SECTION }] }),
        options(true),
      ),
    ).rejects.toThrow(/no se pudo bajar una sección insertada/);
  });

  it("to look at it, it is said and it goes on", async () => {
    const asked = options(false);
    const { canvas } = await paintDesign(
      painter(),
      await wholeFlyer(),
      contentOf({ recortes: [{ y: OLD_SECTION_PIXEL, h: 100, ins: SECTION }] }),
      asked,
    );
    expect(canvas.height).toBe(1000);
    expect(asked.notify).toHaveBeenCalledWith(
      expect.stringMatching(/^No se pudo bajar la sección insertada/),
      expect.anything(),
    );
    const many = options(false);
    await paintDesign(
      painter(),
      await wholeFlyer(),
      contentOf({
        recortes: [
          { y: OLD_SECTION_PIXEL, h: 100, ins: SECTION },
          { y: 600, h: 100, ins: SECTION },
        ],
      }),
      many,
    );
    expect(many.notify).toHaveBeenCalledWith(
      expect.stringMatching(/^No se pudo bajar 2 secciones insertadas/),
      expect.anything(),
    );
  });

  it("a logo of the PC that does not come back stops a publication", async () => {
    const lost = { ...PLACE, img: "pc:1:a.png", t: "a" };
    const whole = await wholeFlyer();
    await expect(
      paintDesign(painter(), whole, contentOf({ cambios: [lost] }), options(true)),
    ).rejects.toThrow(/no se pudo cargar el logo subido de la PC «a\.png»/);
    await expect(
      paintDesign(
        painter(),
        whole,
        contentOf({ cambios: [lost, { ...lost, img: "pc:2:b.png" }] }),
        options(true),
      ),
    ).rejects.toThrow(/no se pudo cargar 2 logos subidos de la PC/);
  });

  it("to look at it, a lost logo is said", async () => {
    const asked = options(false);
    await paintDesign(
      painter(),
      await wholeFlyer(),
      contentOf({ cambios: [{ ...PLACE, img: "pc:1:a.png", t: "a" }] }),
      asked,
    );
    expect(asked.notify).toHaveBeenCalledWith(
      expect.stringMatching(/^Falta el logo subido de la PC/),
      expect.anything(),
    );
  });

  it("a logo of the PC kept in the design comes back", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    const asked = options(true);
    const { canvas: painted } = await paintDesign(
      painter(),
      await wholeFlyer(),
      contentOf({
        cambios: [{ ...PLACE, img: "pc:1:a.png", t: "a", tx: 1, ty: 1, tw: 1, th: 1 }],
        subidos: { "pc:1:a.png": canvas.toDataURL() },
      }),
      asked,
    );
    expect(painted.width).toBe(800);
    expect(asked.notify).not.toHaveBeenCalled();
  });

  it("no canvas here, nothing", async () => {
    const whole = await wholeFlyer();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(
      paintDesign(
        painter(),
        whole,
        contentOf({ cambios: [{ ...PLACE, tipo: "txt", texto: "x", img: "" }] }),
        options(true),
      ),
    ).rejects.toBeInstanceOf(DesignImageError);
  });
});

function bucketWith(answer: unknown, ok = true): Bucket {
  const read: Bucket["readJson"] = () =>
    Promise.resolve(
      ok ? { ok: true, value: answer } : { ok: false, error: { kind: "unreachable", status: 503 } },
    );
  return {
    readJson: read,
    publicUrl: (file) => file,
    listedUrl: (name) => name,
    readText: () => Promise.resolve({ ok: true, value: "" }),
    upload: () => Promise.resolve({ ok: true, value: undefined }),
    list: () => Promise.resolve({ ok: true, value: [] }),
    remove: () => Promise.resolve({ ok: true, value: undefined }),
  };
}

describe("the flyer under it", () => {
  it("comes whole", async () => {
    const scene = await baseFlyerScene(bucketWith({ imageUrl: paintedFlyer([LOGO_A]) }), 9);
    expect(scene.art.width).toBe(800);
  });

  it("without one, or without its picture, it says so", async () => {
    await expect(baseFlyerScene(bucketWith({ imageUrl: null }), 9)).rejects.toThrow(
      "el flyer base no tiene imagen",
    );
    await expect(baseFlyerScene(bucketWith({}, false), 9)).rejects.toThrow(
      "el flyer base no tiene imagen",
    );
    await expect(
      baseFlyerScene(bucketWith({ imageUrl: "data:image/png;base64,AAAA" }), 9),
    ).rejects.toThrow("no se pudo bajar la imagen del flyer base");
  });
});
