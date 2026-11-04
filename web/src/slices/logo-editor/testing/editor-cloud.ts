// Test support: Cambiar logos over a flyer painted for the test, with a catalog of invented brands.
import { createElement } from "react";
import { expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import {
  DAYS_TEXT,
  LOGO_A,
  LOGO_B,
  LOGO_C,
  type PaintedBlock,
  paintedFlyer,
  paintedLogo,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import type { PromotionPicker } from "@/shared/lib/promotions/promotion-picking.ts";
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import type { LogoEditor } from "../model/editor-store.ts";
import { EditorStage } from "./EditorStage.tsx";
import { handles } from "./handles.ts";

export { DAYS_TEXT, handles, LOGO_A, LOGO_B, LOGO_C, paintedFlyer, paintedLogo };

const OPTION = 9;

export function brand(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  return {
    id: `${titulo}-${fields.beneficio ?? ""}`,
    titulo,
    subtitulo: "Indumentaria",
    imagen: `${titulo}.png`,
    fecha_hasta: "2099-12-31",
    tipo_promocion: "Marca",
    provincias: ["MENDOZA"],
    primera_vez: "2020-01-01",
    proximamente: false,
    fecha_desde: null,
    dias: null,
    beneficio: "10% de ahorro",
    ...fields,
  };
}

export const CATALOG: readonly Promotion[] = [
  brand("Adidas"),
  brand("Coto", {
    subtitulo: "Supermercados",
    beneficio: "25% de ahorro.",
    dias: "Martes",
    provincias: ["MENDOZA", "SALTA"],
  }),
  brand("Coto", {
    subtitulo: "Supermercados",
    beneficio: "Hasta 12 cuotas",
    dias: "Todos los días",
    provincias: ["MENDOZA", "SALTA"],
  }),
  brand("Disco", { subtitulo: "Supermercados", beneficio: "Hasta 6 cuotas", dias: "Lunes" }),
  brand("Farmacia Del Pueblo", { subtitulo: "Farmacias", provincias: [] }),
  brand("Puppis", { subtitulo: "Mascotas", provincias: ["SALTA"] }),
];

const LOCATIONS = [
  { nombre: "MENDOZA", localidades: ["LUJAN", "GODOY CRUZ"] },
  { nombre: "SALTA", localidades: [] },
  { nombre: "NEUQUEN", localidades: [] },
];

export interface EditorCloud extends AppAnswers {
  readonly catalog?: readonly Promotion[] | Answer;
  readonly blocks?: readonly PaintedBlock[];
  readonly fetchLogo?: (file: string) => Promise<Blob>;
  readonly edge?: Answer;
  readonly picker?: Partial<PromotionPicker>;
}

export function editorAnswers(cloud: EditorCloud = {}): AppAnswers {
  const { catalog = CATALOG, blocks = [LOGO_A, LOGO_B, LOGO_C, DAYS_TEXT], edge, ...rest } = cloud;
  return {
    ...rest,
    profile: rest.profile ?? ADVISOR,
    files: {
      "_opciones.json": { opts: [{ n: OPTION, nombre: "Combustible", solapa: "flyer" }] },
      "_facultades.json": { roles: { asesor: { opcion_9: true, estudio: true } } },
      "_active9.json": { name: "", imageUrl: paintedFlyer(blocks), cfg: {} },
      "_legal9.json": { text: "Legal" },
      ...rest.files,
    },
    tables: {
      promos_galicia_cache: typeof catalog === "function" ? catalog : () => jsonResponse(catalog),
      promos_modo_cache: () => jsonResponse([]),
      promos_galicia_meta: () =>
        jsonResponse({
          last_sync_at: "2026-10-30T12:00:00Z",
          total: typeof catalog === "function" ? 0 : catalog.length,
          ubicaciones: LOCATIONS,
        }),
      ...rest.tables,
    },
    functions: { "promos-galicia": edge ?? (() => jsonResponse({ data: { ids: [] } })) },
  };
}

/** Opens the editor: the flyer comes up, and the mouse can touch it. */
export async function openEditor(cloud: EditorCloud = {}) {
  const harness = createAppHarness(editorAnswers(cloud));
  harness.storeSession();
  const fetchLogo = cloud.fetchLogo ?? ((file: string) => paintedLogo(file.length * 20 + 60, 60));
  const screen = await render(
    harness.wrap(createElement(EditorStage, { fetchLogo, picker: cloud.picker })),
  );
  return { screen, harness };
}

export function theEditor(): LogoEditor {
  if (!handles.editor) throw new Error("The editor is not open");
  return handles.editor;
}

function canvasOnPage(): Element {
  const canvas = document.querySelector('[data-testid="flyer-canvas"]');
  if (canvas) return canvas;
  throw new Error("The flyer is not on screen");
}

export function client(x: number, y: number): { clientX: number; clientY: number } {
  const point = theEditor().coordinates()?.toClient(x, y);
  if (!point) throw new Error("The flyer is not on screen");
  return { clientX: point.x, clientY: point.y };
}

export interface PressOptions {
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly pointerType?: string;
}

/** A click on a point of the flyer. */
export function touch(x: number, y: number, options: PressOptions = {}): void {
  const at = client(x, y);
  canvasOnPage().dispatchEvent(
    new PointerEvent("pointerdown", { ...at, ...options, button: 0, bubbles: true }),
  );
  document.dispatchEvent(new PointerEvent("pointerup", { ...at, ...options, bubbles: true }));
}

/** Drags from a point to another of the flyer, in steps. */
export function drag(
  from: readonly [number, number],
  to: readonly [number, number],
  options: PressOptions = {},
): void {
  const start = client(from[0], from[1]);
  const end = client(to[0], to[1]);
  canvasOnPage().dispatchEvent(
    new PointerEvent("pointerdown", { ...start, ...options, button: 0, bubbles: true }),
  );
  document.dispatchEvent(new PointerEvent("pointermove", { ...end, ...options, bubbles: true }));
  document.dispatchEvent(new PointerEvent("pointerup", { ...end, ...options, bubbles: true }));
}

export function key(name: string, options: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

export function waitForFlyer(): Promise<void> {
  return vi.waitFor(
    () => {
      expect(theEditor().currentArt()).not.toBe("");
    },
    { timeout: 10_000 },
  );
}
