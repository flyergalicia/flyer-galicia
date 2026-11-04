import { afterEach, describe, expect, it, vi } from "vitest";
import { contextOf } from "./canvas.ts";
import { createLogoLibrary } from "./logo-library.ts";
import { paintedCanvas, pixelAt, TEST_ART_KEY } from "./testing/test-scene.ts";

function pngBlob(color = "#ff0000"): Promise<Blob> {
  const canvas = paintedCanvas(40, 40, "#ffffff");
  const ctx = contextOf(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(10, 10, 20, 20);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("no blob"));
    });
  });
}

function fonts(): FontFaceSet {
  const set = document.fonts;
  return new Proxy(set, {
    get: (real, property) =>
      property === "load"
        ? vi.fn<FontFaceSet["load"]>(() => Promise.resolve([]))
        : Reflect.get(real, property),
  });
}

function setup(fetchLogo: (key: string) => Promise<Blob> = () => pngBlob()) {
  const onArrival = vi.fn<() => void>();
  const fetcher = vi.fn<(key: string) => Promise<Blob>>(fetchLogo);
  let time = 1_000_000;
  const library = createLogoLibrary({
    fetchLogo: fetcher,
    onArrival,
    fonts: fonts(),
    now: () => time,
  });
  return {
    library,
    onArrival,
    fetcher,
    passTime: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

const ART = paintedCanvas(100, 100, "#ffffff");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetching a logo", () => {
  it("brings it clean, and keeps it", async () => {
    const { library, fetcher } = setup();
    const logo = await library.fetch("a.png");
    expect(logo.width).toBe(20);
    expect(library.imageFor("a.png", ART, TEST_ART_KEY)).toBe(logo);
    await expect(library.fetch("a.png")).resolves.toBe(logo);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("asked twice at the same time, it is one request", async () => {
    const { library, fetcher } = setup();
    const [first, second] = await Promise.all([library.fetch("a.png"), library.fetch("a.png")]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("what is not an image is an error, and can be tried again", async () => {
    const { library, fetcher } = setup(() =>
      Promise.resolve(new Blob(["nada"], { type: "image/png" })),
    );
    await expect(library.fetch("a.png")).rejects.toThrow("not an image");
    await expect(library.fetch("a.png")).rejects.toThrow("not an image");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("what drawing asks for", () => {
  it("a logo that is not in memory is null", () => {
    expect(setup().library.imageFor("a.png", ART, TEST_ART_KEY)).toBeNull();
  });

  it("a missing logo is brought, and whoever draws finds out", async () => {
    const { library, onArrival } = setup();
    library.requestMissing("a.png");
    await vi.waitFor(() => {
      expect(onArrival).toHaveBeenCalledTimes(1);
    });
    expect(library.imageFor("a.png", ART, TEST_ART_KEY)).not.toBeNull();
  });

  it("a logo that failed is asked for again only after a minute", async () => {
    const { library, onArrival, fetcher, passTime } = setup(() => Promise.reject(new Error("no")));
    library.requestMissing("a.png");
    await flush();
    library.requestMissing("a.png");
    passTime(59_000);
    library.requestMissing("a.png");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    passTime(2000);
    library.requestMissing("a.png");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onArrival).not.toHaveBeenCalled();
  });

  it("if it arrives later, the failure is forgotten", async () => {
    let fails = true;
    const { library, onArrival, fetcher, passTime } = setup(() =>
      fails ? Promise.reject(new Error("no")) : pngBlob(),
    );
    library.requestMissing("a.png");
    await flush();
    fails = false;
    passTime(61_000);
    library.requestMissing("a.png");
    await vi.waitFor(() => {
      expect(onArrival).toHaveBeenCalledTimes(1);
    });
    library.requestMissing("a.png");
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a logo uploaded from the PC or of the flyer itself is not asked for", async () => {
    const { library, fetcher } = setup();
    library.requestMissing("pc:abc:logo.png");
    library.requestMissing("orig:1,2,3,4");
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks for the font of the texts once", async () => {
    const { library, onArrival } = setup();
    library.requestTextFont();
    library.requestTextFont();
    await flush();
    expect(onArrival).toHaveBeenCalledTimes(1);
  });
});

describe("uploaded logos", () => {
  it("are kept in this page", () => {
    const { library } = setup();
    const image = paintedCanvas(5, 5);
    library.put("pc:1:a.png", image);
    expect(library.imageFor("pc:1:a.png", ART, TEST_ART_KEY)).toBe(image);
  });

  it("the ones that did not survive a reload are told, once each", () => {
    const { library } = setup();
    library.put("pc:1:a.png", paintedCanvas(5, 5));
    expect(
      library.missingUploads(["pc:1:a.png", "pc:2:b.png", "pc:2:b.png", "c.png", "orig:1,2,3,4"]),
    ).toEqual(["pc:2:b.png"]);
  });
});

function artWithLogo(): HTMLCanvasElement {
  const art = paintedCanvas(100, 100, "#ffffff");
  const ctx = contextOf(art);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(40, 40, 10, 10);
  return art;
}

describe("a logo of the flyer itself", () => {
  it("is cut from the picture and keeps its box, with no background", () => {
    const logo = setup().library.imageFor("orig:30,30,30,30", artWithLogo(), TEST_ART_KEY);
    if (!(logo instanceof HTMLCanvasElement)) throw new Error("Expected a canvas");
    expect({ width: logo.width, height: logo.height }).toEqual({ width: 30, height: 30 });
    expect(pixelAt(logo, 15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(logo, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("is remembered per picture", () => {
    const { library } = setup();
    const art = artWithLogo();
    const first = library.imageFor("orig:30,30,30,30", art, "a");
    expect(library.imageFor("orig:30,30,30,30", art, "a")).toBe(first);
    expect(library.imageFor("orig:30,30,30,30", art, "b")).not.toBe(first);
  });

  it("with a bad box, there is nothing", () => {
    const { library } = setup();
    expect(library.imageFor("orig:1,2,3", ART, TEST_ART_KEY)).toBeNull();
    expect(library.imageFor("orig:a,b,c,d", ART, TEST_ART_KEY)).toBeNull();
  });
});

describe("the defaults", () => {
  it("uses the fonts of the page and the clock", () => {
    const library = createLogoLibrary({
      fetchLogo: () => Promise.reject(new Error("no")),
      onArrival: () => undefined,
    });
    library.requestMissing("a.png");
    library.requestTextFont();
    expect(library.imageFor("a.png", ART, TEST_ART_KEY)).toBeNull();
  });
});
