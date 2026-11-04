// A scene is a loaded picture with its calibration. It is the only thing the engine draws from.
import { pictureSize } from "./canvas.ts";
import { cropCalibration } from "./crop-calibration.ts";
import { applyCuts, artFileName, cutsSignature, type SectionImages } from "./crop-art.ts";
import { resolveCalibration } from "./calibration.ts";
import { failure, type Result, success } from "@/shared/supabase/index.ts";
import { type Cut, type FlyerScene, type FlyerValues, type RawCalibration } from "./types.ts";

/** "no-flyer" is a firm answer; "network" can be tried again. They never read the same. */
export type ArtworkFailure = "no-flyer" | "network";

export interface ArtworkRequest {
  /** Null when the option has no flyer uploaded. */
  readonly imageUrl: string | null;
  readonly calibration?: RawCalibration | null;
  readonly singleCashback?: boolean;
}

/** Loads a picture: null if it does not arrive, which is never an empty picture. */
export function loadPicture(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => {
      resolve(image.naturalWidth > 0 ? image : null);
    });
    image.addEventListener("error", () => {
      resolve(null);
    });
    image.src = url;
  });
}

/** The only way to a scene: there is none for a flyer that did not load (invariant 23). */
export async function loadFlyerArtwork({
  imageUrl,
  calibration,
  singleCashback = false,
}: ArtworkRequest): Promise<Result<FlyerScene, ArtworkFailure>> {
  if (!imageUrl) return failure("no-flyer");
  const art = await loadPicture(imageUrl);
  if (!art) return failure("network");
  const rawCalibration = calibration ?? {};
  // As the browser writes the address: that is what stored logo changes and cuts were saved with.
  const artKey = art.src;
  return success({
    art,
    artKey,
    calibration: resolveCalibration(rawCalibration),
    singleCashback,
    whole: { art, artKey, rawCalibration },
    cuts: [],
  });
}

export interface CropOptions {
  /** Brings a section of another flyer. Only the app knows which addresses it trusts. */
  readonly loadSection: (url: string) => Promise<HTMLImageElement | null>;
}

export interface CroppedScene {
  readonly scene: FlyerScene;
  /** Sections that did not arrive: each one left a gap, and whoever asked has to say so. */
  readonly missingSections: number;
}

async function sectionImages(
  cuts: readonly Cut[],
  loadSection: CropOptions["loadSection"],
): Promise<Map<string, HTMLImageElement>> {
  const addresses = [...new Set(cuts.flatMap((cut) => (cut.ins ? [cut.ins.u] : [])))];
  const loaded = await Promise.all(addresses.map(loadSection));
  const images = new Map<string, HTMLImageElement>();
  for (const [index, address] of addresses.entries()) {
    const image = loaded[index];
    if (image) images.set(address, image);
  }
  return images;
}

function missingCount(cuts: readonly Cut[], images: SectionImages): number {
  return cuts.filter((cut) => cut.ins && !images.has(cut.ins.u)).length;
}

/**
 * Another scene with these cuts, counted from the whole flyer, so the picture and the calibration
 * cannot go out of step (invariant 22). The sections come first: drawing them cannot wait
 * (invariant 27). With no cuts it is the whole flyer again.
 */
export async function cropScene(
  scene: FlyerScene,
  cuts: readonly Cut[],
  { loadSection }: CropOptions,
): Promise<CroppedScene> {
  return cropSceneWith(scene, cuts, await sectionImages(cuts, loadSection));
}

/** The same with the images of the sections already in hand: what is missing leaves a gap. */
export function cropSceneWith(
  scene: FlyerScene,
  cuts: readonly Cut[],
  images: SectionImages,
): CroppedScene {
  const { whole, singleCashback } = scene;
  const { width, height } = pictureSize(whole.art);
  return {
    scene: {
      art: applyCuts(whole.art, cuts, images),
      artKey: cuts.length > 0 ? `${whole.artKey}#rec=${cutsSignature(cuts)}` : whole.artKey,
      calibration:
        cuts.length > 0
          ? cropCalibration(whole.rawCalibration, cuts, width, height)
          : resolveCalibration(whole.rawCalibration),
      singleCashback,
      whole,
      cuts,
    },
    missingSections: missingCount(cuts, images),
  };
}

export interface StoredCrop {
  readonly scene: FlyerScene;
  readonly missingSections: number;
  /** The flyer changed since then: it comes out uncut, and whoever asked has to say so. */
  readonly cropDiscarded: boolean;
}

/** The scene to draw stored values with: history, for example, downloads them again as they were. */
export async function sceneForStoredValues(
  scene: FlyerScene,
  values: FlyerValues,
  options: CropOptions,
): Promise<StoredCrop> {
  const cuts = values.recortes ?? [];
  if (cuts.length === 0) return { scene, missingSections: 0, cropDiscarded: false };
  if (values.recBase !== artFileName(scene.whole.artKey)) {
    return { scene, missingSections: 0, cropDiscarded: true };
  }
  return { ...(await cropScene(scene, cuts, options)), cropDiscarded: false };
}

/** What a cropped scene saves along with the values of a flyer. */
export function storedCropOf(scene: FlyerScene): Pick<FlyerValues, "recortes" | "recBase"> {
  if (scene.cuts.length === 0) return {};
  return {
    recortes: scene.cuts.map((cut) => ({ ...cut })),
    recBase: artFileName(scene.whole.artKey),
  };
}
