// The calibrator of one flyer: the calibration being adjusted, the zone chosen and the size of the
// picture. A drag changes the calibration many times a second: that only redraws the canvas. What the
// fields show changes with `version`, which React follows.
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import { type CalibrationBase, applyBase } from "./bases.ts";
import {
  addLine,
  benefitLines,
  centerLines,
  editLine,
  type LineField,
  linesOfTemplate,
  templateForName,
  templateOf,
} from "./benefit.ts";
import { findBenefitBox } from "./benefit-box.ts";
import { type CalibratorCalibration, finalHeightOf, mergeSaved } from "./calibration.ts";
import { moveZone } from "./moves.ts";
import { type PropertyField, resetProperties, setBoxColor, setProperty } from "./properties.ts";
import { type CalibratorFrame, type Grip, hasBenefit, zoneAt } from "./zones.ts";

export const CALIBRATOR_ZOOM_MAX = 1.3;
const ZOOM_MIN = 0.12;
const SCALE_WIDTH = 560;
const SCALE_ROOM = 70;
const FLYER_WIDTH = 1240;

export interface CalibratorSource {
  readonly image: FlyerArt;
  /** The name of the image in the bucket: its calibration is saved under it. */
  readonly name: string;
  readonly url: string;
  readonly option: number;
  readonly optionName: string;
  readonly tab: FlyerTab;
}

export interface CalibratorStore extends CalibratorSource {
  readonly cfg: CalibratorCalibration;
  readonly frame: () => CalibratorFrame;
  readonly chosen: () => string | null;
  /** Pixels of canvas per pixel of flyer, and the one it opened with. */
  readonly scale: () => number;
  readonly startScale: () => number;
  readonly legalText: () => string | null;
  readonly version: () => number;
  /**
   * When the fields of the chosen zone, the table of the lines and the height are written again
   * from the calibration: what is being typed in them is not rewritten on each letter.
   */
  readonly fieldsRevision: () => number;
  readonly linesRevision: () => number;
  readonly savedRevision: () => number;
  readonly subscribe: (listener: () => void) => () => void;
  /** Only the canvas: what changes it draws at once. A drag draws by itself, once per frame. */
  readonly onDraw: (listener: () => void) => () => void;
  readonly choose: (zone: string) => void;
  readonly grab: (x: number, y: number) => Grip | null;
  /** Moves a zone without drawing: whoever drags draws once per frame. */
  readonly drag: (grip: Grip, dx: number, dy: number) => void;
  readonly setProperty: (field: PropertyField, value: string) => void;
  readonly setBoxColor: (index: number, value: string) => void;
  readonly resetProperties: () => void;
  readonly applyBase: (base: CalibrationBase) => void;
  readonly setHeight: (typed: string) => void;
  /** Says whether the template replaces lines that are there. */
  readonly templateReplaces: () => boolean;
  /** Says how it went, in words. */
  readonly loadTemplate: (key: string) => string;
  /** Says how it went, in words. */
  readonly centerBenefit: () => string;
  readonly editLine: (index: number, field: LineField, value: string) => void;
  readonly addLine: () => void;
  readonly removeLine: (index: number) => void;
  readonly setScale: (scale: number) => void;
  /** What was saved for this image arrived: it goes over the calibration. */
  readonly takeSaved: (saved: unknown) => void;
  readonly setLegalText: (text: string | null) => void;
}

/** The size it opens with: the flyer takes 560 px, less on a narrow screen. */
export function startScaleFor(windowWidth: number): number {
  return Math.min(SCALE_WIDTH, windowWidth - SCALE_ROOM) / FLYER_WIDTH;
}

/** The next zoom: up to 130 % of the start (more slows the page), and back to it with 0. */
export function nextScale(scale: number, start: number, factor: number): number {
  if (!factor) return start;
  return Math.min(start * CALIBRATOR_ZOOM_MAX, Math.max(ZOOM_MIN, scale * factor));
}

export function zoomLabel(scale: number, start: number): string {
  return `${String(Math.round((scale / start) * 100))}%`;
}

function listenTo(set: Set<() => void>) {
  return (listener: () => void) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
}

export function createCalibratorStore(
  source: CalibratorSource,
  cfg: CalibratorCalibration,
  windowWidth: number,
): CalibratorStore {
  const listeners = new Set<() => void>();
  const drawers = new Set<() => void>();
  let version = 0;
  const revisions = { fields: 0, lines: 0, saved: 0 };
  let chosen: string | null = null;
  const start = startScaleFor(windowWidth);
  let scale = start;
  let legalText: string | null = null;

  const frame = (): CalibratorFrame => ({
    cfg,
    tab: source.tab,
    optionName: source.optionName,
    imageHeight: source.image.height,
  });
  const draw = () => {
    for (const drawer of drawers) drawer();
  };
  const changed = (rewrite: readonly ("fields" | "lines" | "saved")[] = []) => {
    version += 1;
    for (const what of rewrite) revisions[what] += 1;
    for (const listener of listeners) listener();
    draw();
  };
  const lines = () => benefitLines(frame());
  const center = () =>
    hasBenefit(source.tab)
      ? centerLines(lines(), (middle) => findBenefitBox(source.image, middle))
      : null;

  const store: CalibratorStore = {
    ...source,
    cfg,
    frame,
    chosen: () => chosen,
    scale: () => scale,
    startScale: () => start,
    legalText: () => legalText,
    version: () => version,
    fieldsRevision: () => revisions.fields,
    linesRevision: () => revisions.lines,
    savedRevision: () => revisions.saved,
    subscribe: listenTo(listeners),
    onDraw: listenTo(drawers),
    choose: (zone) => {
      chosen = chosen === zone ? null : zone;
      changed(["fields"]);
    },
    grab: (x, y) => {
      const grip = zoneAt(frame(), chosen, x, y);
      if (grip) {
        chosen = grip.zone;
        changed(["fields"]);
      }
      return grip;
    },
    drag: (grip, dx, dy) => {
      moveZone(frame(), grip, dx, dy);
    },
    setProperty: (field, value) => {
      if (chosen) setProperty(cfg, chosen, field, value);
      changed();
    },
    setBoxColor: (index, value) => {
      setBoxColor(cfg, index, value);
      changed();
    },
    resetProperties: () => {
      if (chosen) resetProperties(cfg, chosen);
      changed(["fields"]);
    },
    applyBase: (base) => {
      applyBase(cfg, base);
      changed(["fields"]);
    },
    setHeight: (typed) => {
      cfg.cropH = finalHeightOf(typed);
      changed();
    },
    templateReplaces: () => lines().length > 0,
    loadTemplate: (key) => {
      const { nombre, fijo } = templateOf(key);
      cfg.benef.lineas = linesOfTemplate(cfg, key);
      chosen = null;
      // Positions measured on the PDF: centering them would move them.
      const box = fijo ? null : center();
      changed(["fields", "lines"]);
      if (fijo) {
        return `Plantilla "${nombre}" cargada en su posición. Si hace falta, movela con «Cartel (todo)».`;
      }
      return box
        ? `Plantilla "${nombre}" cargada y centrada en el cuadro.`
        : `Plantilla "${nombre}" cargada. No encontré el cuadro en la imagen: movela con «Cartel (todo)».`;
    },
    centerBenefit: () => {
      if (!hasBenefit(source.tab) || lines().length === 0) return "";
      const box = center();
      changed(["fields", "lines"]);
      return box
        ? "Cartel centrado en el cuadro."
        : "No encontré el cuadro en la imagen: alineé las líneas entre sí. Movelas juntas con «Cartel (todo)».";
    },
    editLine: (index, field, value) => {
      const line = lines()[index];
      // A new text changes the name of its chip.
      if (line && editLine(line, field, value)) changed(field === "t" ? ["fields"] : []);
    },
    addLine: () => {
      addLine(lines());
      chosen = `bl${String(lines().length - 1)}`;
      changed(["fields", "lines"]);
    },
    removeLine: (index) => {
      const all = lines();
      if (!all[index]) return;
      all.splice(index, 1);
      if (chosen?.startsWith("bl") && chosen !== "blAll") chosen = null;
      changed(["fields", "lines"]);
    },
    setScale: (next) => {
      scale = next;
      changed();
    },
    takeSaved: (saved) => {
      mergeSaved(cfg, saved);
      changed(["fields", "lines", "saved"]);
    },
    setLegalText: (text) => {
      legalText = text;
      draw();
    },
  };
  return store;
}

/** It opens with the template of the option, centered on the box of the picture unless it is fixed. */
export function openBenefit(store: CalibratorStore): string {
  if (!hasBenefit(store.tab)) return "";
  const key = templateForName(store.optionName);
  benefitLines(store.frame());
  if (!templateOf(key).fijo) store.centerBenefit();
  return key;
}
