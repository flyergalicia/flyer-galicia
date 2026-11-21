// What the calibrator draws: the flyer with example data through the engine (the same drawing as a
// download), where it is cut, and the frame of each zone. With a zone chosen, only that one.
import {
  drawFlyer,
  finalHeight,
  type FlyerValues,
  NO_LOGO_SOURCE,
  sceneOf,
} from "@/shared/flyer-engine/index.ts";
import type { CalibratorStore } from "./calibrator-store.ts";
import { hasBenefit, zoneRects, zonesOf } from "./zones.ts";

const FLYER_WIDTH = 1240;
const SAMPLE_LEGAL =
  "Ejemplo de términos y condiciones del flyer. **Bonificación de comisiones** por 6 meses para nuevos clientes. Promociones sujetas a disponibilidad y a las bases y condiciones vigentes.\nPARA MÁS INFORMACIÓN O LIMITACIONES APLICABLES, CONSULTE EN: www.bancogalicia.com.ar";
const CUT_COLOR = "#f5921e";
const LABEL_FONT = "bold 11px Arial";
const HANDLE = 11;

/** Example data, so that each zone shows what it holds. */
export function sampleValues(store: CalibratorStore): FlyerValues {
  const benefit = hasBenefit(store.tab);
  return {
    empresa: "EMPRESA EJEMPLO S.A.",
    m1: "$100.000",
    m2: "$80.000",
    m3: "$50.000",
    m4: "$30.000",
    has1: true,
    nombre: "Nombre Apellido",
    celular: "11 1234 5678",
    email: "nombre.apellido@bancogalicia.com.ar",
    has2: true,
    nombre2: "Segundo Asesor",
    celular2: "11 8765 4321",
    email2: "segundo.asesor@bancogalicia.com.ar",
    legal: store.legalText() || SAMPLE_LEGAL,
    benef: benefit,
    benefNombre: benefit ? "EMPRESA EJEMPLO" : "",
    importe: benefit ? "$24.000" : "",
    importe2: benefit ? "$30.000" : "",
    cashUnico: store.tab === "sueldo",
  };
}

function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width === width && canvas.height === height) {
    canvas.getContext("2d")?.clearRect(0, 0, width, height);
    return;
  }
  // Giving it a size makes it new (that is costly): only when the size changed.
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${String(width)}px`;
  canvas.style.height = `${String(height)}px`;
}

/** Where the downloaded flyer ends: the rest goes gray, under an orange line. */
function drawCut(context: CanvasRenderingContext2D, cut: number, scale: number): void {
  const { width, height } = context.canvas;
  const y = Math.round(cut * scale);
  context.save();
  context.fillStyle = "rgba(120,120,120,.45)";
  context.fillRect(0, y, width, height - y);
  context.strokeStyle = CUT_COLOR;
  context.lineWidth = 2;
  context.setLineDash([9, 5]);
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(width, y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = CUT_COLOR;
  context.font = LABEL_FONT;
  context.textAlign = "right";
  context.textBaseline = "top";
  context.fillText(`corte ${String(Math.round(cut))}px`, width - 5, y + 4);
  context.restore();
}

/** The flyer as it comes out, with example data. Where it is cut, in pixels of the flyer; 0 if unknown. */
function drawExample(context: CanvasRenderingContext2D, store: CalibratorStore): number {
  try {
    const scene = sceneOf(store.image, store.name, store.cfg, store.tab === "sueldo");
    const drawn = drawFlyer(
      context,
      { scene, values: sampleValues(store), scale: store.scale() },
      NO_LOGO_SOURCE,
    );
    return finalHeight(scene, drawn);
  } catch {
    // A calibration that cannot be drawn still shows its zones, to be put right.
    return 0;
  }
}

function drawZones(context: CanvasRenderingContext2D, store: CalibratorStore): void {
  const scale = store.scale();
  const chosen = store.chosen();
  const rects = zoneRects(store.frame());
  for (const zone of zonesOf(store.frame())) {
    const rect = rects[zone.id];
    if (!rect || (chosen && chosen !== zone.id)) continue;
    const [x, y, w, h] = [rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale];
    const isChosen = chosen === zone.id;
    context.save();
    context.strokeStyle = zone.color;
    context.lineWidth = isChosen ? 2.5 : 1.5;
    context.setLineDash(isChosen ? [] : [6, 4]);
    context.strokeRect(x, y, w, h);
    context.setLineDash([]);
    context.fillStyle = zone.color;
    context.font = LABEL_FONT;
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(zone.label, x + 3, y > 14 ? y - 3 : y + 13);
    if (zone.id === "legal") context.fillRect(x + w - 6, y + h - 6, HANDLE, HANDLE);
    context.restore();
  }
}

export function drawCalibrator(canvas: HTMLCanvasElement, store: CalibratorStore): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = store.scale();
  fitCanvas(canvas, Math.round(FLYER_WIDTH * scale), Math.round(store.image.height * scale));
  const cut = drawExample(context, store);
  if (cut > 0 && cut < store.image.height) drawCut(context, cut, scale);
  drawZones(context, store);
}
