// The benefit box of "Flyer Rubros", line by line, as each category of flyer has it. They were measured
// on the real PDF (1240 px wide); the administrator chooses one in the calibrator and adjusts it there.
// The one of fuel lives in the engine: a calibration with no lines of its own draws it.
import { type BenefitLine, FUEL_BENEFIT_LINES } from "@/shared/flyer-engine/index.ts";

export interface BenefitTemplate {
  readonly nombre: string;
  /** Its positions were measured beside text already printed on the art: it is not centered again. */
  readonly fijo?: boolean;
  /** The labels of the two caps on the form. */
  readonly campos?: Readonly<Record<string, string>>;
  readonly lineas: readonly Partial<BenefitLine>[];
}

const CENTERED = { color: "#000000", align: "center" } as const;
const LEFT = { color: "#000000", align: "left" } as const;
const BOTH_CAPS = { importe: "Tope supermercado", importe2: "Tope combustible (si es distinto)" };

/** In the order the calibrator lists them: the first one is the one to fall back on. */
export const BENEFIT_TEMPLATES: Readonly<Record<string, BenefitTemplate>> = {
  combustible: { nombre: "Combustible", lineas: FUEL_BENEFIT_LINES },
  supermercado: {
    nombre: "Supermercado",
    lineas: [
      {
        t: "Beneficio exclusivo {nombre} !",
        x: 739,
        y: 2627,
        fs: 42,
        peso: 800,
        color: "#fa6400",
        align: "center",
        mw: 820,
      },
      {
        t: "**25% de ahorro** en Supermercados",
        x: 739,
        y: 2703,
        fs: 46,
        peso: 500,
        ...CENTERED,
        mw: 820,
      },
      { t: "Los Martes", x: 739, y: 2739, fs: 21, peso: 700, ...CENTERED, mw: 800 },
      {
        t: "Tope de reintegro mensual {importe} (10)",
        x: 739,
        y: 2764,
        fs: 16.5,
        peso: 500,
        ...CENTERED,
        mw: 800,
      },
      {
        t: "Medio de pago: Tarjeta de débito física",
        x: 739,
        y: 2788,
        fs: 16,
        peso: 500,
        ...CENTERED,
        mw: 800,
      },
    ],
  },
  adicional: {
    nombre: "Promo adicional: combustible",
    fijo: true,
    campos: { importe: "Tope de reintegro mensual" },
    lineas: [
      {
        t: "Además, **{nombre}** tiene una promo adicional.",
        x: 119,
        dx: -501,
        y: 2445,
        fs: 29,
        lh: 34,
        maxLin: 3,
        peso: 500,
        ...LEFT,
        mw: 320,
      },
      {
        t: "Tope de reintegro mensual {importe}",
        x: 673,
        dx: 53,
        y: 2498,
        fs: 21,
        peso: 500,
        ...LEFT,
        mw: 470,
      },
    ],
  },
  adicional2: {
    nombre: "Promo adicional: súper + combustible",
    fijo: true,
    campos: BOTH_CAPS,
    lineas: [
      {
        t: "Tope de reintegro mensual {importe2}",
        g: "t",
        x: 279,
        dx: -341,
        y: 2572,
        fs: 17,
        peso: 500,
        ...LEFT,
        mw: 390,
      },
      {
        t: "Tope de reintegro mensual {importe}",
        g: "t",
        x: 667,
        dx: 47,
        y: 2572,
        fs: 17,
        peso: 500,
        ...LEFT,
        mw: 390,
      },
    ],
  },
  ambos: {
    nombre: "Ambos (combustible y supermercado)",
    campos: BOTH_CAPS,
    lineas: [
      {
        t: "¡Beneficio exclusivo {nombre}!",
        x: 655,
        y: 2529,
        fs: 42,
        peso: 800,
        color: "#fa6400",
        align: "center",
        mw: 800,
      },
      {
        t: "**25% de ahorro** en combustible y supermercado",
        x: 655,
        y: 2573,
        fs: 33,
        peso: 500,
        ...CENTERED,
        mw: 780,
      },
      { t: "**25% de ahorro**", x: 303, dx: -352, y: 2633, fs: 37.5, peso: 800, ...LEFT, mw: 330 },
      { t: "en supermercados", x: 303, dx: -352, y: 2669, fs: 37.5, peso: 500, ...LEFT, mw: 330 },
      {
        t: "Los martes y domingos",
        x: 303,
        dx: -352,
        y: 2717,
        fs: 21,
        peso: 700,
        ...LEFT,
        mw: 330,
      },
      {
        t: "Tope de reintegro mensual {importe} (5)",
        x: 303,
        dx: -352,
        y: 2739,
        fs: 16.5,
        peso: 500,
        ...LEFT,
        mw: 330,
      },
      { t: "**25% de ahorro**", x: 679, dx: 24, y: 2633, fs: 37.5, peso: 800, ...LEFT, mw: 330 },
      { t: "en combustible", x: 679, dx: 24, y: 2669, fs: 37.5, peso: 500, ...LEFT, mw: 330 },
      { t: "Los martes y domingos", x: 679, dx: 24, y: 2717, fs: 21, peso: 700, ...LEFT, mw: 330 },
      {
        t: "Tope de reintegro mensual {importe2} (5)",
        x: 679,
        dx: 24,
        y: 2739,
        fs: 16.5,
        peso: 500,
        ...LEFT,
        mw: 330,
      },
    ],
  },
};
