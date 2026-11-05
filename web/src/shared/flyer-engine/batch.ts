// Many flyers into one ZIP. What each row says, the words of the summary and which flyer goes with
// which row belong to who asks; what is here is what no batch can skip.
import { failure, type Result, success } from "@/shared/supabase/index.ts";
import { createFlyerPdf, detailOf, type OutputFailure, safeFileName } from "./output.ts";
import { renderFullResolution } from "./render.ts";
import { type ArtworkFailure } from "./scene.ts";
import { type FlyerScene, type FlyerValues, type LogoSource } from "./types.ts";

const SUMMARY_FILE = "Resumen.txt";
const YIELD_BACKSTOP_MS = 50;

export type BatchFormat = "pdf" | "png";

export interface BatchProblem<Row> {
  readonly row: Row;
  readonly option: number;
  readonly reason: ArtworkFailure | "drawing";
  readonly detail?: string;
}

export interface BatchProgress<Row> {
  readonly done: number;
  readonly total: number;
  readonly row: Row | null;
}

export interface BatchRequest<Row> {
  readonly rows: readonly Row[];
  readonly format: BatchFormat;
  readonly logos: LogoSource;
  readonly optionOf: (row: Row) => number;
  /** The scene of one option. A group that does not get one never draws on another picture. */
  readonly loadScene: (option: number) => Promise<Result<FlyerScene, ArtworkFailure>>;
  readonly valuesOf: (row: Row, option: number, scene: FlyerScene) => FlyerValues;
  /** Per option, a folder in the ZIP: then each folder has its own names. */
  readonly folderOf?: (option: number) => string;
  /** The words of Resumen.txt, once the outcome is known. */
  readonly summaryOf?: (outcome: BatchOutcome<Row>) => string;
  readonly onProgress?: (progress: BatchProgress<Row>) => void;
  /** Everything is drawn and the ZIP starts being made, which takes a while. */
  readonly onPacking?: () => void;
}

export interface BatchOutcome<Row> {
  readonly generated: number;
  readonly perOption: ReadonlyMap<number, number>;
  readonly problems: readonly BatchProblem<Row>[];
}

export interface BatchFile {
  readonly path: string;
  readonly content: ArrayBuffer | string;
  readonly base64: boolean;
}

export interface BatchResult<Row> extends BatchOutcome<Row> {
  /** Null when nothing came out: an empty ZIP is not downloaded. */
  readonly zip: Result<Blob, OutputFailure> | null;
}

/**
 * Lets the progress bar paint, one frame between flyers. The timer covers a tab in the background,
 * where requestAnimationFrame does not run.
 */
export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, YIELD_BACKSTOP_MS);
  });
}

function inOrder<Item>(items: readonly Item[], work: (item: Item) => Promise<void>): Promise<void> {
  return items.reduce((previous, item) => previous.then(() => work(item)), Promise.resolve());
}

function groupByOption<Row>(
  rows: readonly Row[],
  optionOf: (row: Row) => number,
): Map<number, Row[]> {
  const groups = new Map<number, Row[]>();
  for (const row of rows) {
    const option = optionOf(row);
    groups.set(option, [...(groups.get(option) ?? []), row]);
  }
  return groups;
}

/** Two rows with one company no longer step on each other: the second one is "(2)". */
function uniqueName(base: string, used: Map<string, number>): string {
  const times = (used.get(base) ?? 0) + 1;
  used.set(base, times);
  return times > 1 ? `${base} (${String(times)})` : base;
}

async function fileOf(
  canvas: HTMLCanvasElement,
  format: BatchFormat,
  path: string,
): Promise<BatchFile> {
  if (format === "png") {
    const [, content = ""] = canvas.toDataURL("image/png").split(",");
    return { path: `${path}.png`, content, base64: true };
  }
  const pdf = await createFlyerPdf(canvas);
  if (!pdf.ok) throw new Error(pdf.error.detail);
  return { path: `${path}.pdf`, content: pdf.value.toArrayBuffer(), base64: false };
}

const loadZipLibrary = () => import("jszip").then((library) => library.default);

/** What a batch needs: while it comes down, a batch already counts as running. */
export function bringBatchLibraries(): Promise<unknown> {
  return Promise.all([import("jspdf"), loadZipLibrary()]);
}

async function zipOf(files: readonly BatchFile[]): Promise<Result<Blob, OutputFailure>> {
  let Zip: Awaited<ReturnType<typeof loadZipLibrary>>;
  try {
    Zip = await loadZipLibrary();
  } catch (cause) {
    return failure({ kind: "library", detail: detailOf(cause) });
  }
  try {
    const zip = new Zip();
    for (const { path, content, base64 } of files) zip.file(path, content, { base64 });
    return success(await zip.generateAsync({ type: "blob" }));
  } catch (cause) {
    return failure({ kind: "generation", detail: detailOf(cause) });
  }
}

interface BatchRun<Row> {
  readonly request: BatchRequest<Row>;
  readonly files: BatchFile[];
  readonly problems: BatchProblem<Row>[];
  readonly perOption: Map<number, number>;
  done: number;
  readonly total: number;
}

function advance<Row>(run: BatchRun<Row>, row: Row): void {
  run.done += 1;
  run.request.onProgress?.({ done: run.done, total: run.total, row });
}

/** A row that fails is noted down and the batch goes on with the next one. */
async function generateRow<Row>(
  run: BatchRun<Row>,
  scene: FlyerScene,
  option: number,
  row: Row,
  used: Map<string, number>,
): Promise<void> {
  const { format, logos, valuesOf, folderOf } = run.request;
  try {
    const values = valuesOf(row, option, scene);
    const canvas = renderFullResolution(scene, values, logos);
    const name = uniqueName(`Flyer ${safeFileName(values.empresa || "empresa")}`, used);
    const folder = folderOf?.(option);
    const path = folder === undefined ? name : `${folder}/${name}`;
    run.files.push(await fileOf(canvas, format, path));
    run.perOption.set(option, (run.perOption.get(option) ?? 0) + 1);
  } catch (cause) {
    run.problems.push({ row, option, reason: "drawing", detail: detailOf(cause) });
  }
  advance(run, row);
}

async function generateGroup<Row>(
  run: BatchRun<Row>,
  option: number,
  rows: readonly Row[],
  shared: Map<string, number>,
): Promise<void> {
  const scene = await run.request.loadScene(option).catch(() => failure("network" as const));
  if (!scene.ok) {
    for (const row of rows) {
      run.problems.push({ row, option, reason: scene.error });
      advance(run, row);
    }
    return;
  }
  const used = run.request.folderOf ? new Map<string, number>() : shared;
  // One at a time: the bar paints between flyers, and the machine gets its breath back.
  await inOrder(rows, async (row) => {
    await generateRow(run, scene.value, option, row, used);
    await yieldToPaint();
  });
}

/** Generates everything it can and always says what did not come out and why. */
export async function generateBatch<Row>(request: BatchRequest<Row>): Promise<BatchResult<Row>> {
  const run: BatchRun<Row> = {
    request,
    files: [],
    problems: [],
    perOption: new Map(),
    done: 0,
    total: request.rows.length,
  };
  const used = new Map<string, number>();
  // Each option is a whole picture in memory.
  await inOrder([...groupByOption(request.rows, request.optionOf)], ([option, rows]) =>
    generateGroup(run, option, rows, used),
  );
  const outcome: BatchOutcome<Row> = {
    generated: run.files.length,
    perOption: run.perOption,
    problems: run.problems,
  };
  if (run.files.length === 0) return { ...outcome, zip: null };
  request.onPacking?.();
  const summary = request.summaryOf?.(outcome);
  const files =
    summary === undefined
      ? run.files
      : [...run.files, { path: SUMMARY_FILE, content: summary, base64: false }];
  return { ...outcome, zip: await zipOf(files) };
}
