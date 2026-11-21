import { describe, expect, it, vi } from "vitest";
import { createLogoLibrary } from "@/shared/flyer-engine/index.ts";
import type { PlacedChange } from "./change.ts";
import { bestSeam } from "./cuts.ts";
import { designThumbnail } from "./design-thumbnail.ts";
import { gapNear, isBlankRow, rowsOf, sectionFromDrag, sectionThumbnail } from "./section-rows.ts";
import { restoreUploads, uploadsOf } from "./uploads.ts";

interface Block {
  readonly y: number;
  readonly h: number;
  readonly color: string;
}

function painted(blocks: readonly Block[], height = 1000, width = 200): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  for (const { y, h, color } of blocks) {
    context.fillStyle = color;
    context.fillRect(20, y, width - 40, h);
  }
  return canvas;
}

async function asImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = canvas.toDataURL("image/png");
  await image.decode();
  return image;
}

const TWO_BLOCKS = [
  { y: 100, h: 200, color: "#112233" },
  { y: 420, h: 200, color: "#445566" },
];

function libraryOf(images: Readonly<Record<string, HTMLCanvasElement>> = {}) {
  const library = createLogoLibrary({
    fetchLogo: () => Promise.reject(new Error("no red")),
    onArrival: () => undefined,
  });
  for (const [key, image] of Object.entries(images)) library.put(key, image);
  return library;
}

function change(fields: Partial<PlacedChange>): PlacedChange {
  return { x: 0, y: 0, w: 10, h: 10, bg: "#fff", t: "", ox: 0, oy: 0, ow: 10, oh: 10, ...fields };
}

describe("the rows of a flyer", () => {
  it("know a gap between blocks, and a card is not one", () => {
    const flyer = painted(TWO_BLOCKS);
    const rows = rowsOf(flyer);
    expect(rowsOf(flyer)).toBe(rows);
    expect(isBlankRow(rows, 50)).toBe(true);
    expect(isBlankRow(rows, 200)).toBe(false);
    expect(isBlankRow(rows, 360)).toBe(true);
  });

  it("go through a tall picture by pieces, and read an image too", async () => {
    const tall = painted([{ y: 500, h: 400, color: "#112233" }], 1000);
    const rows = rowsOf(await asImage(tall));
    expect(rows).toHaveLength(1000);
    expect(isBlankRow(rows, 450)).toBe(true);
    expect(isBlankRow(rows, 899)).toBe(false);
  });

  it("find the middle of the nearest gap, and half of it is what goes around", () => {
    const flyer = painted(TWO_BLOCKS);
    const gap = gapNear(flyer, 350, 160);
    expect(gap.y).toBe(360);
    expect(gap.g).toBeGreaterThanOrEqual(118);
    expect(gapNear(flyer, 330, 160).y).toBe(360);
  });

  it("without a gap near, the smoothest row", () => {
    const flyer = painted([{ y: 0, h: 1000, color: "#112233" }]);
    const { y, g } = gapNear(flyer, 500, 40);
    expect(g).toBe(0);
    expect(Math.abs(y - 500)).toBeLessThan(5);
  });
});

describe("what is copied of a flyer", () => {
  it("goes exactly over the block, without its blank margins", () => {
    const flyer = painted(TWO_BLOCKS);
    const section = sectionFromDrag(flyer, 90, 320);
    expect(section?.sy).toBe(100);
    expect(Math.abs((section?.sh ?? 0) - 200)).toBeLessThanOrEqual(1);
  });

  it("works upside down, and refuses what is too thin", () => {
    const flyer = painted(TWO_BLOCKS);
    expect(sectionFromDrag(flyer, 320, 90)).toEqual(sectionFromDrag(flyer, 90, 320));
    expect(sectionFromDrag(flyer, 200, 205)).toBeNull();
  });

  it("with no gaps near, what was dragged", () => {
    const flyer = painted([{ y: 0, h: 1000, color: "#112233" }]);
    const section = sectionFromDrag(flyer, 400, 420);
    expect(section?.sh).toBeGreaterThanOrEqual(12);
  });

  it("comes out as a small picture", async () => {
    const image = await asImage(painted(TWO_BLOCKS));
    const address = sectionThumbnail(image, { sy: 100, sh: 200 }, 100);
    expect(address).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe("when the picture cannot be read", () => {
  it("no gaps are known, and no thumbnail comes out", async () => {
    const image = await asImage(painted(TWO_BLOCKS, 500));
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    getContext.mockReturnValueOnce(null);
    expect(rowsOf(image)[0]).toBe(0);
    getContext.mockReturnValueOnce(null);
    expect(sectionThumbnail(image, { sy: 1, sh: 2 }, 10)).toBe("");
    vi.restoreAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
      throw new Error("tainted");
    });
    expect(sectionThumbnail(image, { sy: 1, sh: 2 }, 10)).toBe("");
    vi.restoreAllMocks();
    vi.spyOn(CanvasRenderingContext2D.prototype, "getImageData").mockImplementation(() => {
      throw new Error("tainted");
    });
    expect(rowsOf(painted([], 10))[0]).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("the seam of a cut", () => {
  it("goes to the rows that look the most alike", () => {
    const flyer = painted([{ y: 300, h: 100, color: "#112233" }]);
    const { y, h } = bestSeam(flyer, 290, 410);
    expect(h).toBe(120);
    expect(y).toBeLessThanOrEqual(300);
    expect(y + h).toBeGreaterThanOrEqual(400);
  });

  it("keeps what was marked if it cannot read the picture", () => {
    const flyer = painted([]);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValueOnce(null);
    expect(bestSeam(flyer, 100, 200)).toEqual({ y: 100, h: 100 });
    vi.restoreAllMocks();
  });
});

describe("the small picture of a design", () => {
  it("shows the changes, or the seam of a crop", () => {
    const art = painted(TWO_BLOCKS);
    const list = [change({ y: 100, h: 50, img: "", tx: 0, ty: 100, tw: 10, th: 50 })];
    const input = { art, artKey: "k", logos: libraryOf() };
    expect(designThumbnail({ ...input, list, cuts: [] })).toMatch(/^data:image\/jpeg/);
    expect(designThumbnail({ ...input, list: [], cuts: [{ y: 100, h: 5 }] })).toMatch(/^data:/);
    expect(designThumbnail({ ...input, list: [], cuts: [] })).toBe("");
    const far = [...list, change({ y: 800, h: 10, img: "" }), change({ y: 810, h: 10, img: "" })];
    expect(designThumbnail({ ...input, list: far, cuts: [] })).toMatch(/^data:/);
  });
});

describe("the uploaded logos", () => {
  const logo = painted([{ y: 2, h: 6, color: "#112233" }], 900, 700);

  it("travel as smaller pictures, and what is no longer in memory is kept", () => {
    const art = painted([]);
    const list = [
      change({ img: "pc:1:a" }),
      change({ img: "pc:1:a" }),
      change({ img: "pc:2:b" }),
      change({ img: "pc:3:c" }),
      change({ tipo: "txt", img: "pc:1:a" }),
      change({ img: "catalogo" }),
    ];
    const uploads = uploadsOf(
      list,
      { "pc:2:b": "previo" },
      libraryOf({ "pc:1:a": logo }),
      art,
      "k",
    );
    expect(uploads["pc:1:a"]).toMatch(/^data:image\/png/);
    expect(uploads["pc:2:b"]).toBe("previo");
    expect(uploads["pc:3:c"]).toBeUndefined();
    expect(Object.keys(uploads)).toHaveLength(2);
  });

  it("come back to memory; the same one is not restored twice, and another picture is", async () => {
    const library = libraryOf();
    const put = vi.spyOn(library, "put");
    const origins = new Map<string, string>();
    const address = logo.toDataURL("image/png");
    await restoreUploads({ "pc:1:a": address }, library, origins);
    expect(put).toHaveBeenCalledTimes(1);
    await restoreUploads({ "pc:1:a": address }, library, origins);
    expect(put).toHaveBeenCalledTimes(1);
    await restoreUploads({ "pc:1:a": painted([], 5, 5).toDataURL("image/png") }, library, origins);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("what does not come back is left for whoever opens it to warn about", async () => {
    const library = libraryOf();
    const put = vi.spyOn(library, "put");
    await restoreUploads({ "pc:1:a": "data:image/png;base64,no-es" }, library, new Map());
    expect(put).not.toHaveBeenCalled();
  });
});
