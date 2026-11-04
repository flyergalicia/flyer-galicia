import { describe, expect, it, vi } from "vitest";
import { drawLogoChanges, paintLogoChanges } from "./logos.ts";
import { passOn, recordingContext } from "./testing/recording-context.ts";
import { NO_LOGOS, paintedCanvas, TEST_ART_KEY, testScene } from "./testing/test-scene.ts";
import { type LogoChange, type LogoSource } from "./types.ts";

const LOGO = paintedCanvas(10, 10, "#ff0000");

function change(overrides: Partial<LogoChange> = {}): LogoChange {
  return {
    x: 10,
    y: 20,
    w: 30,
    h: 40,
    bg: "#eeeeee",
    tx: 12,
    ty: 22,
    tw: 26,
    th: 36,
    img: "logo.png",
    ...overrides,
  };
}

function sourceWith(images: Record<string, CanvasImageSource> = { "logo.png": LOGO }) {
  return {
    imageFor: vi.fn<LogoSource["imageFor"]>((key) => images[key] ?? null),
    requestMissing: vi.fn<LogoSource["requestMissing"]>(),
    requestTextFont: vi.fn<LogoSource["requestTextFont"]>(),
  } satisfies LogoSource;
}

describe("drawLogoChanges", () => {
  it("covers the old logo and draws the new one", () => {
    const recording = recordingContext();
    const scene = testScene();
    drawLogoChanges(
      passOn(recording, scene),
      { empresa: "X", logos: [change()], logosSrc: TEST_ART_KEY },
      sourceWith(),
    );
    expect(recording.boxes).toEqual([{ x: 10, y: 20, width: 31, height: 41, color: "#eeeeee" }]);
    expect(recording.images).toEqual([[LOGO, 12, 22, 26, 36]]);
    expect(recording.ctx.imageSmoothingQuality).toBe("high");
  });

  it("only applies on the picture they were made on", () => {
    const recording = recordingContext();
    const logos = sourceWith();
    drawLogoChanges(
      passOn(recording, testScene()),
      { empresa: "X", logos: [change()], logosSrc: "https://flyers.invalid/otra.jpg" },
      logos,
    );
    drawLogoChanges(passOn(recording, testScene()), { empresa: "X", logos: [change()] }, logos);
    expect(recording.boxes).toEqual([]);
    expect(recording.images).toEqual([]);
    expect(logos.imageFor).not.toHaveBeenCalled();
  });

  it("does nothing with no changes", () => {
    const recording = recordingContext();
    drawLogoChanges(
      passOn(recording, testScene()),
      { empresa: "X", logosSrc: TEST_ART_KEY },
      NO_LOGOS,
    );
    drawLogoChanges(
      passOn(recording, testScene()),
      { empresa: "X", logos: [], logosSrc: TEST_ART_KEY },
      NO_LOGOS,
    );
    expect(recording.boxes).toEqual([]);
  });

  it("with more officers, what is below the cut goes down with the flyer", () => {
    const recording = recordingContext();
    const scene = testScene();
    const below = change({ y: 5400, ty: 5400, th: 10 });
    const above = change({ y: 100, ty: 100, th: 10 });
    drawLogoChanges(
      passOn(recording, scene, { extra: 130 }),
      { empresa: "X", logos: [above, below], logosSrc: TEST_ART_KEY },
      sourceWith(),
    );
    expect(recording.boxes.map(({ y }) => y)).toEqual([100, 5530]);
    expect(recording.images.map((args) => args[2])).toEqual([100, 5530]);
  });

  it("the cover and the logo are placed each by its own height around the cut", () => {
    const recording = recordingContext();
    const straddling = change({ y: 5300, ty: 5329, th: 10 });
    drawLogoChanges(
      passOn(recording, testScene(), { extra: 130 }),
      { empresa: "X", logos: [straddling], logosSrc: TEST_ART_KEY },
      sourceWith(),
    );
    expect(recording.boxes[0]?.y).toBe(5300);
    expect(recording.images[0]?.[2]).toBe(5459);
  });
});

function target(ctx: CanvasRenderingContext2D, scale = 1) {
  return {
    ctx,
    scale,
    art: paintedCanvas(10, 10),
    artKey: TEST_ART_KEY,
    cutAt: Infinity,
    extra: 0,
  };
}

describe("paintLogoChanges", () => {
  it("covers everything first and only then draws: a moved logo is not erased", () => {
    const calls: string[] = [];
    const recording = recordingContext();
    const original = recording.ctx;
    const ctx = new Proxy(original, {
      get(real, property) {
        const value: unknown = Reflect.get(real, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          if (property === "fillRect" || property === "drawImage") calls.push(property);
          return Reflect.apply(value, real, args);
        };
      },
      set: (real, property, value) => Reflect.set(real, property, value),
    });
    paintLogoChanges(target(ctx), [change(), change({ x: 100, tx: 100 })], sourceWith());
    expect(calls).toEqual(["fillRect", "fillRect", "drawImage", "drawImage"]);
  });

  it("a place left empty covers, and draws nothing with no box of its own", () => {
    const recording = recordingContext();
    const { tx: _tx, ty: _ty, tw: _tw, th: _th, ...empty } = change({ img: "" });
    paintLogoChanges(target(recording.ctx), [empty], sourceWith());
    expect(recording.boxes).toHaveLength(1);
    expect(recording.images).toHaveLength(0);
  });

  it("a logo that is not in memory is asked for, and leaves the original in its place", () => {
    const recording = recordingContext();
    const logos = sourceWith({});
    paintLogoChanges(target(recording.ctx), [change({ img: "falta.png" })], logos);
    expect(logos.requestMissing).toHaveBeenCalledWith("falta.png");
    expect(recording.boxes).toEqual([]);
    expect(recording.images).toEqual([]);
  });

  it("an empty place is only covered", () => {
    const recording = recordingContext();
    const { img: _img, ...empty } = change();
    paintLogoChanges(target(recording.ctx), [empty], NO_LOGOS);
    expect(recording.boxes).toHaveLength(1);
    expect(recording.images).toEqual([]);
  });

  it("a change with no box to cover only draws", () => {
    const recording = recordingContext();
    paintLogoChanges(target(recording.ctx), [change({ w: 0, h: 0 })], sourceWith());
    paintLogoChanges(target(recording.ctx), [change({ w: 10, h: 0 })], sourceWith());
    expect(recording.boxes).toEqual([]);
    expect(recording.images).toHaveLength(2);
  });

  it("scales, rounding each number its own way, and never draws with no size", () => {
    const recording = recordingContext();
    paintLogoChanges(
      target(recording.ctx, 0.5),
      [change({ x: 11, y: 21, w: 31, h: 41, tx: 13, ty: 23, tw: 1, th: 0.4 })],
      sourceWith(),
    );
    expect(recording.boxes[0]).toMatchObject({ x: 5, y: 10, width: 17, height: 22 });
    expect(recording.images[0]?.slice(1)).toEqual([7, 12, 1, 1]);
  });

  it("writes a text, centered and line by line, and asks for its font", () => {
    const recording = recordingContext();
    const logos = sourceWith();
    paintLogoChanges(
      target(recording.ctx),
      [
        change({
          tipo: "txt",
          texto: "Martes\ny jueves",
          fs: 20,
          peso: 700,
          color: "#123456",
          tx: 100,
          tw: 50,
          ty: 200,
          th: 40,
        }),
      ],
      logos,
    );
    expect(logos.requestTextFont).toHaveBeenCalled();
    expect(logos.imageFor).not.toHaveBeenCalled();
    expect(recording.boxes).toHaveLength(1);
    expect(recording.texts.map(({ text, x, y }) => [text, x, y])).toEqual([
      ["Martes", 125, 220 - 11.8],
      ["y jueves", 125, 220 + 11.8],
    ]);
    expect(recording.texts[0]).toMatchObject({
      color: "#123456",
      align: "center",
      baseline: "middle",
    });
    expect(recording.texts[0]?.font).toContain("bold 20px Figtree");
  });

  it("a text has its defaults", () => {
    const recording = recordingContext();
    paintLogoChanges(target(recording.ctx), [change({ tipo: "txt", fs: 20 })], NO_LOGOS);
    expect(recording.texts[0]).toMatchObject({ text: "", color: "#1a1a1a" });
    expect(recording.texts[0]?.font).toContain("500 20px");
    const noSize = recordingContext();
    paintLogoChanges(target(noSize.ctx), [change({ tipo: "txt", texto: "A" })], NO_LOGOS);
    expect(noSize.texts).toHaveLength(1);
  });
});
