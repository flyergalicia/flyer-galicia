import { describe, expect, it } from "vitest";
import type { FlyerArt } from "@/shared/flyer-engine/index.ts";
import { findBenefitBox } from "./benefit-box.ts";

const PANEL = "rgb(205, 222, 240)";

/** A flyer with the benefit box: a panel of one color with a drawing on its left. */
function flyerWithBox({ width = 1240, drawing = true } = {}): HTMLCanvasElement {
  const scale = width / 1240;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(6457 * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = PANEL;
  context.fillRect(100 * scale, 2500 * scale, 1040 * scale, 300 * scale);
  if (drawing) {
    context.fillStyle = "#333333";
    context.fillRect(150 * scale, 2490 * scale, 301 * scale, 320 * scale);
  }
  return canvas;
}

function isArt(value: unknown): value is FlyerArt {
  return typeof value === "object";
}

describe("finding the benefit box on the picture", () => {
  it("finds the panel and the area of the text beside the drawing", () => {
    const box = findBenefitBox(flyerWithBox(), 2650);
    expect(box).toMatchObject({ left: 100, right: 1139, textoX0: 451, textoX1: 1139, cx: 795 });
    expect(box?.top).toBeCloseTo(2500, -1);
    expect(box?.bottom).toBeCloseTo(2800, -1);
    expect(box?.cy).toBeCloseTo(2650, -1);
  });

  it("finds it on a bigger picture too, in pixels of the flyer", () => {
    const box = findBenefitBox(flyerWithBox({ width: 2480 }), 2650);
    expect(box?.cx).toBeCloseTo(795, -1);
    expect(box?.top).toBeCloseTo(2500, -1);
  });

  it("a strip too short, or a panel with no room for the text, is not the box", () => {
    const short = document.createElement("canvas");
    short.width = 1240;
    short.height = 6457;
    const context = short.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1240, 6457);
    context.fillStyle = PANEL;
    context.fillRect(100, 2620, 1040, 60);
    expect(findBenefitBox(short, 2650)).toBeNull();
    context.fillRect(100, 2500, 200, 300);
    expect(findBenefitBox(short, 2650)).toBeNull();
  });

  it("with no panel, or with the probe far away, there is none; with no probe it looks at 40 %", () => {
    const blank = document.createElement("canvas");
    blank.width = 1240;
    blank.height = 6457;
    expect(findBenefitBox(blank, 2650)).toBeNull();
    expect(findBenefitBox(flyerWithBox(), 9000)).toBeNull();
    expect(findBenefitBox(flyerWithBox(), 0)?.cx).toBe(795);
  });

  it("a picture that cannot be read is no box", () => {
    const art: unknown = { width: 1240, height: 6457 };
    expect(isArt(art) && findBenefitBox(art, 2650)).toBeNull();
    const empty = document.createElement("canvas");
    empty.width = 1240;
    empty.height = 0;
    expect(findBenefitBox(empty, 10)).toBeNull();
  });
});
