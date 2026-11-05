// "Flyers para copiar": `_fuentes.json` in the bucket, and what the others propose, in flyer_disenos
// with tipo 'fuente'. The administrator is the only one who writes the file.
import type { Backend, Bucket } from "@/shared/supabase/index.ts";
import { DesignImageError } from "../model/design-image.ts";
import { StudioError } from "./designs.ts";

const FILE = "_fuentes.json";
const PROPOSAL_COLUMNS =
  "id,user_id,autor,nombre,miniatura,estado,nota_admin,created_at,updated_at";
const LARGEST_PICTURE = 2_600_000;
const QUALITIES = [0.85, 0.72, 0.6, 0.5] as const;
const THUMBNAIL_WIDTH = 144;
const THUMBNAIL_TALLEST = 260;
const YEAR_OF_CACHE = "31536000";

export interface Source {
  readonly id: string;
  readonly nombre: string;
  readonly img: string;
  readonly w?: number;
  readonly h?: number;
  readonly mini?: string;
  readonly at?: string;
  readonly de?: string;
}

export interface Proposal {
  readonly id: string;
  readonly nombre: string;
  readonly autor: string | null;
  readonly miniatura: string | null;
  readonly estado: string;
  readonly nota_admin: string | null;
  readonly created_at: string | null;
}

function isSource(value: unknown): value is Source {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "img") === "string"
  );
}

function listIn(content: unknown): readonly unknown[] {
  const list: unknown =
    typeof content === "object" && content !== null ? Reflect.get(content, "lista") : null;
  return Array.isArray(list) ? list : [];
}

/** Only pictures of our bucket: anything else in that file is not ours to show. */
export async function readSources(bucket: Bucket): Promise<readonly Source[]> {
  const file = await bucket.readJson(FILE);
  if (!file.ok) {
    if (file.error.kind === "not-found") return [];
    throw new StudioError(file.error);
  }
  const home = bucket.publicUrl(FILE).slice(0, -FILE.length);
  return listIn(file.value)
    .filter(isSource)
    .filter(({ img }) => img.startsWith(home));
}

export async function readProposals(
  { db }: Pick<Backend, "db">,
  isAdmin: boolean,
): Promise<readonly Proposal[]> {
  const query = db
    .from("flyer_disenos")
    .select(PROPOSAL_COLUMNS)
    .eq("tipo", "fuente")
    .order("created_at", { ascending: false });
  const { data, error } = await (isAdmin
    ? query.eq("estado", "pedido")
    : query.in("estado", ["pedido", "rechazado"]));
  // Without migration 038 there are no proposals: Estudio goes on.
  return error ? [] : data;
}

function isListMissing(status: number | null): boolean {
  return status === 404 || status === 400;
}

/**
 * The list is read right before saving it, not to step on that of another tab. Only "it does not
 * exist" counts as empty: a 403, a 5xx or no network stop, or saving would step on the whole depot.
 */
export async function changeSources(
  bucket: Bucket,
  change: (list: readonly unknown[]) => readonly unknown[],
): Promise<void> {
  const file = await bucket.readJson(FILE);
  if (!file.ok && !isListMissing(file.error.status)) {
    throw new DesignImageError(
      file.error.status === null
        ? "sin conexión"
        : `no se pudo leer la lista (${String(file.error.status)})`,
    );
  }
  const written = await bucket.upload(
    FILE,
    new Blob(
      [
        JSON.stringify({
          lista: change(file.ok ? listIn(file.value) : []),
          updated_at: new Date().toISOString(),
        }),
      ],
      { type: "application/json" },
    ),
    { contentType: "application/json", upsert: true },
  );
  if (!written.ok) throw new StudioError(written.error);
}

export interface NewSource {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly thumbnail: string;
  readonly name: string;
  readonly proposedBy: string;
}

/** A name of its own and a year of cache: the picture is never written again. */
export async function publishSource(
  bucket: Bucket,
  { blob, width, height, thumbnail, name, proposedBy }: NewSource,
): Promise<void> {
  const stamp = Date.now();
  const file = `fuente_${stamp}.jpg` as const;
  const uploaded = await bucket.upload(file, blob, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: YEAR_OF_CACHE,
  });
  if (!uploaded.ok) throw new StudioError(uploaded.error);
  await changeSources(bucket, (list) => [
    ...list,
    {
      id: `f${stamp}`,
      nombre: name,
      img: bucket.publicUrl(file),
      w: width,
      h: height,
      mini: thumbnail,
      at: new Date().toISOString(),
      de: proposedBy,
    },
  ]);
}

export function sourceThumbnail(canvas: HTMLCanvasElement): string {
  const small = document.createElement("canvas");
  small.width = THUMBNAIL_WIDTH;
  small.height = Math.min(
    Math.round((canvas.height * THUMBNAIL_WIDTH) / canvas.width),
    THUMBNAIL_TALLEST,
  );
  const context = small.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, small.width, small.height);
  context.imageSmoothingQuality = "high";
  const sourceHeight = (small.height * canvas.width) / THUMBNAIL_WIDTH;
  context.drawImage(canvas, 0, 0, canvas.width, sourceHeight, 0, 0, THUMBNAIL_WIDTH, small.height);
  return small.toDataURL("image/jpeg", 0.72);
}

function pictureThatFits(canvas: HTMLCanvasElement): string {
  for (const quality of QUALITIES) {
    const picture = canvas.toDataURL("image/jpeg", quality);
    if (picture.length < LARGEST_PICTURE) return picture;
  }
  throw new DesignImageError("el flyer es demasiado grande para mandarlo");
}

export async function proposeSource(
  { db }: Pick<Backend, "db">,
  canvas: HTMLCanvasElement,
  name: string,
  thumbnail: string,
  option: number,
): Promise<void> {
  const { error } = await db.from("flyer_disenos").insert({
    nombre: name,
    empresa: "",
    opcion: option,
    base_name: "",
    tipo: "fuente",
    estado: "pedido",
    datos: { img: pictureThatFits(canvas), w: canvas.width, h: canvas.height },
    miniatura: thumbnail,
  });
  if (error) throw new StudioError(error);
}

export interface ProposalContent {
  readonly nombre: string;
  readonly autor: string;
  readonly miniatura: string;
  readonly estado: string;
  readonly picture: string;
  readonly width: number;
  readonly height: number;
}

function numberIn(value: unknown, key: string): number {
  const found: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
  return typeof found === "number" ? found : 0;
}

function pictureIn(value: unknown): string {
  const found: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "img") : undefined;
  return typeof found === "string" ? found : "";
}

export async function readProposal(
  { db }: Pick<Backend, "db">,
  id: string,
): Promise<ProposalContent> {
  const { data, error } = await db
    .from("flyer_disenos")
    .select("id,nombre,autor,datos,miniatura,estado")
    .eq("id", id)
    .single();
  if (error) throw new StudioError(error);
  return {
    nombre: data.nombre,
    autor: data.autor ?? "",
    miniatura: data.miniatura ?? "",
    estado: data.estado,
    picture: pictureIn(data.datos),
    width: numberIn(data.datos, "w"),
    height: numberIn(data.datos, "h"),
  };
}

/** Just what it takes to look at it. */
export async function readProposalPicture(
  { db }: Pick<Backend, "db">,
  id: string,
): Promise<{ readonly name: string; readonly picture: string }> {
  const { data, error } = await db
    .from("flyer_disenos")
    .select("nombre,datos")
    .eq("id", id)
    .single();
  if (error) throw new StudioError(error);
  return { name: data.nombre, picture: pictureIn(data.datos) };
}

export function blobOfJpeg(address: string): Blob | null {
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(address);
  if (!match?.[1]) return null;
  const bytes = Uint8Array.from(atob(match[1]), (letter) => letter.charCodeAt(0));
  return new Blob([bytes], { type: "image/jpeg" });
}

/** The row stays as a record, without the heavy copy: the picture already lives in the bucket. */
export async function markProposalApproved(
  { db }: Pick<Backend, "db">,
  id: string,
): Promise<boolean> {
  try {
    const { error } = await db
      .from("flyer_disenos")
      .update({ estado: "publicado", datos: {} })
      .eq("id", id)
      .eq("estado", "pedido");
    return !error;
  } catch {
    return false;
  }
}

export async function rejectProposal(
  { db }: Pick<Backend, "db">,
  id: string,
  note: string,
): Promise<void> {
  const { error } = await db
    .from("flyer_disenos")
    .update({ estado: "rechazado", nota_admin: note, datos: {} })
    .eq("id", id)
    .eq("estado", "pedido");
  if (error) throw new StudioError(error);
}
