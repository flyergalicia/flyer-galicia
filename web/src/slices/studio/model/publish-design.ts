// "Aprobar y publicar": the picture with the changes already on it, and an option next to the original
// one (the same tab, legal text and calibration; out of the routing by category, or it would win over
// the original). Each step can fail: what was uploaded is taken back, and a number is never left taken.
import { type FlyerOption, optionNumber, optionTab } from "@/shared/domain/flyer-options.ts";
import { withDesignBrands } from "@/shared/domain/promotions/index.ts";
import type { Cut } from "@/shared/flyer-engine/index.ts";
import { legalFile } from "@/shared/lib/flyer-workspace/option-files.ts";
import { readActive } from "@/shared/lib/flyer-workspace/option-active.ts";
import { changeWatchedBrands } from "@/shared/lib/promotions/watched-brands-store.ts";
import { isOpenRequest } from "@/shared/lib/studio/design-row.ts";
import type { Backend } from "@/shared/supabase/index.ts";
import { uploadedLogoName, uploadedLogosIn } from "@/slices/logo-editor/index.ts";
import {
  type DesignContent,
  type DesignWithContent,
  readDesignContent,
  readStatus,
} from "../api/designs.ts";
import {
  copyPermissions,
  readLegalText,
  readOptionsNow,
  reserveOption,
  saveFlyerCalibration,
  saveFlyerList,
} from "../api/flyer-files.ts";
import {
  baseFlyerScene,
  DesignImageError,
  type DesignPainter,
  paintDesign,
} from "./design-image.ts";

const JPEG_QUALITY = 0.92;
const YEAR_OF_CACHE = "31536000";
const LIST_TRIES = 2;

export type PublishFailure =
  /** Nothing was created: the request was cancelled or resolved meanwhile. */
  | { readonly kind: "nothing-created"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string }
  /** The option is on the list, and what came after failed. */
  | { readonly kind: "half-done"; readonly reason: string; readonly option: number };

export type PublishOutcome =
  | { readonly ok: true; readonly option: number; readonly permissionsSaved: boolean }
  | ({ readonly ok: false } & PublishFailure);

export interface PublishRequest {
  readonly id: string;
  readonly name: string;
  readonly notify: (text: string, durationMs?: number) => void;
}

class NothingCreated extends Error {}

function missingUploadsReason(design: DesignWithContent): string | null {
  const lost = uploadedLogosIn(design.changes).filter((key) => !design.uploads[key]);
  const [first = ""] = lost;
  if (!first) return null;
  const what =
    lost.length === 1
      ? `el logo subido de la PC «${uploadedLogoName(first)}»`
      : `${String(lost.length)} logos subidos de la PC`;
  return `le falta ${what} (no quedó guardado con el diseño). Abrilo con «Usar», volvé a subir el logo, guardalo y pedí de nuevo la publicación.`;
}

function asBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new DesignImageError("no se pudo armar la imagen"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/** With cuts, it is born with the calibration moved: the logos are in the coordinates of the cut one. */
function calibrationOf(
  raw: unknown,
  cuts: readonly Cut[],
  cropped: object,
  option: number,
): object {
  if (cuts.length === 0) return typeof raw === "object" && raw !== null ? raw : {};
  return { ...cropped, recDe: option };
}

function isOff(block: unknown): boolean {
  return typeof block === "object" && block !== null && Boolean(Reflect.get(block, "off"));
}

/** It was born without amounts: it is the version "sin cashback" of the original. */
function isNoCashbackVersion(cuts: readonly Cut[], calibration: object): boolean {
  if (cuts.length === 0) return false;
  return isOff(Reflect.get(calibration, "montos")) || isOff(Reflect.get(calibration, "cashback"));
}

function baseOf(options: readonly FlyerOption[], option: number): number {
  const version = options.find(({ n }) => n === option)?.sinCB;
  return version && options.some(({ n }) => n === version) ? version : option;
}

interface NewOption {
  readonly option: number;
  readonly from: number;
  readonly name: string;
  readonly noCashbackOf: number | null;
}

function listWith(options: readonly FlyerOption[], added: NewOption): readonly FlyerOption[] {
  const list: FlyerOption[] = [];
  const addedEntry: FlyerOption = {
    n: added.option,
    nombre: added.name,
    color: "",
    solapa: optionTab(options, added.from),
    orden: 0,
    reemplaza: 0,
    rubro: "ninguno",
    ...(added.noCashbackOf === null ? {} : { sinCB: added.noCashbackOf }),
  };
  for (const entry of options) {
    list.push({ ...entry, orden: list.length });
    if (entry.n === added.from) list.push({ ...addedEntry, orden: list.length });
  }
  return list;
}

/** It reads the list right before saving it and checks after: if another save stepped on it, again. */
async function putOnTheList(bucket: Backend["bucket"], added: NewOption, tries = 1): Promise<void> {
  const isThere = (options: readonly FlyerOption[]) => options.some(({ n }) => n === added.option);
  const options = await readOptionsNow(bucket);
  if (isThere(options)) return;
  const saved = await saveFlyerList(bucket, listWith(options, added));
  if (!saved.ok) throw new DesignImageError("no se pudo guardar la opción nueva");
  if (isThere(await readOptionsNow(bucket))) return;
  if (tries >= LIST_TRIES) throw new DesignImageError("la opción nueva no quedó guardada");
  await putOnTheList(bucket, added, tries + 1);
}

async function readForPublishing(backend: Backend, id: string): Promise<DesignWithContent> {
  const design = await readDesignContent(backend, id);
  if (!isOpenRequest({ estado: design.status })) {
    throw new DesignImageError("ese diseño ya no está pedido (lo cancelaron o ya se resolvió)");
  }
  // Before reserving any number: without its logo, it would come out with the original one.
  const lost = missingUploadsReason(design);
  if (lost) throw new DesignImageError(lost);
  return design;
}

interface PublishState {
  reserved: { readonly option: number; readonly image: string } | null;
  onList: boolean;
}

async function createFiles(
  backend: Backend,
  design: DesignWithContent,
  painter: DesignPainter,
  { notify }: PublishRequest,
  state: PublishState,
) {
  const { bucket } = backend;
  const { option: from } = design;
  const active = await readActive(bucket, from);
  const legalText = await readLegalText(bucket, legalFile(from));
  const whole = await baseFlyerScene(bucket, from);
  const { canvas, scene } = await paintDesign(painter, whole, design, { strict: true, notify });
  const calibration = calibrationOf(active.calibration, design.cuts, scene.calibration, from);
  const blob = await asBlob(canvas);
  const options = await readOptionsNow(bucket);
  const stamp = Date.now();
  const { option, image } = await reserveOption(
    bucket,
    Math.max(0, ...options.map(({ n }) => n)) + 1,
    stamp,
    (file) => ({
      name: file,
      imageUrl: `${bucket.publicUrl(file)}?v=${String(stamp)}`,
      cfg: calibration,
      updated_at: new Date().toISOString(),
    }),
  );
  state.reserved = { option, image };
  // The legal text of the design, if it was saved with one; if not, that of the original.
  const legal = design.legal?.trim() ? design.legal : legalText;
  const uploaded = await Promise.all([
    bucket.upload(image, blob, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: YEAR_OF_CACHE,
    }),
    bucket.upload(
      `_legal${option}.json`,
      new Blob([JSON.stringify({ text: legal, updated_at: new Date().toISOString() })], {
        type: "application/json",
      }),
      { contentType: "application/json", upsert: true },
    ),
    // Failing is no stop: the flyer is drawn with the calibration it carries in its own file.
    saveFlyerCalibration(bucket, image, calibration).then(() => null),
  ]);
  for (const answer of uploaded.slice(0, 2)) {
    if (answer && !answer.ok) throw new DesignImageError(answer.error.message);
  }
  return { option, calibration, options };
}

/** The logos of Promociones of the design are watched on the new option. Failing is no stop. */
async function watchItsBrands(
  bucket: Backend["bucket"],
  { from, option, changes }: Pick<NewOption, "from" | "option"> & Pick<DesignContent, "changes">,
): Promise<void> {
  try {
    await changeWatchedBrands(bucket, (file) => withDesignBrands(file, from, option, changes));
  } catch {
    // Who looks after them can add them by hand.
  }
}

/** Whoever saw the original sees the new one. It says whether it could be saved. */
async function sameAudience(
  bucket: Backend["bucket"],
  from: number,
  option: number,
): Promise<boolean> {
  try {
    return await copyPermissions(bucket, from, option, await readOptionsNow(bucket));
  } catch {
    return false;
  }
}

async function publishSteps(
  backend: Backend,
  painter: DesignPainter,
  request: PublishRequest,
  state: PublishState,
): Promise<{ option: number; permissionsSaved: boolean }> {
  const { bucket } = backend;
  const design = await readForPublishing(backend, request.id);
  const { option, calibration, options } = await createFiles(
    backend,
    design,
    painter,
    request,
    state,
  );
  // Last look before creating the option: the author may have cancelled while it was being drawn.
  const status = await readStatus(backend, request.id);
  if (!isOpenRequest({ estado: status })) {
    throw new NothingCreated(
      "el pedido se canceló o ya se resolvió mientras se publicaba; no se creó el flyer",
    );
  }
  const from = optionNumber(options, design.option);
  await putOnTheList(bucket, {
    option,
    from,
    name: request.name,
    noCashbackOf: isNoCashbackVersion(design.cuts, calibration) ? baseOf(options, from) : null,
  });
  state.onList = true;
  await watchItsBrands(bucket, { from, option, changes: design.changes });
  const permissionsSaved = await sameAudience(bucket, from, option);
  return { option, permissionsSaved };
}

function reasonOf(cause: unknown, describe: (cause: unknown) => string): string {
  return cause instanceof DesignImageError || cause instanceof NothingCreated
    ? cause.message
    : describe(cause);
}

export async function publishDesign(
  backend: Backend,
  painter: DesignPainter,
  request: PublishRequest,
  describe: (cause: unknown) => string,
): Promise<PublishOutcome> {
  const state: PublishState = { reserved: null, onList: false };
  try {
    return { ok: true, ...(await publishSteps(backend, painter, request, state)) };
  } catch (cause) {
    const { reserved, onList } = state;
    // It did not reach the list: what was uploaded goes, or that number stays taken for ever.
    if (reserved && !onList) {
      await backend.bucket.remove([
        `_active${String(reserved.option)}.json`,
        `_legal${String(reserved.option)}.json`,
        reserved.image,
      ]);
    }
    const reason = reasonOf(cause, describe);
    if (cause instanceof NothingCreated) return { ok: false, kind: "nothing-created", reason };
    return reserved && onList
      ? { ok: false, kind: "half-done", reason, option: reserved.option }
      : { ok: false, kind: "failed", reason };
  }
}
