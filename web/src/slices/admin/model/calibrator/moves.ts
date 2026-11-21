// How a drag (or an arrow of the keyboard) moves a zone, in pixels of the flyer.
import { amountBoxTop } from "@/shared/flyer-engine/index.ts";
import { benefitLines } from "./benefit.ts";
import type { CalibratorFrame, Grip } from "./zones.ts";

const SMALLEST_LEGAL_HEIGHT = 30;
const SMALLEST_LEGAL_WIDTH = 120;

function moveLines(frame: CalibratorFrame, zone: string, dx: number, dy: number): void {
  const lines = benefitLines(frame);
  if (zone === "blAll") {
    for (const line of lines) {
      line.x += dx;
      line.y += dy;
    }
    return;
  }
  const line = lines[Number(zone.slice(2))];
  if (!line) return;
  line.x += dx;
  line.y += dy;
  // A line of a column carries its own shift: «Centrar en el cuadro» keeps what was moved by hand.
  if (line.dx !== undefined && line.dx !== null) line.dx += dx;
}

/** "Montos (todo)" moves the whole block: a box with its own row goes down with the rest. */
function moveAmounts({ cfg }: CalibratorFrame, dx: number, dy: number): void {
  cfg.montos.y += dy;
  for (const box of cfg.montos.boxes) {
    box.xc += dx;
    if (box.y !== undefined && box.y !== null) box.y += dy;
  }
}

/** A single box: the first time it moves it gets a row of its own (until then it had that of all). */
function moveBox({ cfg }: CalibratorFrame, zone: string, dx: number, dy: number): void {
  const box = cfg.montos.boxes[Number(zone.slice(2))];
  if (!box) return;
  box.xc += dx;
  box.y = amountBoxTop(cfg.montos, box) + dy;
}

function moveOfficers({ cfg }: CalibratorFrame, dx: number, dy: number): void {
  const zone = cfg.contacto;
  zone.ey += dy;
  zone.y1 += dy;
  zone.y2 += dy;
  zone.y3 += dy;
  zone.xSingle += dx;
  zone.xLeft += dx;
  zone.xRight += dx;
}

function moveLegal({ cfg }: CalibratorFrame, handle: Grip["handle"], dx: number, dy: number) {
  const zone = cfg.legal;
  if (handle === "br") {
    zone.yEnd = Math.max(zone.yStart + SMALLEST_LEGAL_HEIGHT, zone.yEnd + dy);
    zone.maxW = Math.max(SMALLEST_LEGAL_WIDTH, zone.maxW + dx);
    return;
  }
  zone.x0 += dx;
  zone.yStart += dy;
  zone.yEnd += dy;
}

function moveSimple(frame: CalibratorFrame, zone: string, dx: number, dy: number): void {
  const { cfg } = frame;
  if (zone === "empresa") {
    cfg.empresa.yc += dy;
    cfg.empresa.xc += dx;
    cfg.empresa.ex += dx;
  } else if (zone === "cashback") {
    cfg.cashback.y += dy;
    cfg.cashback.xc += dx;
  } else if (zone === "asesores") {
    moveOfficers(frame, dx, dy);
  } else if (zone === "montos") {
    moveAmounts(frame, dx, dy);
  }
}

export function moveZone(frame: CalibratorFrame, { zone, handle }: Grip, dx: number, dy: number) {
  if (zone === "blAll" || /^bl\d+$/.test(zone)) moveLines(frame, zone, dx, dy);
  else if (/^mb\d+$/.test(zone)) moveBox(frame, zone, dx, dy);
  else if (zone === "legal") moveLegal(frame, handle, dx, dy);
  else moveSimple(frame, zone, dx, dy);
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Arrows move the chosen zone by one pixel; with Shift, by ten. Null if it is not an arrow. */
export function arrowStep(key: string, shift: boolean): readonly [number, number] | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = shift ? 10 : 1;
  return [direction[0] * step, direction[1] * step];
}
