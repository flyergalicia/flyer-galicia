import { describe, expect, it, vi } from "vitest";
import { drawLegal } from "./draw-legal.ts";
import { passOn, recordingContext, textsOf } from "./testing/recording-context.ts";
import { testScene } from "./testing/test-scene.ts";

const SHORT = { legal: { yStart: 1000, yEnd: 1100, maxW: 300 } };

function unique(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe("drawLegal", () => {
  it("draws nothing with no text", () => {
    const recording = recordingContext();
    expect(drawLegal(passOn(recording, testScene()), "   ")).toBe(0);
    expect(recording.boxes).toEqual([]);
  });

  it("covers its zone and writes token by token, with the color of the zone", () => {
    const recording = recordingContext();
    const bottom = drawLegal(passOn(recording, testScene()), "Hola mundo");
    expect(recording.boxes).toEqual([
      { x: 37, y: 5590, width: 1182, height: 735, color: "#ffffff" },
    ]);
    expect(textsOf(recording)).toEqual(["Hola ", "mundo"]);
    expect(recording.texts[0]).toMatchObject({
      x: 39,
      y: 5595,
      color: "#222222",
      align: "left",
      baseline: "top",
    });
    expect(recording.texts[1]?.x ?? 0).toBeGreaterThan(39);
    expect(bottom).toBe(5595 + 17);
  });

  it("wraps when a line is full, and never leaves one empty", () => {
    const recording = recordingContext();
    const scene = testScene({ calibration: { legal: { maxW: 60 } } });
    const bottom = drawLegal(passOn(recording, scene), "uno dos tres cuatro cinco seis");
    const rows = new Set(recording.texts.map(({ y }) => y));
    expect(rows.size).toBeGreaterThan(1);
    expect(bottom).toBe(5595 + rows.size * 17);
    expect(recording.texts[0]?.y).toBe(5595);
    const wide = recordingContext();
    drawLegal(passOn(wide, testScene({ calibration: { legal: { maxW: 1 } } })), "unaPalabra");
    expect(wide.texts).toHaveLength(1);
  });

  it("an empty paragraph is a gap, shorter than a line", () => {
    const recording = recordingContext();
    const bottom = drawLegal(passOn(recording, testScene()), "uno\n\ndos");
    expect(recording.texts.map(({ y }) => y)).toEqual([5595, 5595 + 17 + 5]);
    expect(bottom).toBe(5595 + 17 + 5 + 17);
  });

  it("marks in bold what goes in bold, with a fixed phrase before a written one", () => {
    const recording = recordingContext();
    drawLegal(passOn(recording, testScene()), "(6) Referidos. texto **tope** fin");
    const fonts = recording.texts.map(({ text, font }) => [text, font.startsWith("bold")]);
    expect(fonts).toEqual([
      ["(6) ", true],
      ["Referidos. ", true],
      ["texto ", false],
      ["tope ", true],
      ["fin", false],
    ]);
  });

  it("shrinks down when the text does not fit, and not below the minimums", () => {
    const words = Array.from({ length: 300 }, (_unused, index) => `palabra${String(index)}`).join(
      " ",
    );
    const recording = recordingContext();
    const scene = testScene({ calibration: SHORT });
    drawLegal(passOn(recording, scene), words);
    const size = Number.parseInt(recording.texts[0]?.font ?? "", 10);
    expect(size).toBe(7);
    const ys = [...new Set(recording.texts.map(({ y }) => y))];
    expect((ys[1] ?? 0) - (ys[0] ?? 0)).toBe(10);
  });

  it("scales the gaps too when it shrinks", () => {
    const recording = recordingContext();
    const scene = testScene({
      calibration: { legal: { yStart: 1000, yEnd: 1040, minFs: 2, minLh: 2, minGap: 1 } },
    });
    drawLegal(passOn(recording, scene), "uno\n\ndos\n\ntres\n\ncuatro");
    const ys = recording.texts.map(({ y }) => y);
    expect(ys.at(-1)! - 1000).toBeLessThan(40);
    expect(Number.parseInt(recording.texts[0]?.font ?? "", 10)).toBeLessThan(12);
  });

  it("follows the extra height of the flyer", () => {
    const recording = recordingContext();
    drawLegal(passOn(recording, testScene(), { extra: 130 }), "Hola");
    expect(recording.texts[0]?.y).toBe(5725);
  });

  it("does not measure or wrap again a text it knows", () => {
    const measure = vi.spyOn(CanvasRenderingContext2D.prototype, "measureText");
    const scene = testScene();
    const text = unique("texto");
    const recording = recordingContext();
    drawLegal(passOn(recording, scene), text);
    const first = measure.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    drawLegal(passOn(recording, scene), text);
    expect(measure.mock.calls.length).toBe(first);
    expect(recording.texts).toHaveLength(2);
    measure.mockRestore();
  });

  it("forgets past its limits instead of growing without end", () => {
    const measure = vi.spyOn(CanvasRenderingContext2D.prototype, "measureText");
    const recording = recordingContext();
    const scene = testScene();
    const first = unique("primero");
    drawLegal(passOn(recording, scene), first);
    for (let round = 0; round < 30; round += 1) {
      drawLegal(passOn(recording, scene), unique("otro"));
    }
    const words = Array.from({ length: 20_002 }, (_unused, index) => `w${String(index)}`).join(" ");
    drawLegal(passOn(recording, scene), words);
    measure.mockClear();
    drawLegal(passOn(recording, scene), first);
    expect(measure).toHaveBeenCalled();
    measure.mockRestore();
  });
});
