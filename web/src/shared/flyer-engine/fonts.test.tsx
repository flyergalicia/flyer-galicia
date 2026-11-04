import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBenefitFontLoader,
  createLogoTextFontLoader,
  fontWeightPrefix,
  setFont,
} from "./fonts.ts";
import { recordingContext } from "./testing/recording-context.ts";

function fontSet(load: FontFaceSet["load"]): FontFaceSet {
  return new Proxy(document.fonts, {
    get: (real, property) => (property === "load" ? load : Reflect.get(real, property)),
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  document.querySelector("#fg-benef-font")?.remove();
});

describe("fontWeightPrefix", () => {
  it.each([
    [null, "bold "],
    [undefined, "bold "],
    ["", "bold "],
    [600, "600 "],
    ["800", "800 "],
  ])("%s becomes %j", (weight, prefix) => {
    expect(fontWeightPrefix(weight)).toBe(prefix);
  });
});

describe("setFont", () => {
  it("writes the size with the base family, or with the one it is given", () => {
    const { ctx } = recordingContext();
    setFont(ctx, "700 ", 20);
    expect(ctx.font).toBe("bold 20px Arial, sans-serif");
    setFont(ctx, "", 10, "Figtree");
    expect(ctx.font).toBe("10px Figtree");
  });
});

describe("the benefit font", () => {
  it("asks for its weights and its sheet once, and draws again when it arrives", async () => {
    const load = vi.fn<FontFaceSet["load"]>(() => Promise.resolve([]));
    const onReady = vi.fn<() => void>();
    const request = createBenefitFontLoader(fontSet(load), onReady);
    request();
    request();
    await flush();
    expect(load).toHaveBeenCalledTimes(5);
    expect(load).toHaveBeenCalledWith('800 20px "Figtree"');
    expect(document.querySelectorAll("#fg-benef-font")).toHaveLength(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does not add its sheet twice", () => {
    const load = vi.fn<FontFaceSet["load"]>(() => Promise.resolve([]));
    createBenefitFontLoader(fontSet(load), () => undefined)();
    createBenefitFontLoader(fontSet(load), () => undefined)();
    expect(document.querySelectorAll("#fg-benef-font")).toHaveLength(1);
  });

  it("with no font, the flyer still comes out", async () => {
    const onReady = vi.fn<() => void>();
    createBenefitFontLoader(
      fontSet(() => Promise.reject(new Error("no"))),
      onReady,
    )();
    await flush();
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("the font of the texts of a logo", () => {
  it("asks for its two weights once", async () => {
    const load = vi.fn<FontFaceSet["load"]>(() => Promise.resolve([]));
    const onReady = vi.fn<() => void>();
    const request = createLogoTextFontLoader(fontSet(load), onReady);
    request();
    request();
    await flush();
    expect(load.mock.calls).toEqual([["500 40px Figtree"], ["700 40px Figtree"]]);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
