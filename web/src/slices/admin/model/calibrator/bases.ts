// Starting points of the calibrator. The one of the factory is that of Flyer Galicia; a flyer of the
// family "Pasá tu sueldo" has another geometry (taller, the name higher, the amounts in a 2×2 grid),
// measured on the real PDF rasterized at 1240 px. Officers and legal text are anchored at the bottom,
// so each base carries its own height of reference. The benefit box is not here: that is a template.
import { factoryCalibration, mergeZone } from "@/shared/flyer-engine/index.ts";
import type { CalibratorCalibration } from "./calibration.ts";

export interface CalibrationBase {
  readonly id: string;
  readonly nombre: string;
  /** Null: the calibration of the factory. */
  readonly cfg: Readonly<Record<string, unknown>> | null;
}

const SALARY_COMPANY = { xc: 620, yc: 658, lh: 46, mw: 1100, fs: 42, ex: 70 };
const SALARY_OFFICERS = { ex: 150, ew: 940, ew3: 1140, eh: 130 };
const SALARY_OFFICER_COLUMNS = { xSingle: 620, xLeft: 310, xRight: 930, fnBold: 25, frReg: 23 };

export const CALIBRATION_BASES: readonly CalibrationBase[] = [
  { id: "galicia", nombre: "Flyer Galicia (de fábrica)", cfg: null },
  {
    id: "sueldo",
    nombre: "Pasá tu sueldo: combustible",
    cfg: {
      imgH: 7382,
      empresa: SALARY_COMPANY,
      // The boxes cover little on purpose: above each amount there is printed text, and the color of
      // the background is sampled from there.
      montos: {
        y: 824,
        fs: 46,
        mh: 46,
        boxes: [
          { xc: 626, ew: 240, col: "#1d4070" },
          { xc: 890, ew: 240, col: "#1d4070" },
          { xc: 626, ew: 240, y: 905, col: "#f5921e" },
          { xc: 890, ew: 240, y: 905, col: "#f5921e" },
        ],
      },
      contacto: {
        ...SALARY_OFFICERS,
        ey: 6107,
        y1: 6137,
        y2: 6167,
        y3: 6196,
        ...SALARY_OFFICER_COLUMNS,
      },
      legal: { x0: 79, yStart: 6350, yEnd: 7360, maxW: 1085, fs: 12, lh: 16 },
    },
  },
  // The one of the two categories is the same model, but taller and a few pixels lower and further
  // right: that is why it is a base of its own.
  {
    id: "sueldo2",
    nombre: "Pasá tu sueldo: súper + combustible",
    cfg: {
      imgH: 7711,
      empresa: SALARY_COMPANY,
      montos: {
        y: 839,
        fs: 46,
        mh: 46,
        boxes: [
          { xc: 651, ew: 240, col: "#1d4070" },
          { xc: 915, ew: 240, col: "#1d4070" },
          { xc: 651, ew: 240, y: 920, col: "#f5921e" },
          { xc: 915, ew: 240, y: 920, col: "#f5921e" },
        ],
      },
      contacto: {
        ...SALARY_OFFICERS,
        ey: 6157,
        y1: 6187,
        y2: 6216,
        y3: 6245,
        ...SALARY_OFFICER_COLUMNS,
      },
      legal: { x0: 79, yStart: 6410, yEnd: 7690, maxW: 1085, fs: 12, lh: 16 },
    },
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Puts the zones a base knows on the calibration being edited; the rest stays as it was. Always a
 * copy of the base: moving a box afterwards must not move it on the base for the next flyer. Nothing
 * is saved until "Guardar y activar", so closing undoes it.
 */
export function applyBase(cfg: CalibratorCalibration, base: CalibrationBase): void {
  const copy: Record<string, unknown> = structuredClone(base.cfg ?? factoryCalibration());
  for (const [key, value] of Object.entries(copy)) {
    const target = cfg[key];
    cfg[key] = isPlainObject(value) ? mergeZone(isPlainObject(target) ? target : {}, value) : value;
  }
}
