import { describe, expect, it, vi } from "vitest";
import { generateBatch } from "./batch.ts";
import { createFlyerPdf } from "./output.ts";
import { NO_LOGOS, paintedCanvas, testScene } from "./testing/test-scene.ts";

vi.mock("jspdf", () => {
  throw new Error("jsPDF did not arrive");
});

vi.mock("jszip", () => {
  throw new Error("JSZip did not arrive");
});

describe("a library that does not arrive", () => {
  it("is told apart from a flyer that could not be made", async () => {
    await expect(createFlyerPdf(paintedCanvas(10, 10))).resolves.toMatchObject({
      ok: false,
      error: { kind: "library" },
    });
  });

  it("leaves a batch without its PDF, each row noted down, and without a ZIP", async () => {
    const { generated, problems, zip } = await generateBatch({
      rows: ["a"],
      format: "pdf",
      logos: NO_LOGOS,
      optionOf: () => 1,
      loadScene: () => Promise.resolve({ ok: true, value: testScene() }),
      valuesOf: (row) => ({ empresa: row }),
    });
    expect(generated).toBe(0);
    expect(problems[0]).toMatchObject({ row: "a", reason: "drawing" });
    expect(zip).toBeNull();
  });

  it("leaves a batch of images without its ZIP, and says so", async () => {
    const { generated, zip } = await generateBatch({
      rows: ["a"],
      format: "png",
      logos: NO_LOGOS,
      optionOf: () => 1,
      loadScene: () =>
        Promise.resolve({ ok: true, value: testScene({ art: paintedCanvas(40, 40) }) }),
      valuesOf: (row) => ({ empresa: row }),
    });
    expect(generated).toBe(1);
    expect(zip).toMatchObject({ ok: false, error: { kind: "library" } });
  });
});
