import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { type BatchProgress, type BatchRequest, generateBatch, yieldToPaint } from "./batch.ts";
import { type FlyerValues } from "./types.ts";
import { failure, success } from "@/shared/supabase/index.ts";
import { NO_LOGOS, paintedCanvas, testScene } from "./testing/test-scene.ts";

interface Row {
  company: string;
  option: number;
}

const SCENE = testScene({ art: paintedCanvas(124, 646) });

function request(rows: Row[]) {
  return {
    rows,
    format: "pdf" as const,
    logos: NO_LOGOS,
    optionOf: ({ option }: Row) => option,
    loadScene: () => Promise.resolve(success(SCENE)),
    valuesOf: ({ company }: Row) => ({ empresa: company }),
  };
}

async function entries(zip: Blob | undefined): Promise<string[]> {
  if (!zip) throw new Error("No ZIP");
  const read = await JSZip.loadAsync(await zip.arrayBuffer());
  return Object.keys(read.files).toSorted();
}

async function namesIn(result: Awaited<ReturnType<typeof generateBatch<Row>>>) {
  if (!result.zip?.ok) throw new Error("No ZIP");
  return entries(result.zip.value);
}

describe("generateBatch", () => {
  it("makes one PDF per row, with the name of its company", async () => {
    const result = await generateBatch(
      request([
        { company: "UNO", option: 1 },
        { company: "A/B", option: 1 },
      ]),
    );
    expect(result.generated).toBe(2);
    expect(result.problems).toEqual([]);
    expect(result.perOption).toEqual(new Map([[1, 2]]));
    await expect(namesIn(result)).resolves.toEqual(["Flyer A-B.pdf", "Flyer UNO.pdf"]);
  });

  it("two rows with one company do not step on each other", async () => {
    const result = await generateBatch(
      request([
        { company: "UNO", option: 1 },
        { company: "UNO", option: 1 },
        { company: "UNO", option: 2 },
      ]),
    );
    await expect(namesIn(result)).resolves.toEqual([
      "Flyer UNO (2).pdf",
      "Flyer UNO (3).pdf",
      "Flyer UNO.pdf",
    ]);
  });

  it("with a folder per option, each one has its own names", async () => {
    const result = await generateBatch({
      ...request([
        { company: "UNO", option: 1 },
        { company: "UNO", option: 2 },
        { company: "UNO", option: 2 },
      ]),
      folderOf: (option) => `Formato ${String(option)}`,
    });
    await expect(namesIn(result)).resolves.toEqual(
      expect.arrayContaining([
        "Formato 1/Flyer UNO.pdf",
        "Formato 2/Flyer UNO.pdf",
        "Formato 2/Flyer UNO (2).pdf",
      ]),
    );
    expect(result.perOption).toEqual(
      new Map([
        [1, 1],
        [2, 2],
      ]),
    );
  });

  it("makes images when it is asked to", async () => {
    const result = await generateBatch({
      ...request([{ company: "UNO", option: 1 }]),
      format: "png",
    });
    await expect(namesIn(result)).resolves.toEqual(["Flyer UNO.png"]);
    if (!result.zip?.ok) throw new Error("No ZIP");
    const read = await JSZip.loadAsync(await result.zip.value.arrayBuffer());
    const bytes = await read.file("Flyer UNO.png")?.async("uint8array");
    expect(bytes?.[1]).toBe(0x50);
  });

  it("names a row with no company", async () => {
    const result = await generateBatch(request([{ company: "", option: 1 }]));
    await expect(namesIn(result)).resolves.toEqual(["Flyer empresa.pdf"]);
  });

  it("adds the summary it is given, knowing the outcome", async () => {
    const result = await generateBatch({
      ...request([{ company: "UNO", option: 1 }]),
      summaryOf: ({ generated, problems }) => `${String(generated)} / ${String(problems.length)}`,
    });
    if (!result.zip?.ok) throw new Error("No ZIP");
    const read = await JSZip.loadAsync(await result.zip.value.arrayBuffer());
    await expect(read.file("Resumen.txt")?.async("string")).resolves.toBe("1 / 0");
  });

  it("a group whose flyer did not load is left out with its reason, and is never drawn on another", async () => {
    const valuesOf = vi.fn<(row: Row) => FlyerValues>(({ company }) => ({ empresa: company }));
    const loadScene = vi.fn<BatchRequest<Row>["loadScene"]>((option) =>
      Promise.resolve(option === 2 ? failure("network" as const) : success(SCENE)),
    );
    const result = await generateBatch({
      ...request([
        { company: "UNO", option: 1 },
        { company: "DOS", option: 2 },
        { company: "TRES", option: 3 },
      ]),
      loadScene,
      valuesOf,
    });
    expect(loadScene.mock.calls.map(([option]) => option)).toEqual([1, 2, 3]);
    expect(valuesOf.mock.calls.map(([row]) => row.company)).toEqual(["UNO", "TRES"]);
    expect(result.problems).toEqual([
      { row: { company: "DOS", option: 2 }, option: 2, reason: "network" },
    ]);
    await expect(namesIn(result)).resolves.toEqual(["Flyer TRES.pdf", "Flyer UNO.pdf"]);
  });

  it("a flyer with no image gives that reason, and a scene that fails to come counts as network", async () => {
    const noFlyer = await generateBatch({
      ...request([{ company: "UNO", option: 1 }]),
      loadScene: () => Promise.resolve(failure("no-flyer" as const)),
    });
    expect(noFlyer.problems[0]?.reason).toBe("no-flyer");
    const rejected = await generateBatch({
      ...request([{ company: "UNO", option: 1 }]),
      loadScene: () => Promise.reject(new Error("no")),
    });
    expect(rejected.problems[0]?.reason).toBe("network");
  });

  it("with nothing generated there is no ZIP", async () => {
    const summaryOf = vi.fn<() => string>(() => "x");
    const result = await generateBatch({
      ...request([{ company: "UNO", option: 1 }]),
      loadScene: () => Promise.resolve(failure("network" as const)),
      summaryOf,
    });
    expect(result.generated).toBe(0);
    expect(result.zip).toBeNull();
    expect(summaryOf).not.toHaveBeenCalled();
    expect((await generateBatch(request([]))).zip).toBeNull();
  });

  it("a row that fails is noted down, and the batch goes on with the next one", async () => {
    const result = await generateBatch({
      ...request([
        { company: "MALA", option: 1 },
        { company: "BUENA", option: 1 },
      ]),
      valuesOf: ({ company }) => {
        if (company === "MALA") throw new Error("dato raro");
        return { empresa: company };
      },
    });
    expect(result.problems).toEqual([
      {
        row: { company: "MALA", option: 1 },
        option: 1,
        reason: "drawing",
        detail: "dato raro",
      },
    ]);
    await expect(namesIn(result)).resolves.toEqual(["Flyer BUENA.pdf"]);
  });

  it("says how far it went, also for the rows left out", async () => {
    const onProgress = vi.fn<(progress: BatchProgress<Row>) => void>();
    await generateBatch({
      ...request([
        { company: "UNO", option: 1 },
        { company: "DOS", option: 2 },
      ]),
      loadScene: (option) =>
        Promise.resolve(option === 2 ? failure("network" as const) : success(SCENE)),
      onProgress,
    });
    expect(onProgress.mock.calls.map(([progress]) => [progress.done, progress.total])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("a ZIP that cannot be made is a failure, not a false success", async () => {
    const generating = vi
      .spyOn(JSZip.prototype, "generateAsync")
      .mockRejectedValue(new Error("sin memoria"));
    const result = await generateBatch(request([{ company: "UNO", option: 1 }]));
    expect(result.generated).toBe(1);
    expect(result.zip).toEqual({
      ok: false,
      error: { kind: "generation", detail: "sin memoria" },
    });
    generating.mockRestore();
  });
});

describe("yieldToPaint", () => {
  it("goes on, also where a frame never comes", async () => {
    await expect(yieldToPaint()).resolves.toBeUndefined();
    const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    await expect(yieldToPaint()).resolves.toBeUndefined();
    frames.mockRestore();
  });
});
