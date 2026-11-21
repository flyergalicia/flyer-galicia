// The picture of a design as it would be published: flyer + cuts + logos. Publishing and "Ver completo"
// use the same one, so what is seen is what comes out.
import {
  cropSceneWith,
  type FlyerArt,
  type FlyerScene,
  type LogoLibrary,
  loadFlyerArtwork,
  paintLogoChanges,
} from "@/shared/flyer-engine/index.ts";
import { readActive } from "@/shared/lib/flyer-workspace/option-active.ts";
import type { SectionLibrary } from "@/shared/lib/flyer-workspace/index.ts";
import type { Bucket } from "@/shared/supabase/index.ts";
import {
  missingUploadsText,
  restoreUploads,
  uploadedLogoName,
  uploadedLogosIn,
} from "@/slices/logo-editor/index.ts";
import type { DesignContent } from "../api/designs.ts";

const LONG_NOTICE_MS = 7500;
const FONT_WEIGHTS = ["500", "700"] as const;

/** A failure with what the person has to read. */
export class DesignImageError extends Error {}

export interface DesignPainter {
  readonly logos: LogoLibrary;
  readonly sections: SectionLibrary;
  /** What each uploaded logo came from: two designs can share a key. */
  readonly origins: Map<string, string>;
}

export interface PaintOptions {
  /** To publish: what is missing stops it. To look at it, it is said and it goes on. */
  readonly strict: boolean;
  readonly notify: (text: string, durationMs?: number) => void;
}

function isCatalogLogo(img: string | undefined, tipo: string | undefined): img is string {
  return tipo !== "txt" && Boolean(img) && !img?.startsWith("pc:") && !img?.startsWith("orig:");
}

async function bringEverything(painter: DesignPainter, content: DesignContent): Promise<void> {
  const { logos, sections, origins } = painter;
  const catalog = content.changes.flatMap(({ img, tipo }) =>
    isCatalogLogo(img, tipo) ? [img] : [],
  );
  await Promise.all([
    ...catalog.map((key) => logos.fetch(key).catch(() => null)),
    restoreUploads(content.uploads, logos, origins),
    sections.bring(content.cuts),
  ]);
}

function missingSectionsText(count: number): string {
  const what = count === 1 ? "la sección insertada" : `${String(count)} secciones insertadas`;
  return `No se pudo bajar ${what}: en su lugar queda un espacio vacío. Revisá tu conexión y volvé a abrirlo.`;
}

function checkSections(
  { sections }: DesignPainter,
  content: DesignContent,
  { strict, notify }: PaintOptions,
): void {
  const missing = sections.missing(content.cuts);
  if (missing === 0) return;
  if (strict) {
    throw new DesignImageError(
      "no se pudo bajar una sección insertada; probá de nuevo en un momento.",
    );
  }
  notify(missingSectionsText(missing), LONG_NOTICE_MS);
}

function checkUploads(
  { logos }: DesignPainter,
  content: DesignContent,
  { strict, notify }: PaintOptions,
): void {
  const missing = logos.missingUploads(uploadedLogosIn(content.changes));
  const [first = ""] = missing;
  if (!first) return;
  if (strict) {
    const what =
      missing.length === 1
        ? `el logo subido de la PC «${uploadedLogoName(first)}»`
        : `${String(missing.length)} logos subidos de la PC`;
    throw new DesignImageError(
      `no se pudo cargar ${what}; así se publicaría con el logo original.`,
    );
  }
  notify(missingUploadsText(missing), LONG_NOTICE_MS);
}

async function fontsReady(): Promise<void> {
  await Promise.all(
    FONT_WEIGHTS.map((weight) => document.fonts.load(`${weight} 40px Figtree`)),
  ).catch(() => undefined);
}

function pictureSize(art: FlyerArt): { width: number; height: number } {
  return art instanceof HTMLImageElement
    ? { width: art.naturalWidth, height: art.naturalHeight }
    : { width: art.width, height: art.height };
}

export interface PaintedDesign {
  readonly canvas: HTMLCanvasElement;
  /** The flyer with its cuts: its calibration is what the published option is born with. */
  readonly scene: FlyerScene;
}

export async function paintDesign(
  painter: DesignPainter,
  whole: FlyerScene,
  content: DesignContent,
  options: PaintOptions,
): Promise<PaintedDesign> {
  if (content.changes.length === 0 && content.cuts.length === 0) {
    throw new DesignImageError("el diseño no tiene cambios");
  }
  await bringEverything(painter, content);
  checkSections(painter, content, options);
  checkUploads(painter, content, options);
  await fontsReady();
  const { scene } = cropSceneWith(whole, content.cuts, painter.sections.images());
  const { width, height } = pictureSize(scene.art);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new DesignImageError("no se pudo armar la imagen");
  context.drawImage(scene.art, 0, 0);
  paintLogoChanges(
    {
      ctx: context,
      scale: 1,
      art: scene.art,
      artKey: scene.artKey,
      cutAt: Number.POSITIVE_INFINITY,
      extra: 0,
    },
    content.changes,
    painter.logos,
  );
  return { canvas, scene };
}

/** The flyer a design was made on, whole. */
export async function baseFlyerScene(bucket: Bucket, option: number): Promise<FlyerScene> {
  const { imageUrl, calibration } = await readActive(bucket, option);
  if (!imageUrl) throw new DesignImageError("el flyer base no tiene imagen");
  const artwork = await loadFlyerArtwork({ imageUrl, calibration });
  if (!artwork.ok) throw new DesignImageError("no se pudo bajar la imagen del flyer base");
  return artwork.value;
}
