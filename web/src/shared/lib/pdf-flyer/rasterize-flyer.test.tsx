// A file becomes a flyer. pdf.js itself is put to work by `flyer-sections/pdf-to-image`, under the
// real security policy; here, what is done around it.
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeRender {
  readonly canvas: HTMLCanvasElement;
  readonly transform: readonly number[];
}

const pdf = vi.hoisted(() => {
  const state = {
    width: 620,
    height: 1000,
    renders: [] as FakeRender[],
    failBand: -1,
    failOpening: false,
    cleaned: 0,
    destroyed: 0,
    noReader: false,
  };
  return { state };
});

vi.mock("./pdf-reader.ts", () => ({
  VerifiedBinaries: Object,
  PDF_READER: {
    load: () => {
      if (pdf.state.noReader) return Promise.reject(new Error("No reader"));
      return Promise.resolve({
        getDocument: () => ({
          promise: pdf.state.failOpening
            ? Promise.reject(new Error("It is not a PDF"))
            : Promise.resolve({
                getPage: () =>
                  Promise.resolve({
                    getViewport: ({ scale }: { scale: number }) => ({
                      width: pdf.state.width * scale,
                      height: pdf.state.height * scale,
                    }),
                    render: (job: FakeRender) => {
                      pdf.state.renders.push(job);
                      const context = job.canvas.getContext("2d");
                      if (context) {
                        context.fillStyle = pdf.state.renders.length % 2 ? "#ff0000" : "#0000ff";
                        context.fillRect(0, 0, job.canvas.width, job.canvas.height);
                      }
                      const isBad = pdf.state.renders.length - 1 === pdf.state.failBand;
                      return {
                        promise: isBad ? Promise.reject(new Error("Band")) : Promise.resolve(),
                      };
                    },
                    cleanup: () => {
                      pdf.state.cleaned += 1;
                    },
                  }),
              }),
          destroy: () => {
            pdf.state.destroyed += 1;
            return Promise.resolve();
          },
        }),
      });
    },
  },
}));

const { BAND_HEIGHT, isPdfFile, rasterizeFlyer } = await import("./rasterize-flyer.ts");
type FlyerNotice = (text: string, durationMs?: number) => void;

function pdfFile(): File {
  return new File(["%PDF-1.4"], "flyer.pdf", { type: "application/pdf" });
}

function reset() {
  Object.assign(pdf.state, {
    width: 620,
    height: 1000,
    renders: [],
    failBand: -1,
    failOpening: false,
    cleaned: 0,
    destroyed: 0,
    noReader: false,
  });
}

afterEach(reset);

describe("a PDF", () => {
  it("is known by its name or by its type", () => {
    expect(isPdfFile({ name: "A.PDF", type: "" })).toBe(true);
    expect(isPdfFile({ name: "a", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "a.png", type: "image/png" })).toBe(false);
  });

  it("short, it comes out 1240 wide in one band, and lets everything go", async () => {
    const notify = vi.fn<FlyerNotice>();
    const result = await rasterizeFlyer(pdfFile(), notify);
    if (!result || result === "no-reader") throw new Error("It did not convert");
    expect(result.canvas.width).toBe(1240);
    expect(result.canvas.height).toBe(2000);
    expect(result.blob.type).toBe("image/jpeg");
    expect(pdf.state.renders).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith("Convirtiendo PDF…");
    expect(pdf.state.cleaned).toBe(1);
    expect(pdf.state.destroyed).toBe(1);
  });

  it("tall, it goes by bands and each one is drawn in its place", async () => {
    pdf.state.height = 3700;
    const notify = vi.fn<FlyerNotice>();
    const result = await rasterizeFlyer(pdfFile(), notify);
    if (!result || result === "no-reader") throw new Error("It did not convert");
    expect(result.canvas.height).toBe(7400);
    expect(pdf.state.renders.map(({ transform }) => transform[5])).toEqual([
      -0,
      -BAND_HEIGHT,
      -2 * BAND_HEIGHT,
    ]);
    expect(notify).toHaveBeenCalledWith("Convirtiendo PDF… parte 3 de 3 (puede tardar un poco)");
    const pixel = (y: number) =>
      Array.from(result.canvas.getContext("2d")?.getImageData(10, y, 1, 1).data ?? []);
    expect(pixel(10)).toEqual([255, 0, 0, 255]);
    expect(pixel(BAND_HEIGHT + 10)).toEqual([0, 0, 255, 255]);
    expect(pixel(2 * BAND_HEIGHT + 10)).toEqual([255, 0, 0, 255]);
  });

  it("two bands do not warn that it may take long", async () => {
    pdf.state.height = 2000;
    const notify = vi.fn<FlyerNotice>();
    await rasterizeFlyer(pdfFile(), notify);
    expect(notify).toHaveBeenCalledWith("Convirtiendo PDF… parte 2 de 2");
  });

  it("a band that fails does not stop the rest", async () => {
    pdf.state.height = 2000;
    pdf.state.failBand = 0;
    const result = await rasterizeFlyer(pdfFile(), () => undefined);
    if (!result || result === "no-reader") throw new Error("It did not convert");
    expect(pdf.state.renders).toHaveLength(2);
  });

  it("the height of the bands can be another, for comparing", async () => {
    pdf.state.height = 2000;
    await rasterizeFlyer(pdfFile(), () => undefined, 1600);
    expect(pdf.state.renders).toHaveLength(3);
  });

  it("too long, it says so instead of freezing the computer", async () => {
    pdf.state.height = 14_000;
    const notify = vi.fn<FlyerNotice>();
    expect(await rasterizeFlyer(pdfFile(), notify)).toBeNull();
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/demasiado largo/),
      expect.anything(),
    );
    expect(pdf.state.renders).toEqual([]);
    expect(pdf.state.destroyed).toBe(1);
  });

  it("one that cannot be opened says why", async () => {
    pdf.state.failOpening = true;
    const notify = vi.fn<FlyerNotice>();
    expect(await rasterizeFlyer(pdfFile(), notify)).toBeNull();
    expect(notify).toHaveBeenCalledWith("Error leyendo PDF: It is not a PDF");
  });

  it("without the reader it says so", async () => {
    pdf.state.noReader = true;
    const notify = vi.fn<FlyerNotice>();
    expect(await rasterizeFlyer(pdfFile(), notify)).toBe("no-reader");
    expect(notify).toHaveBeenCalledWith("No se pudo cargar el lector de PDF");
  });
});

function paintedPng(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 62;
  canvas.height = 31;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob ?? new Blob()], "a.png", { type: "image/png" }));
    });
  });
}

interface Conversion {
  withBands: (file: File, bandHeight: number) => Promise<HTMLCanvasElement | null>;
}

function isConversion(value: unknown): value is Conversion {
  return typeof value === "object" && value !== null && "withBands" in value;
}

function probe(): Conversion {
  const read: unknown = window["__flyerProbe"]?.["pdfConversion"]?.();
  if (isConversion(read)) return read;
  throw new Error("The probe is not there");
}

describe("the comparison with real PDF", () => {
  it("gets the canvas with those bands, and nothing if it could not", async () => {
    pdf.state.height = 2000;
    const canvas = await probe().withBands(pdfFile(), 1000);
    expect(canvas?.height).toBe(4000);
    expect(pdf.state.renders).toHaveLength(4);
    pdf.state.noReader = true;
    expect(await probe().withBands(pdfFile(), 1000)).toBeNull();
    pdf.state.noReader = false;
    pdf.state.failOpening = true;
    expect(await probe().withBands(pdfFile(), 1000)).toBeNull();
  });
});

describe("what cannot be done", () => {
  it("a picture that does not come out as JPEG is not a flyer", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((done) => {
      done(null);
    });
    expect(await rasterizeFlyer(pdfFile(), () => undefined)).toBeNull();
    vi.restoreAllMocks();
  });

  it("without a canvas, it says what it could", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const notify = vi.fn<FlyerNotice>();
    expect(await rasterizeFlyer(pdfFile(), notify)).toBeNull();
    expect(notify).toHaveBeenCalledWith("Error leyendo PDF: No canvas here");
    vi.restoreAllMocks();
  });
});

describe("an image", () => {
  it("comes out 1240 wide, on white", async () => {
    const result = await rasterizeFlyer(await paintedPng(), () => undefined);
    if (!result || result === "no-reader") throw new Error("It did not convert");
    expect(result.canvas.width).toBe(1240);
    expect(result.canvas.height).toBe(620);
    expect(Array.from(result.canvas.getContext("2d")?.getImageData(5, 5, 1, 1).data ?? [])).toEqual(
      [255, 255, 255, 255],
    );
  });

  it("broken, it says so", async () => {
    const notify = vi.fn<FlyerNotice>();
    const broken = new File(["no"], "a.png", { type: "image/png" });
    expect(await rasterizeFlyer(broken, notify)).toBeNull();
    expect(notify).toHaveBeenCalledWith("No se pudo leer la imagen");
  });
});
