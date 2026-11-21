// Reading and writing the rows of flyer_disenos and the bucket files Estudio publishes, whose
// field names are contracts with the app.
import { type DesignRow, type Row } from "./state.ts";
import { type CloudState } from "./state.ts";
import { type ActiveFlyerFile } from "./seed-data.ts";

export interface DesignCutData {
  y: number;
  h: number;
  ins?: { u: string; sy: number; sh: number; sw: number; pad: number };
}

/** The content of flyer_disenos.datos. */
export interface DesignData {
  v?: number;
  cambios: Row[];
  subidos: Record<string, string>;
  recortes: DesignCutData[];
  legal?: string;
  img?: string;
  items: { tipo: string; nombre?: string; ctx?: unknown[] }[];
  grupos?: { items: unknown[]; ctx: unknown[] }[];
  prov?: string;
  resumen?: string;
  flyer?: string;
}

export function designData(design: DesignRow | undefined): DesignData {
  return { cambios: [], subidos: {}, recortes: [], items: [], ...(design?.datos as object) };
}

export function textChange(text: string): Row {
  return {
    tipo: "txt",
    texto: text,
    color: "#040404",
    peso: 500,
    fs: 23,
    bfs: 23,
    x: 687,
    y: 1374,
    w: 89,
    h: 53,
    bg: "rgb(255,254,254)",
    t: text,
    ox: 691,
    oy: 1378,
    ow: 81,
    oh: 45,
    tx: 696,
    ty: 1386,
    tw: 71,
    th: 30,
  };
}

/** Adds a row as if that user had saved it long ago. */
export function addDesign(
  state: CloudState,
  fields: Partial<DesignRow> & { id: string; nombre: string; datos: unknown },
): DesignRow {
  const now = new Date().toISOString();
  const { asesor } = state.users;
  const design: DesignRow = {
    user_id: asesor?.id ?? "",
    autor: asesor?.name ?? "",
    empresa: "",
    opcion: 9,
    base_name: "",
    miniatura: "",
    estado: "privado",
    tipo: "diseno",
    compartido_de: null,
    compartido_por: "",
    compartido_at: null,
    nota_admin: "",
    opcion_publicada: null,
    pedido_at: null,
    revisado_at: null,
    created_at: now,
    updated_at: now,
    ...fields,
  };
  state.designs.push(design);
  return design;
}

export function activeFile(state: CloudState, option: number): ActiveFlyerFile | undefined {
  return state.bucketJson[`_active${String(option)}.json`] as ActiveFlyerFile | undefined;
}

export function legalFile(state: CloudState, option: number): { text?: string } | undefined {
  return state.bucketJson[`_legal${String(option)}.json`] as { text?: string } | undefined;
}

export interface SourceEntry {
  id: string;
  nombre: string;
  img: string;
  w: number;
  h: number;
  mini: string;
  at: string;
  de: string;
}

export function sourcesFile(state: CloudState): SourceEntry[] {
  return (state.bucketJson["_fuentes.json"] as { lista: SourceEntry[] } | undefined)?.lista ?? [];
}

/** The numbers of the options that have a published file, newest last. */
export function publishedOptions(state: CloudState): number[] {
  return Object.keys(state.bucketJson)
    .flatMap((file) => /^_active(\d+)\.json$/.exec(file)?.[1] ?? [])
    .map(Number)
    .toSorted((a, b) => a - b);
}
