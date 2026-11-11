import { describe, expect, it, vi } from "vitest";
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import { CALIBRATION_BASES } from "./bases.ts";
import { startingCalibration } from "./calibration.ts";
import {
  type CalibratorSource,
  createCalibratorStore,
  nextScale,
  openBenefit,
  startScaleFor,
  zoomLabel,
} from "./calibrator-store.ts";
import { propertiesOf } from "./properties.ts";

/** Here there is no canvas: only its size, which is all the calibrator reads of it without drawing. */
function isArt(value: unknown): value is FlyerArt {
  return typeof value === "object" && value !== null && "height" in value;
}

function picture(height = 6457): FlyerArt {
  const art: unknown = { width: 1240, height };
  if (!isArt(art)) throw new Error("Not a picture");
  return art;
}

function storeOf(source: Partial<CalibratorSource> = {}) {
  const store = createCalibratorStore(
    {
      image: picture(),
      name: "flyer_1_op9.jpg",
      url: "bucket/flyer_1_op9.jpg",
      option: 9,
      optionName: "Combustible",
      tab: "flyer",
      ...source,
    },
    startingCalibration(),
    1366,
  );
  const heard = vi.fn<() => void>();
  const drawn = vi.fn<() => void>();
  store.subscribe(heard);
  store.onDraw(drawn);
  return { store, heard, drawn };
}

describe("the zoom of the calibrator", () => {
  it("opens with the flyer at 560 px, less on a narrow window", () => {
    expect(startScaleFor(1366)).toBeCloseTo(560 / 1240);
    expect(startScaleFor(390)).toBeCloseTo(320 / 1240);
  });

  it("goes up to 130 % of the start, and back to it with 0", () => {
    const start = 0.5;
    expect(nextScale(start, start, 1.25)).toBe(0.625);
    expect(nextScale(0.625, start, 1.25)).toBe(0.65);
    expect(nextScale(0.65, start, 0)).toBe(0.5);
    expect(nextScale(0.13, start, 0.5)).toBe(0.12);
    expect(zoomLabel(0.65, start)).toBe("130%");
    expect(zoomLabel(0.5, start)).toBe("100%");
  });
});

describe("the calibrator of one flyer", () => {
  it("a chip chooses a zone, and again lets it go; the fields are written again", () => {
    const { store, heard, drawn } = storeOf();
    expect(store.chosen()).toBeNull();
    store.choose("legal");
    expect(store.chosen()).toBe("legal");
    expect(store.fieldsRevision()).toBe(1);
    store.choose("legal");
    expect(store.chosen()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(drawn).toHaveBeenCalledTimes(2);
    expect(store.version()).toBe(2);
  });

  it("a click on a zone chooses it; a drag moves it without drawing (that goes by frames)", () => {
    const { store, drawn } = storeOf();
    expect(store.grab(5, 5)).toBeNull();
    const grip = store.grab(620, 725);
    expect(grip).toEqual({ zone: "empresa", handle: null });
    expect(store.chosen()).toBe("empresa");
    drawn.mockClear();
    if (grip) store.drag(grip, 0, 40);
    expect(store.cfg.empresa.yc).toBe(765);
    expect(drawn).not.toHaveBeenCalled();
  });

  it("the fields of the chosen zone write the calibration, and Restablecer brings back the factory", () => {
    const { store } = storeOf();
    const [size] = propertiesOf("empresa")?.fields ?? [];
    if (!size) throw new Error("fields");
    store.setProperty(size, "60");
    expect(store.cfg.empresa.fs).toBe(46);
    store.choose("empresa");
    store.setProperty(size, "60");
    store.setBoxColor(0, "#000000");
    expect(store.cfg.empresa.fs).toBe(60);
    expect(store.cfg.montos.boxes[0]?.col).toBe("#000000");
    const before = store.fieldsRevision();
    store.resetProperties();
    expect(store.cfg.empresa.fs).toBe(46);
    expect(store.fieldsRevision()).toBe(before + 1);
    store.choose("empresa");
    store.resetProperties();
  });

  it("a base, the final height, the zoom and what was saved", () => {
    const { store, heard } = storeOf();
    const salary = CALIBRATION_BASES[1];
    if (!salary) throw new Error("base");
    store.applyBase(salary);
    expect(store.cfg.imgH).toBe(7382);
    store.setHeight("5000");
    expect(store.cfg.cropH).toBe(5000);
    store.setScale(0.3);
    expect(store.scale()).toBe(0.3);
    expect(store.startScale()).toBeCloseTo(560 / 1240);
    store.takeSaved({ empresa: { fs: 70 } });
    expect(store.cfg.empresa.fs).toBe(70);
    expect(store.savedRevision()).toBe(1);
    heard.mockClear();
    store.setLegalText("Legal de la opción");
    expect(store.legalText()).toBe("Legal de la opción");
    expect(heard).not.toHaveBeenCalled();
  });

  it("Flyer Galicia has no benefit: nothing to center or to open with", () => {
    const { store } = storeOf();
    expect(openBenefit(store)).toBe("");
    expect(store.centerBenefit()).toBe("");
    expect(store.cfg.benef.lineas).toBeNull();
  });
});

describe("the benefit of Flyer Rubros", () => {
  it("opens with the template of the option, centered (here there is no picture to find it on)", () => {
    const { store } = storeOf({ tab: "rubros", optionName: "Supermercado" });
    expect(openBenefit(store)).toBe("supermercado");
    const lines = store.cfg.benef.lineas ?? [];
    expect(lines).toHaveLength(5);
    expect(new Set(lines.map(({ x }) => x)).size).toBe(1);
    expect(store.linesRevision()).toBe(1);
  });

  it("a fixed template opens where it was measured", () => {
    const { store } = storeOf({ tab: "rubros", optionName: "Promo adicional" });
    expect(openBenefit(store)).toBe("adicional");
    expect((store.cfg.benef.lineas ?? []).map(({ x }) => x)).toEqual([119, 673]);
  });

  it("loading a template replaces the lines and says how it went", () => {
    const { store } = storeOf({ tab: "rubros" });
    expect(store.templateReplaces()).toBe(true);
    store.choose("bl0");
    expect(store.loadTemplate("adicional")).toBe(
      'Plantilla "Promo adicional: combustible" cargada en su posición. Si hace falta, movela con «Cartel (todo)».',
    );
    expect(store.chosen()).toBeNull();
    expect((store.cfg.benef.lineas ?? []).map(({ x }) => x)).toEqual([119, 673]);
    expect(store.loadTemplate("supermercado")).toBe(
      'Plantilla "Supermercado" cargada. No encontré el cuadro en la imagen: movela con «Cartel (todo)».',
    );
    expect(store.centerBenefit()).toBe(
      "No encontré el cuadro en la imagen: alineé las líneas entre sí. Movelas juntas con «Cartel (todo)».",
    );
  });

  it("lines are edited, added and taken out", () => {
    const { store } = storeOf({ tab: "rubros" });
    const revision = store.fieldsRevision();
    store.editLine(0, "t", "Hola");
    expect(store.cfg.benef.lineas?.[0]?.t).toBe("Hola");
    expect(store.fieldsRevision()).toBe(revision + 1);
    store.editLine(0, "fs", "30");
    expect(store.fieldsRevision()).toBe(revision + 1);
    store.editLine(0, "fs", "1");
    store.editLine(99, "fs", "30");
    expect(store.cfg.benef.lineas?.[0]?.fs).toBe(30);
    store.addLine();
    expect(store.chosen()).toBe("bl6");
    store.removeLine(6);
    expect(store.chosen()).toBeNull();
    store.choose("blAll");
    store.removeLine(0);
    expect(store.chosen()).toBe("blAll");
    store.removeLine(42);
    expect(store.cfg.benef.lineas).toHaveLength(5);
    for (let index = 0; index < 5; index += 1) store.removeLine(0);
    expect(store.templateReplaces()).toBe(false);
    expect(store.centerBenefit()).toBe("");
  });
});
