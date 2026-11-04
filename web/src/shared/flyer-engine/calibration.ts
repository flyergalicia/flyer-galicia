// The default calibration and how a stored one is completed with it.
import {
  type BenefitLine,
  type Calibration,
  type OldBenefitPart,
  type RawBenefit,
  type RawCalibration,
} from "./types.ts";

const BENEFIT_LINE_DEFAULTS: BenefitLine = {
  t: "",
  x: 640,
  y: 2700,
  fs: 17,
  peso: 500,
  color: "#000000",
  align: "center",
  mw: 820,
};

const FUEL_BENEFIT_LINES: readonly Partial<BenefitLine>[] = [
  {
    t: "¡Beneficio exclusivo {nombre}!",
    x: 723,
    y: 2630,
    fs: 42,
    peso: 800,
    color: "#fa6400",
    mw: 800,
  },
  { t: "**25% de ahorro** en combustible", x: 723, y: 2675, fs: 42, peso: 500, mw: 800 },
  { t: "Los domingos", x: 723, y: 2735, fs: 21, peso: 700, mw: 800 },
  { t: "Tope de reintegro mensual {importe} (5)", x: 723, y: 2758, fs: 16.5, peso: 500, mw: 800 },
  { t: "Válido en todas las estaciones del país", x: 723, y: 2803, fs: 16, peso: 500, mw: 800 },
  { t: "Medio de pago: Tarjeta de débito física", x: 723, y: 2827, fs: 16, peso: 500, mw: 800 },
];

const BENEFIT_FIELD_LABELS = {
  importe: "Tope de reintegro mensual",
  importe2: "Segundo tope (si es distinto)",
};

const DEFAULT_CALIBRATION: Omit<Calibration, "recDe" | "cropH" | "benef"> & {
  benef: { color2: string; peso2: number };
} = {
  imgW: 1240,
  imgH: 6457,
  bottomMargin: 45,
  empresa: {
    xc: 620,
    yc: 725,
    lh: 52,
    mw: 1100,
    fs: 46,
    ex: 70,
    bg: "#f7f2ef",
    color: "#111111",
    peso: 700,
  },
  montos: {
    y: 1069,
    fs: 56,
    mh: 58,
    bg: "#f4e0d3",
    peso: 700,
    boxes: [
      { xc: 224, ew: 220, col: "#1d4070" },
      { xc: 493, ew: 215, col: "#1d4070" },
      { xc: 760, ew: 195, col: "#f5921e" },
      { xc: 1008, ew: 185, col: "#f5921e" },
    ],
  },
  cashback: {
    xc: 620,
    y: 1069,
    mw: 560,
    mh: 80,
    fs: 92,
    minFs: 28,
    col: "#fa6400",
    peso: 700,
    bg: "#f4e0d3",
  },
  contacto: {
    ex: 150,
    ey: 5330,
    ew: 940,
    ew3: 1140,
    eh: 130,
    bg: "#ffffff",
    y1: 5360,
    y2: 5390,
    y3: 5418,
    xSingle: 619,
    xLeft: 310,
    xRight: 930,
    fnBold: 24,
    frReg: 21,
    color: "#111",
    peso: 700,
    ewS: 1140,
    ehS: 172,
    sedeDy: 24,
    nomDy: 66,
    celDy: 96,
    mailDy: 124,
    fnSede: 21,
    colSede: "#111",
    titH: 64,
    titFs: 27,
    titPeso: 700,
    titColor: "#111",
  },
  legal: {
    x0: 39,
    yStart: 5595,
    yEnd: 6300,
    maxW: 1162,
    fs: 12,
    lh: 17,
    gap: 5,
    minFs: 7,
    minLh: 10,
    minGap: 3,
    color: "#222222",
    bg: "#ffffff",
  },
  benef: { color2: "#fa6400", peso2: 800 },
};

/** Defaults, then what is stored; a null or absent value keeps the default. Shallow on purpose. */
export function mergeZone<T extends object>(defaults: T, stored?: Readonly<Partial<T>> | null): T {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (value !== null && value !== undefined) Reflect.set(merged, key, value);
  }
  return merged;
}

function oldTitle(part: OldBenefitPart): Partial<BenefitLine> {
  return {
    t: `${part.pre ?? "¡Beneficio exclusivo "}{nombre}${part.post ?? "!"}`,
    x: part.x,
    y: part.y,
    ...(part.fs === undefined ? {} : { fs: part.fs }),
    peso: 800,
    ...(part.color === undefined ? {} : { color: part.color }),
    align: part.align || "left",
    mw: part.mw,
  };
}

function oldCap(part: OldBenefitPart): Partial<BenefitLine> {
  return {
    t: `${part.pre ?? "Tope de reintegro mensual "}{importe}${part.post ?? ""}`,
    x: part.x,
    y: part.y,
    fs: 16.5,
    peso: 500,
    ...(part.color === undefined ? {} : { color: part.color }),
    align: part.align || "center",
    mw: part.mw,
  };
}

function storedBenefitLines(benefit: RawBenefit): readonly Partial<BenefitLine>[] {
  if (Array.isArray(benefit.lineas) && benefit.lineas.length > 0) return benefit.lineas;
  if (!benefit.titulo && !benefit.tope) return FUEL_BENEFIT_LINES;
  return [
    ...(benefit.titulo ? [oldTitle(benefit.titulo)] : []),
    ...(benefit.tope ? [oldCap(benefit.tope)] : []),
  ];
}

function benefitLines(benefit: RawBenefit): BenefitLine[] {
  return storedBenefitLines(benefit).map((line) => {
    const merged = mergeZone(BENEFIT_LINE_DEFAULTS, line);
    if (!(merged.fs > 0)) merged.fs = BENEFIT_LINE_DEFAULTS.fs;
    if (!(merged.peso >= 100)) merged.peso = BENEFIT_LINE_DEFAULTS.peso;
    return merged;
  });
}

/** Completes a stored calibration. An old flyer with no calibration gets the default one. */
export function resolveCalibration(stored?: RawCalibration | null): Calibration {
  const defaults = DEFAULT_CALIBRATION;
  const raw = stored ?? {};
  const benefit = raw.benef ?? {};
  return {
    imgW: raw.imgW || defaults.imgW,
    imgH: raw.imgH || defaults.imgH,
    recDe: raw.recDe || 0,
    cropH: raw.cropH || 0,
    bottomMargin: raw.bottomMargin ?? defaults.bottomMargin,
    empresa: mergeZone(defaults.empresa, raw.empresa),
    montos: mergeZone(defaults.montos, raw.montos),
    cashback: mergeZone(defaults.cashback, raw.cashback),
    contacto: mergeZone(defaults.contacto, raw.contacto),
    legal: mergeZone(defaults.legal, raw.legal),
    benef: {
      color2: benefit.color2 || defaults.benef.color2,
      peso2: benefit.peso2 || defaults.benef.peso2,
      lineas: benefitLines(benefit),
      campos: mergeZone<Readonly<Record<string, string>>>(BENEFIT_FIELD_LABELS, benefit.campos),
    },
  };
}
