// Not a screen: what lets tests/e2e/specs/flyer-engine/ reach the engine in a real browser, through
// its public API, and download what it makes. By hand it is inert: it holds no flyer of its own.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  buildFileName,
  type Cut,
  cropScene,
  createLogoLibrary,
  dateForFileName,
  downloadBlob,
  type FlyerScene,
  type FlyerValues,
  generateBatch,
  loadFlyerArtwork,
  loadPicture,
  type RawCalibration,
  renderFullResolution,
  saveFlyerPdf,
  saveFlyerPng,
} from "./index.ts";

interface HarnessScene {
  readonly artUrl: string;
  readonly calibration: RawCalibration;
  readonly singleCashback: boolean;
}

export interface HarnessCase extends HarnessScene {
  readonly values: FlyerValues;
  readonly pattern: string;
  readonly cuts?: readonly Cut[];
  /** Keys of logos the library has to bring before drawing. */
  readonly logos?: readonly string[];
  readonly logoBase: string;
}

const NOW = new Date(0);

/** What the screens will do: the app is the one that knows where its logos live. */
function logoLibraryFor(logoBase: string) {
  return createLogoLibrary({
    fetchLogo: (key) => window.fetch(`${logoBase}${key}`).then((answer) => answer.blob()),
    onArrival: () => undefined,
  });
}

async function sceneFor({
  artUrl,
  calibration,
  singleCashback,
}: HarnessScene): Promise<FlyerScene> {
  const loaded = await loadFlyerArtwork({ imageUrl: artUrl, calibration, singleCashback });
  if (!loaded.ok) throw new Error(`The flyer did not load: ${loaded.error}`);
  return loaded.value;
}

async function canvasFor(input: HarnessCase) {
  const whole = await sceneFor(input);
  const { scene } = await cropScene(whole, input.cuts ?? [], { loadSection: loadPicture });
  const library = logoLibraryFor(input.logoBase);
  await Promise.all((input.logos ?? []).map((key) => library.fetch(key)));
  return renderFullResolution(scene, input.values, library);
}

function fileNameOf({ pattern, values }: HarnessCase): string {
  return buildFileName(pattern, values, { now: NOW, configuration: "BAU" });
}

async function savePdf(input: HarnessCase): Promise<void> {
  const saved = await saveFlyerPdf(await canvasFor(input), fileNameOf(input));
  if (!saved.ok) throw new Error(saved.error.detail);
}

async function savePng(input: HarnessCase): Promise<void> {
  const saved = saveFlyerPng(await canvasFor(input), fileNameOf(input));
  if (!saved.ok) throw new Error(saved.error.detail);
}

async function saveBulkZip(
  input: HarnessScene & { readonly rows: readonly FlyerValues[]; readonly logoBase: string },
): Promise<void> {
  const scene = await sceneFor(input);
  const { zip, problems } = await generateBatch({
    rows: input.rows,
    format: "pdf",
    logos: logoLibraryFor(input.logoBase),
    optionOf: () => 9,
    loadScene: () => Promise.resolve({ ok: true, value: scene }),
    valuesOf: (row) => row,
    summaryOf: ({ generated }) => `Flyers generados: ${String(generated)}`,
  });
  if (!zip?.ok || problems.length > 0) throw new Error("The batch did not come out");
  downloadBlob(zip.value, `Flyers_Galicia_${dateForFileName(NOW)}.zip`);
}

function installEngine(): boolean {
  // The app declares Spanish: the text of a canvas can change with the language of the page.
  document.documentElement.lang = "es";
  Object.assign(window, { __FLYER_ENGINE__: { savePdf, savePng, saveBulkZip } });
  return true;
}

function Harness() {
  const [ready] = useState(installEngine);
  return ready ? <p>Motor listo</p> : null;
}

const meta = {
  title: "shared/flyer-engine/EngineHarness",
  component: Harness,
} satisfies Meta<typeof Harness>;

export default meta;

export const Engine: StoryObj<typeof meta> = {};
