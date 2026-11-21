import { describe, expect, it, vi } from "vitest";
import {
  backgroundOf,
  countLines,
  destinationOf,
  detectLogo,
  hasFailed,
  markedPlace,
  pixelsOf,
  printedColor,
  printedTextColor,
  rgbOf,
  rgbText,
  roundedBox,
} from "./flyer-pixels.ts";
import {
  daysLayout,
  evenDestination,
  printedFontSize,
  splitDays,
  unitOf,
} from "./supermarket-days.ts";
import { measured, widthOfLines } from "./text-measure.ts";
import { isAlmostWhite, readLogoFile, shrunk, uploadFailureText } from "./uploaded-logo.ts";
import type { PlacedChange } from "./change.ts";

type Block = readonly [number, number, number, number, string];

function art(width: number, height: number, blocks: readonly Block[], ground = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.fillStyle = ground;
  context.fillRect(0, 0, width, height);
  for (const [x, y, w, h, color] of blocks) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }
  return canvas;
}

function words(
  canvas: HTMLCanvasElement,
  text: string,
  x: number,
  y: number,
  size: number,
  color = "#111111",
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.font = `${String(size)}px Arial`;
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function asFile(canvas: HTMLCanvasElement, name: string, type = "image/png"): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], name, { type }));
      else reject(new Error("No file"));
    }, type);
  });
}

describe("finding a logo", () => {
  const flyer = art(800, 600, [
    [100, 100, 120, 60, "#123456"],
    [228, 110, 30, 40, "#123456"],
    [400, 100, 100, 60, "#a01010"],
  ]);

  it("takes the parts of one logo together, and not the neighbor", () => {
    const found = detectLogo(flyer, 150, 130);
    if (hasFailed(found)) throw new Error(found.error);
    expect(found.x).toBeLessThanOrEqual(100);
    expect(found.x + found.w).toBeGreaterThanOrEqual(258);
    expect(found.x + found.w).toBeLessThan(400);
    expect(found.bg).toBe("rgb(255,255,255)");
  });

  it("looks a bit around the point", () => {
    expect(hasFailed(detectLogo(flyer, 95, 130))).toBe(false);
  });

  it("says when there is nothing, or something too big", () => {
    expect(detectLogo(flyer, 700, 500)).toEqual({ error: "nada" });
    expect(detectLogo(art(10, 10, []), 5, 5)).toEqual({ error: "nada" });
    const big = art(2000, 1000, [[0, 480, 2000, 40, "#123456"]]);
    expect(detectLogo(big, 500, 500)).toEqual({ error: "grande" });
    const speck = art(800, 600, [[300, 300, 2, 2, "#123456"]]);
    expect(detectLogo(speck, 300, 300)).toEqual({ error: "nada" });
  });

  it("the most repeated color is the background", () => {
    const data = pixelsOf(art(40, 40, [[0, 0, 10, 10, "#000000"]], "#fafafa"), 0, 0, 40, 40);
    expect(backgroundOf(data)).toEqual([250, 250, 250]);
    expect(backgroundOf(new Uint8ClampedArray(0))).toEqual([255, 255, 255]);
    expect(rgbText([1, 2, 3])).toBe("rgb(1,2,3)");
    expect(rgbOf("rgb(1,2,3)")).toEqual([1, 2, 3]);
    expect(rgbOf("")).toEqual([0, 0, 0]);
  });

  it("a box marked by hand knows if it has something, and if it cuts something", () => {
    const free = markedPlace(flyer, 600, 300, 100, 100);
    expect(free).toMatchObject({ vacio: true, corta: false, manual: true });
    const onLogo = markedPlace(flyer, 90, 90, 140, 80);
    expect(onLogo?.vacio).toBe(false);
    const cutting = markedPlace(flyer, 60, 90, 80, 80);
    expect(cutting?.corta).toBe(true);
    expect(markedPlace(flyer, 10, 10, 3, 3)).toBeNull();
    expect(roundedBox({ x: 1.4, y: 1.6, w: 0.1, h: 2.2 })).toEqual({ x: 1, y: 2, w: 1, h: 2 });
  });
});

describe("where a new logo goes", () => {
  const flyer = art(800, 600, [[300, 300, 100, 40, "#123456"]]);

  it("fits without stretching", () => {
    const place = { x: 0, y: 0, w: 100, h: 50, bg: "rgb(255,255,255)" };
    expect(destinationOf(place, 4)).toMatchObject({ tw: 100, th: 25 });
    expect(destinationOf(place, 1)).toMatchObject({ tw: 50, th: 50 });
  });

  it("a square logo grows while it has room, up to the same surface", () => {
    const found = detectLogo(flyer, 350, 320);
    if (hasFailed(found)) throw new Error(found.error);
    const { tw, th } = destinationOf(found, 1);
    expect(tw).toBeCloseTo(th, 5);
    expect(tw).toBeGreaterThan(found.h);
    expect(tw * th).toBeLessThanOrEqual(found.w * found.h * 1.1);
  });
});

describe("a text on the flyer", () => {
  it("counts its lines and takes its color", () => {
    const flyer = art(600, 300, []);
    words(flyer, "Martes", 100, 100, 24);
    words(flyer, "y jueves", 100, 140, 24);
    const place = { x: 90, y: 70, w: 200, h: 90, bg: "rgb(255,255,255)" };
    expect(countLines(flyer, place)).toBe(2);
    expect(printedColor(flyer, place)).toMatch(/^#[01]/);
    expect(printedTextColor(flyer, place)).toMatch(/^#[01]/);
    const empty = { x: 400, y: 200, w: 50, h: 50, bg: "rgb(255,255,255)" };
    expect(countLines(flyer, empty)).toBe(1);
    expect(printedColor(flyer, empty)).toBeNull();
    expect(printedTextColor(flyer, empty)).toBeNull();
  });

  it("measures itself and keeps its center", () => {
    const base: PlacedChange = {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      bg: "",
      t: "",
      ox: 0,
      oy: 0,
      ow: 1,
      oh: 1,
      tipo: "txt",
      texto: "Lunes\ny martes",
      fs: 20,
      tx: 100,
      ty: 100,
      tw: 50,
      th: 50,
    };
    const result = measured(base);
    expect((result.tx ?? 0) + (result.tw ?? 0) / 2).toBeCloseTo(125, 5);
    expect(result.th).toBe(Math.ceil(2 * 20 * 1.18));
    expect(measured(base, { x: 10, y: 10 }).ty).toBeCloseTo(10 - (result.th ?? 0) / 2, 5);
    expect(widthOfLines("a\nmuy largo", 500, 20)).toBeGreaterThan(widthOfLines("a", null, 20));
    const nothing: PlacedChange = { ...base, tipo: "txt" };
    Reflect.deleteProperty(nothing, "texto");
    Reflect.deleteProperty(nothing, "fs");
    expect(measured(nothing).tw).toBe(4);
  });
});

describe("the days of a supermarket", () => {
  const FLYER_WIDTH = 1240;
  const logoPlace = { x: 200, y: 100, w: 150, h: 60, bg: "rgb(255,255,255)" };

  function withDays(text: string) {
    const flyer = art(FLYER_WIDTH, 700, [[200, 100, 150, 60, "#123456"]]);
    if (text) words(flyer, text, 225, 188, 20);
    return flyer;
  }

  it("are found below the logo, as a block centered under it", () => {
    const flyer = withDays("Martes");
    const { logo, text, lines } = splitDays(flyer, logoPlace);
    expect(logo).toBe(logoPlace);
    expect(text?.y).toBeGreaterThan(160);
    expect(lines).toHaveLength(1);
    expect(printedFontSize(flyer, lines, logoPlace.bg)).toBeGreaterThan(15);
    expect(printedFontSize(flyer, [], logoPlace.bg)).toBe(0);
  });

  it("are not found when there are none, or they are from the neighbor", () => {
    expect(splitDays(withDays(""), logoPlace).text).toBeNull();
    const neighbor = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [600, 170, 80, 20, "#111111"],
    ]);
    expect(splitDays(neighbor, logoPlace).text).toBeNull();
    const nextRow = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [200, 190, 150, 80, "#111111"],
    ]);
    expect(splitDays(nextRow, logoPlace).text).toBeNull();
  });

  it("never breaks on a picture it cannot read", () => {
    const broken = art(FLYER_WIDTH, 700, []);
    vi.spyOn(CanvasRenderingContext2D.prototype, "drawImage").mockImplementationOnce(() => {
      throw new Error("Tainted");
    });
    expect(splitDays(broken, logoPlace)).toEqual({ logo: logoPlace, text: null, lines: [] });
    vi.restoreAllMocks();
  });

  it("does not take a speck, or what is far away, or a third line apart", () => {
    const speck = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [270, 170, 4, 3, "#111111"],
    ]);
    expect(splitDays(speck, logoPlace).text).toBeNull();
    const far = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [240, 220, 70, 14, "#111111"],
    ]);
    expect(splitDays(far, logoPlace).text).toBeNull();
    const apart = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [240, 170, 70, 14, "#111111"],
      [240, 230, 70, 14, "#111111"],
    ]);
    expect(splitDays(apart, logoPlace).lines).toHaveLength(1);
    const tooMany = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [240, 170, 70, 18, "#111111"],
      [240, 195, 70, 18, "#111111"],
      [240, 220, 70, 18, "#111111"],
      [240, 245, 70, 18, "#111111"],
    ]);
    expect(splitDays(tooMany, logoPlace).lines.length).toBeLessThan(4);
    const dotted = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 60, "#123456"],
      [240, 170, 4, 3, "#111111"],
      [240, 175, 70, 14, "#111111"],
    ]);
    expect(splitDays(dotted, logoPlace).text?.y).toBeGreaterThanOrEqual(170);
  });

  it("at the edge of the picture there is no room to look", () => {
    const flyer = art(FLYER_WIDTH, 170, [[200, 100, 150, 60, "#123456"]]);
    expect(splitDays(flyer, logoPlace).text).toBeNull();
  });

  it("two lines are one text, and a very tall box is split", () => {
    const flyer = withDays("Martes");
    words(flyer, "jueves", 225, 212, 20);
    expect(splitDays(flyer, logoPlace).lines).toHaveLength(2);
    const tall = art(FLYER_WIDTH, 700, [
      [200, 100, 150, 100, "#123456"],
      [240, 215, 70, 16, "#111111"],
    ]);
    const box = { x: 200, y: 100, w: 150, h: 135, bg: "rgb(255,255,255)", manual: true };
    const split = splitDays(tall, box);
    expect(split.logo.h).toBeLessThan(box.h);
    expect(split.text?.y).toBeGreaterThanOrEqual(215);
    const solid = art(FLYER_WIDTH, 700, [[200, 100, 150, 135, "#123456"]]);
    expect(splitDays(solid, { ...box, manual: false }).text).toBeNull();
  });

  it("the logo weighs the same as the one it replaces, and does not step on the days", () => {
    const flyer = withDays("");
    const square = evenDestination(flyer, logoPlace, 1, null);
    expect(square.tw * square.th).toBeCloseTo(150 * 60, 0);
    const limited = evenDestination(flyer, logoPlace, 1, 150);
    expect(limited.ty + limited.th).toBeLessThanOrEqual(150.01);
    expect(unitOf(art(100, 100, []))).toBe(0.5);
  });

  it("go in two lines before making the letter smaller, with what was printed", () => {
    const flyer = withDays("Martes");
    const { text, lines } = splitDays(flyer, logoPlace);
    const short = daysLayout({ art: flyer, logoPlace, text, days: "Lunes", lines, center: 275 });
    expect(short.content.texto).toBe("Lunes");
    expect(short.top).toBe(text?.y);
    expect(short.cover.bg).toBe(logoPlace.bg);
    const long = daysLayout({
      art: flyer,
      logoPlace,
      text,
      days: "Lunes, miércoles, viernes, sábados y domingos",
      lines,
      center: 275,
    });
    expect(long.content.texto.split("\n")).toHaveLength(2);
    const noAnd = daysLayout({
      art: flyer,
      logoPlace,
      text,
      days: "Lunesmiercolesviernes sabadosdomingosferiados",
      lines,
      center: 275,
    });
    expect(noAnd.content.texto.split("\n")).toHaveLength(2);
    const huge = daysLayout({
      art: flyer,
      logoPlace,
      text,
      days: "Lunesmiercolesviernessabadosdomingosferiadosytodoslosotrosdias",
      lines,
      center: 275,
    });
    expect(huge.content.fs).toBeLessThan(short.content.fs);
  });

  it("with no text under the logo, they go below with a letter of their own", () => {
    const flyer = withDays("");
    const layout = daysLayout({
      art: flyer,
      logoPlace,
      text: null,
      days: "Martes",
      lines: [],
      center: 275,
    });
    expect(layout.content.color).toBe("#1A1A1A");
    expect(layout.top).toBe(168);
    expect(layout.cover.vacio).toBe(true);
    expect(layout.splitFromLines).toBe(false);
  });
});

describe("a logo from the PC", () => {
  it("refuses what is not a picture, or weighs too much", async () => {
    expect(await readLogoFile(new File(["hola"], "nota.txt", { type: "text/plain" }))).toBe(
      "formato",
    );
    const heavy = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    expect(await readLogoFile(heavy)).toBe("pesado");
    expect(await readLogoFile(new File(["no"], "a.png", { type: "image/png" }))).toBe("imagen");
    expect(uploadFailureText("formato")).toMatch(/PNG o JPG/);
    expect(uploadFailureText("pesado")).toMatch(/8 MB/);
    expect(uploadFailureText("imagen")).toMatch(/Probá con otra/);
  });

  it("keeps it with a key of its own, and its name without extension", async () => {
    const read = await readLogoFile(
      await asFile(art(100, 60, [[10, 10, 80, 40, "#123456"]]), "mi.png"),
    );
    if (typeof read === "string") throw new Error(read);
    expect(read.key).toMatch(/^pc:.+:mi\.png$/);
    expect(read.name).toBe("mi");
    expect(read.isWhite).toBe(false);
    expect(read.logo.width).toBe(80);
  });

  it("a huge picture goes down, and two keys are never the same", async () => {
    const file = await asFile(art(3000, 1500, [[100, 100, 2800, 1300, "#123456"]]), "a.png");
    const [first, second] = await Promise.all([readLogoFile(file), readLogoFile(file)]);
    if (typeof first === "string" || typeof second === "string") throw new Error("Not read");
    expect(Math.max(first.logo.width, first.logo.height)).toBeLessThanOrEqual(1200);
    expect(first.key).not.toBe(second.key);
  });

  it("says when it is almost all white", () => {
    expect(isAlmostWhite(art(50, 50, []))).toBe(true);
    expect(isAlmostWhite(art(50, 50, [], "#123456"))).toBe(false);
    expect(isAlmostWhite(art(2, 2, []))).toBe(false);
  });

  it("goes down by halves", async () => {
    const picture = new Image();
    picture.src = art(400, 400, [[0, 0, 400, 400, "#123456"]]).toDataURL();
    await picture.decode();
    const result = shrunk(picture, 90, 90);
    expect(result.width).toBe(90);
  });
});
