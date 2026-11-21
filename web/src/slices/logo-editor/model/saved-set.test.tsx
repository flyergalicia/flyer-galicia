import { describe, expect, it } from "vitest";
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import type { PlacedChange } from "./change.ts";
import {
  changeKey,
  doneText,
  dotsOf,
  finalText,
  hintOf,
  isAtTheEnd,
  itemNow,
  NO_COUNTS,
  orderOf,
  placeNow,
  type PlacementView,
  sureLeft,
} from "./placement-model.ts";
import {
  clipped,
  drawingsOf,
  drawingsOnce,
  isTrustworthy,
  locateItems,
  matchGroup,
} from "./saved-set-matching.ts";
import {
  armSavedSet,
  boundsOf,
  contextOf,
  groupsOf,
  promotionOfLogo,
  type SavedItem,
  type SavedLogo,
  type SavedSetData,
  summaryOf,
} from "./saved-set.ts";

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const LOGOS: readonly Box[] = [
  { x: 100, y: 200, w: 120, h: 60 },
  { x: 300, y: 200, w: 90, h: 60 },
  { x: 500, y: 210, w: 100, h: 40 },
  { x: 100, y: 500, w: 80, h: 80 },
];

function painted(boxes: readonly Box[], shift = 0): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas here");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 800, 1000);
  context.fillStyle = "#123456";
  for (const { x, y, w, h } of boxes) context.fillRect(x, y + shift, w, h);
  return canvas;
}

function promotion(fields: Partial<Promotion>): Promotion {
  return {
    id: 1,
    titulo: "A",
    subtitulo: "Indumentaria",
    imagen: "a.png",
    fecha_hasta: "2099-01-01",
    ...fields,
  };
}

function logoChange(fields: Partial<PlacedChange>): PlacedChange {
  return {
    x: 96,
    y: 196,
    w: 128,
    h: 68,
    bg: "#fff",
    img: "a.png",
    t: "A",
    ox: 100,
    oy: 200,
    ow: 120,
    oh: 60,
    tx: 100,
    ty: 200,
    tw: 120,
    th: 60,
    ...fields,
  };
}

function savedLogo(place: Box, fields: Partial<SavedLogo> = {}): SavedLogo {
  return {
    tipo: "logo",
    nombre: "Logo",
    img: "a.png",
    t: "A",
    lugar: place,
    dup: false,
    rel: { x: 0, y: 0, w: 1, h: 1 },
    esSuper: false,
    ...fields,
  };
}

function setOf(items: readonly SavedItem[], fields: Partial<SavedSetData> = {}): SavedSetData {
  return { v: 2, ancho: 800, alto: 1000, items, grupos: [], subidos: {}, ...fields };
}

function viewOf(fields: Partial<PlacementView>): PlacementView {
  return {
    data: setOf([]),
    name: "N",
    mode: "steps",
    isBusy: false,
    order: [],
    places: [],
    index: 0,
    art: "art",
    scale: 1,
    failedLogos: new Set(),
    before: new Set(),
    counts: NO_COUNTS,
    approx: [],
    skipped: 0,
    photos: [],
    done: [],
    used: [],
    firstPhoto: null,
    ...fields,
  };
}

describe("arming a set", () => {
  const art = painted(LOGOS);
  const boxes = drawingsOf(art);

  it("keeps loose logos with their relative place, and those of the flyer as moved", () => {
    const list = [
      logoChange({ tx: 110, ty: 210, tw: 60, th: 30 }),
      logoChange({ img: "orig:1,2,3,4", t: "Logo del flyer", ox: 300, oy: 200, ow: 90, oh: 60 }),
      logoChange({ t: "", img: "pc:1:b.png", ox: 500, oy: 210, ow: 100, oh: 40, dup: true }),
    ];
    const { items, grupos, v, ancho, alto } = armSavedSet({
      list,
      art,
      catalog: [],
      boxes,
      uploads: { "pc:1:b.png": "x" },
    });
    expect([v, ancho, alto]).toEqual([2, 800, 1000]);
    const [first, second, third] = items;
    if (first?.tipo !== "logo" || second?.tipo !== "logo" || third?.tipo !== "logo") {
      throw new Error("They are logos");
    }
    expect(first.rel.w).toBe(0.5);
    expect(first.rel.x).toBeCloseTo(10 / 120);
    expect(second).toMatchObject({ nombre: "Logo del flyer movido", mover: true });
    expect(third).toMatchObject({ nombre: "Logo", dup: true });
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.items).toEqual([0, 1]);
    expect(grupos[0]?.ctx?.length).toBeGreaterThan(0);
  });

  it("a supermarket with its days keeps conDias and not the text; any other text stays", () => {
    const catalog = [promotion({ imagen: "s.png", subtitulo: "Supermercados" })];
    const list = [
      logoChange({ img: "s.png", t: "Súper" }),
      logoChange({
        tipo: "txt",
        img: "",
        texto: "Lunes",
        t: "Lunes",
        ox: 100,
        oy: 265,
        ow: 120,
        oh: 20,
        tx: 110,
        ty: 265,
        tw: 100,
        th: 20,
      }),
      logoChange({
        tipo: "txt",
        img: "",
        texto: "Otro\ntexto",
        t: "Otro",
        fs: 20,
        peso: 700,
        color: "#000",
        vacio: true,
        ox: 500,
        oy: 800,
        ow: 100,
        oh: 30,
        tx: 500,
        ty: 800,
        tw: 100,
        th: 30,
      }),
      {
        x: 296,
        y: 496,
        w: 68,
        h: 68,
        bg: "#fff",
        img: "",
        t: "",
        ox: 300,
        oy: 500,
        ow: 60,
        oh: 60,
      },
    ];
    const { items } = armSavedSet({ list, art, catalog, boxes, uploads: {} });
    expect(items.map(({ tipo }) => tipo)).toEqual(["logo", "texto", "vacio"]);
    expect(items[0]).toMatchObject({ esSuper: true, conDias: true });
    expect(items[1]).toMatchObject({ nombre: "Texto «Otro texto»", vacio: true });
  });

  it("a strip goes with its brands of today, and if half are supermarkets it says so", () => {
    const catalog = [promotion({ imagen: "s.png", subtitulo: "Supermercados" })];
    const base = logoChange({
      img: "",
      t: "Franja",
      franja: "f1",
      franjaBase: true,
      franjaSel: [
        { img: "s.png", t: "S" },
        { img: "ya no", t: "X" },
      ],
      franjaCols: 2,
      franjaKt: 1.2,
      ox: 90,
      oy: 190,
      ow: 520,
      oh: 80,
    });
    const logo = logoChange({ img: "s.png", franja: "f1", w: 0, h: 0 });
    const days = logoChange({ tipo: "txt", img: "", franja: "f1", texto: "Lunes" });
    const loose = logoChange({ img: "b.png", t: "B", ox: 100, oy: 500, ow: 80, oh: 80 });
    const empty = logoChange({ img: "", franja: "f2", franjaBase: true, ox: 0, oy: 0 });
    const { items } = armSavedSet({
      list: [base, logo, days, loose, empty],
      art,
      catalog,
      boxes,
      uploads: {},
    });
    const [strip] = items;
    if (strip?.tipo !== "franja") throw new Error("It is a strip");
    expect(strip.nombre).toBe("Franja súper (1 marca)");
    expect(strip).toMatchObject({ cols: 2, kt: 1.2, conDias: true });
    expect(strip.sel).toEqual([{ img: "s.png", t: "S" }]);
    expect(strip.cajas.length).toBeGreaterThan(0);
    expect(items.map(({ tipo }) => tipo)).toEqual(["franja", "logo"]);
  });

  it("says what it holds, and takes the boxes nearest to a zone", () => {
    const place = { x: 0, y: 0, w: 1, h: 1 };
    const item = savedLogo(place);
    const empty = { tipo: "vacio", nombre: "", lugar: place } as const;
    expect(summaryOf([])).toBe("nada");
    expect(summaryOf([item])).toBe("1 logo");
    expect(summaryOf([item, item, empty, empty])).toBe("2 logos, 2 lugares vacíos");
    const near = contextOf({ x: 90, y: 190, w: 140, h: 80 }, 50, boxes);
    expect(near).toEqual([{ x: 100, y: 200, w: 120, h: 60 }]);
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([place, { x: 4, y: 5, w: 1, h: 1 }])).toEqual({ x: 0, y: 0, w: 5, h: 6 });
  });

  it("finds the promotion of a logo", () => {
    const one = promotion({ id: 1, imagen: "a.png", fecha_hasta: "2099-01-01" });
    const other = promotion({ id: 2, imagen: "a.png", fecha_hasta: "2099-06-01" });
    expect(promotionOfLogo([promotion({ imagen: "z" })], "a.png")).toBeNull();
    expect(promotionOfLogo([one, other], "a.png")).toBeTruthy();
  });

  it("groups what is near, and a copy is left apart", () => {
    const items = [
      savedLogo({ x: 0, y: 0, w: 50, h: 50 }),
      savedLogo({ x: 60, y: 0, w: 50, h: 50 }),
      savedLogo({ x: 700, y: 900, w: 10, h: 10 }),
      savedLogo({ x: 0, y: 0, w: 50, h: 50 }, { dup: true }),
    ];
    expect(groupsOf(items)).toEqual([[0, 1], [2]]);
  });
});

describe("looking for a group on the flyer", () => {
  it("detects the drawings once per picture, and leaves out specks and bands", () => {
    const art = painted([
      ...LOGOS,
      { x: 0, y: 700, w: 800, h: 40 },
      { x: 400, y: 900, w: 4, h: 4 },
    ]);
    const found = drawingsOf(art);
    expect(found).toHaveLength(4);
    expect(drawingsOnce(art)).toBe(drawingsOnce(art));
    expect(drawingsOf(document.createElement("canvas"))).toEqual([]);
  });

  it("finds where the same boxes went, and over the point touched", () => {
    const art = painted(LOGOS, 300);
    const match = matchGroup(LOGOS, drawingsOf(art));
    expect(match?.n).toBeGreaterThanOrEqual(3);
    expect(Math.abs((match?.dy ?? 0) - 300)).toBeLessThan(10);
    expect(matchGroup([], drawingsOf(art))).toBeNull();
    expect(matchGroup(LOGOS, [])).toBeNull();
    expect(matchGroup(LOGOS, drawingsOf(art), { x: 0, y: 0 })).toBeNull();
    const touched = matchGroup(LOGOS, drawingsOf(art), { x: 150, y: 530 });
    expect(touched?.n).toBeGreaterThanOrEqual(3);
  });

  it("trusts a big coincidence, and a small one only if it stayed near", () => {
    const base = { err: 0, far: 0, dx: 0, dy: 0 };
    expect(isTrustworthy(null, 1)).toBe(false);
    expect(isTrustworthy({ ...base, n: 3, total: 4 }, 1)).toBe(true);
    expect(isTrustworthy({ ...base, n: 2, total: 4 }, 1)).toBe(false);
    expect(isTrustworthy({ ...base, n: 2, total: 2 }, 1)).toBe(true);
    expect(isTrustworthy({ ...base, n: 2, total: 2, dx: 300 }, 1)).toBe(false);
    expect(isTrustworthy({ ...base, n: 1, total: 2 }, 1)).toBe(false);
  });

  it("keeps a box inside the picture", () => {
    const art = painted([]);
    expect(clipped(art, { x: -5, y: 2000, w: 5000, h: 1 })).toEqual({
      x: 0,
      y: 990,
      w: 800,
      h: 10,
    });
  });

  it("locates strips, groups, texts, copies and lone logos on the new model", () => {
    const art: FlyerArt = painted(LOGOS, 300);
    const drawings = drawingsOf(art);
    const data = setOf(
      [
        {
          tipo: "franja",
          nombre: "Franja",
          rect: { x: 90, y: 190, w: 520, h: 80 },
          sel: [{ img: "a.png", t: "A" }],
          cols: 0,
          kt: 1,
          conDias: false,
          n: 3,
          caja: null,
          cajas: LOGOS.slice(0, 3),
          ctx: [],
        },
        savedLogo(LOGOS[3] ?? LOGOS[0] ?? { x: 0, y: 0, w: 1, h: 1 }),
        { tipo: "vacio", nombre: "Lugar vacío", lugar: LOGOS[3] ?? { x: 0, y: 0, w: 1, h: 1 } },
        savedLogo({ x: 300, y: 50, w: 50, h: 50 }, { dup: true }),
        {
          tipo: "texto",
          nombre: "Texto",
          texto: "x",
          color: "#000",
          peso: 500,
          fs: 10,
          lugar: { x: 300, y: 50, w: 50, h: 50 },
          vacio: true,
          pos: { x: 300, y: 50 },
        },
      ],
      { grupos: [{ items: [1, 2], ctx: LOGOS }] },
    );
    const places = locateItems(data, art, drawings);
    expect(places[0]?.ok).toBe(true);
    expect(places[0]?.rect?.y).toBeGreaterThan(450);
    expect(places[1]?.ok).toBe(true);
    expect(places[1]?.det?.y).toBeGreaterThan(780);
    expect(places[3]?.ok).toBe(true);
    expect(places[4]).toMatchObject({ ok: false, det: { vacio: true } });
  });

  it("with nothing to go by they stay where they were, and are not sure", () => {
    const art: FlyerArt = painted([]);
    const lonely = setOf(
      [
        {
          tipo: "franja",
          nombre: "F",
          rect: { x: 90, y: 190, w: 520, h: 80 },
          sel: [],
          cols: 0,
          kt: 1,
          conDias: false,
          n: 0,
          caja: null,
          cajas: [],
          ctx: [],
        },
        savedLogo({ x: 100, y: 500, w: 80, h: 80 }),
        savedLogo({ x: 700, y: 700, w: 80, h: 80 }, { dup: true }),
      ],
      { ancho: 0 },
    );
    const places = locateItems(lonely, art, []);
    expect(places[0]).toMatchObject({ ok: false, rect: { x: 90, y: 190 } });
    expect(places[1]?.ok).toBe(false);
    expect(places[2]?.ok).toBe(true);
  });
});

describe("what the bar of the placement says", () => {
  it("orders strips first, then top to bottom, and texts last", () => {
    const place = { x: 0, y: 500, w: 1, h: 1 };
    const items: SavedItem[] = [
      {
        tipo: "texto",
        nombre: "",
        texto: "",
        color: "",
        peso: 0,
        fs: 1,
        lugar: { ...place, y: 1 },
        vacio: false,
        pos: { x: 0, y: 0 },
      },
      savedLogo(place),
      savedLogo({ ...place, y: 100 }),
      {
        tipo: "franja",
        nombre: "",
        rect: { ...place, y: 900 },
        sel: [],
        cols: 0,
        kt: 1,
        conDias: false,
        n: 0,
        caja: null,
        cajas: [],
        ctx: [],
      },
    ];
    expect(orderOf(items)).toEqual([3, 2, 1, 0]);
  });

  it("tells a change by what it is", () => {
    expect(changeKey(logoChange({ ox: 1.2 }))).toBe(changeKey(logoChange({ ox: 1.4 })));
    expect(changeKey(logoChange({ ox: 1 }))).not.toBe(changeKey(logoChange({ ox: 2 })));
    expect(changeKey(logoChange({ franjaBase: true, img: "" }))).toContain("|1|");
  });

  it("counts in the singular and in the plural", () => {
    expect(doneText(NO_COUNTS)).toBe("");
    expect(doneText({ franja: 2, logo: 1, vacio: 1, texto: 3 })).toBe(
      "2 franjas, 1 logo, 1 lugar vacío, 3 textos",
    );
    expect(doneText({ franja: 1, logo: 2, vacio: 2, texto: 1 })).toBe(
      "1 franja, 2 logos, 2 lugares vacíos, 1 texto",
    );
  });

  it("the last words say what was put and what to review", () => {
    const none = { expired: 0, outOfProvince: 0, province: "" };
    expect(finalText(viewOf({}), none)).toBe("Listo «N»: no se puso nada.");
    const text = finalText(
      viewOf({
        counts: { ...NO_COUNTS, logo: 1 },
        skipped: 2,
        approx: ["a", "b", "c"],
      }),
      { expired: 1, outOfProvince: 2, province: "Salta" },
    );
    expect(text).toBe(
      "Listo «N»: 1 logo. 2 salteados. 1 marca vencida (en rojo). 2 marcas sin promo en Salta (en amarillo). Revisá: a, b….",
    );
    expect(
      finalText(viewOf({ skipped: 1, approx: ["a"] }), {
        ...none,
        expired: 2,
        outOfProvince: 1,
        province: "S",
      }),
    ).toContain(
      "1 salteado. 2 marcas vencidas (en rojo). 1 marca sin promo en S (en amarillo). Revisá: a.",
    );
  });

  it("each kind of thing has its hint, sure or not", () => {
    const place = { x: 0, y: 0, w: 1, h: 1 };
    const strip: SavedItem = {
      tipo: "franja",
      nombre: "",
      rect: place,
      sel: [],
      cols: 0,
      kt: 1,
      conDias: false,
      n: 0,
      caja: null,
      cajas: [],
      ctx: [],
    };
    const empty: SavedItem = { tipo: "vacio", nombre: "", lugar: place };
    const text: SavedItem = {
      tipo: "texto",
      nombre: "",
      texto: "",
      color: "",
      peso: 0,
      fs: 1,
      lugar: place,
      vacio: false,
      pos: { x: 0, y: 0 },
    };
    expect(hintOf(strip, true)).toMatch(/franja correcta/);
    expect(hintOf(strip, false)).toMatch(/No la encontré/);
    expect(hintOf(empty, true)).toMatch(/cuál se saca/);
    expect(hintOf(empty, false)).toMatch(/No lo encontré/);
    expect(hintOf(text, true)).toMatch(/recuadro donde va/);
    expect(hintOf(savedLogo(place), true)).toMatch(/logo que querés reemplazar/);
    expect(hintOf(savedLogo(place), false)).toMatch(/No lo encontré/);
  });

  it("the dots say how each step is", () => {
    const place = { x: 0, y: 0, w: 1, h: 1 };
    const view = viewOf({
      data: setOf([
        savedLogo(place),
        savedLogo(place),
        savedLogo(place),
        savedLogo(place),
        savedLogo(place),
      ]),
      order: [0, 1, 2, 3, 4],
      places: [{ ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false }],
      index: 2,
      done: ["placed", "skipped"],
    });
    expect(dotsOf(view).map(({ state }) => state)).toEqual([
      "ok",
      "skipped",
      "now",
      "",
      "doubtful",
    ]);
    expect(dotsOf(view)[4]?.label).toMatch(/lo ubicamos juntos/);
    expect(sureLeft(view)).toBe(2);
    expect(itemNow(view)).toBeTruthy();
    expect(placeNow(view)).toEqual({ ok: true });
    expect(isAtTheEnd(view)).toBe(false);
    expect(isAtTheEnd({ ...view, index: 5 })).toBe(true);
    expect(itemNow({ ...view, index: 5 })).toBeUndefined();
  });
});
