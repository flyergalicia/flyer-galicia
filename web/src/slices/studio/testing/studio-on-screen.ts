// Test support: the screen of Estudio over a simulated table of designs.
import { createElement } from "react";
import { vi } from "vitest";
import { render } from "vitest-browser-react";
import { LOGO_A, paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { DesignDeskWorks } from "@/shared/lib/studio/design-desk.ts";
import type { DesignRow } from "@/shared/lib/studio/design-row.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import {
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { StudioStage } from "./StudioStage.tsx";

type Row = Readonly<Record<string, unknown>>;

export const ME = INVENTED_USER.id;

export function aDesign(id: string, fields: Partial<DesignRow> & Row = {}): DesignRow & Row {
  return {
    id,
    user_id: ME,
    autor: "Ana Inventada",
    nombre: `Diseño ${id}`,
    empresa: "",
    opcion: 9,
    base_name: "",
    miniatura: "",
    estado: "privado",
    nota_admin: "",
    opcion_publicada: null,
    pedido_at: null,
    revisado_at: null,
    created_at: "2026-10-20T15:00:00.000Z",
    updated_at: "2026-10-22T15:00:00.000Z",
    compartido_por: null,
    compartido_de: null,
    compartido_at: null,
    tipo: "diseno",
    datos: { v: 1, cambios: [], subidos: {}, recortes: [], legal: "" },
    ...fields,
  };
}

/** What the table does: only what Estudio asks of it. */
export interface DesignTable {
  rows: (DesignRow & Row)[];
  messages: Row[];
}

const UPLOADS = "/storage/v1/object/flyers/";
const eq = (value: string | null) => value?.replace(/^eq\./, "") ?? "";

function allowedStates(query: URLSearchParams): readonly string[] | null {
  const raw = query.get("estado");
  if (!raw) return null;
  if (raw.startsWith("eq.")) return [raw.slice(3)];
  return raw
    .slice(4, -1)
    .split(",")
    .map((state) => state.replaceAll('"', ""));
}

function matching(table: DesignTable, query: URLSearchParams) {
  const id = eq(query.get("id"));
  const kind = eq(query.get("tipo"));
  const owner = eq(query.get("user_id"));
  const states = allowedStates(query);
  return table.rows.filter(
    (row) =>
      (!id || row.id === id) &&
      (!owner || row.user_id === owner) &&
      (!kind || row["tipo"] === kind) &&
      (!states || states.includes(row.estado)),
  );
}

function wantsOne({ headers }: RecordedRequest): boolean {
  return headers.get("Accept")?.includes("vnd.pgrst.object") ?? false;
}

function designAnswer(table: DesignTable) {
  return (request: RecordedRequest): Response => {
    const { method, query, body } = request;
    const rows = matching(table, query);
    const one = wantsOne(request);
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "Content-Range": `*/${String(rows.length)}` },
      });
    }
    if (method === "POST") {
      const created = aDesign(`new-${String(table.rows.length)}`, Object(body));
      table.rows = [created, ...table.rows];
      return jsonResponse(one ? created : [created], 201);
    }
    if (method === "DELETE") {
      table.rows = table.rows.filter((row) => !rows.includes(row));
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") {
      const changed = rows.map((row) => Object.assign(row, Object(body)));
      if (one && changed.length === 0) return jsonResponse({ code: "PGRST116" }, 406);
      return jsonResponse(one ? changed[0] : changed);
    }
    if (one && rows.length === 0) return jsonResponse({ code: "PGRST116" }, 406);
    return jsonResponse(one ? rows[0] : rows);
  };
}

export function flyerFiles() {
  return {
    "_opciones.json": {
      opts: [
        { n: 9, nombre: "Combustible", solapa: "flyer" },
        { n: 5, nombre: "Rubro Uno", solapa: "rubros" },
      ],
    },
    "_active9.json": { imageUrl: paintedFlyer([LOGO_A]), cfg: {} },
    "_legal9.json": { text: "Legal de la nueve" },
  };
}

/** What was uploaded, as JSON if it is. A file written is a file read after. */
async function keepWritten(request: RecordedRequest, files: Record<string, unknown>) {
  const { body } = request.init ?? {};
  const name = request.path.replace(UPLOADS, "");
  const content =
    body instanceof FormData
      ? [...body.values()].find((value) => value instanceof Blob)
      : (body ?? undefined);
  if (!name.endsWith(".json") || !(content instanceof Blob)) return;
  files[name] = JSON.parse(await content.text());
}

export interface StudioCloud extends AppAnswers {
  readonly designs?: readonly (DesignRow & Row)[];
  readonly messages?: readonly Row[];
  readonly permissions?: Readonly<Record<string, boolean>>;
  readonly role?: string;
  readonly desk?: Partial<DesignDeskWorks>;
  readonly isActive?: boolean;
}

export async function openStudio(cloud: StudioCloud = {}) {
  const {
    designs = [],
    messages = [],
    permissions = { estudio: true, opcion_9: true, opcion_1: false },
    role = "asesor",
    desk,
    isActive = true,
    files,
    tables,
    profile,
    intercept,
    ...rest
  } = cloud;
  const table: DesignTable = { rows: structuredClone([...designs]), messages: [...messages] };
  const works: DesignDeskWorks = {
    openDesign: vi.fn<DesignDeskWorks["openDesign"]>(async (load) => {
      await load();
    }),
    closeDesign: vi.fn<DesignDeskWorks["closeDesign"]>(),
    applySavedSet: vi.fn<DesignDeskWorks["applySavedSet"]>(() => Promise.resolve()),
    showFlyer: vi.fn<DesignDeskWorks["showFlyer"]>(() => Promise.resolve()),
    ...desk,
  };
  const bucketFiles: Record<string, unknown> = {
    ...flyerFiles(),
    "_facultades.json": { roles: { asesor: permissions, vip: permissions } },
    ...files,
  };
  const harness = createAppHarness({
    ...rest,
    profile: profile ?? { ...ADVISOR, role },
    files: bucketFiles,
    intercept: async (request) => {
      const answer = (await intercept?.(request)) ?? null;
      if (!answer && request.method === "POST" && request.path.startsWith(UPLOADS)) {
        await keepWritten(request, bucketFiles);
      }
      return answer;
    },
    tables: {
      flyer_disenos: designAnswer(table),
      flyer_diseno_mensajes: () => jsonResponse(table.messages),
      ...tables,
    },
  });
  harness.storeSession();
  const view = (active: boolean) =>
    harness.wrap(createElement(StudioStage, { isActive: active, desk: works }));
  const screen = await render(view(isActive));
  return {
    screen,
    harness,
    table,
    works,
    bucketFiles,
    show: (active: boolean) => screen.rerender(view(active)),
  };
}
