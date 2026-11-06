// Test support: the screen of the Hunter over a simulated cloud.
import { render } from "vitest-browser-react";
import {
  type CommercialDesk,
  CommercialDeskContext,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import {
  FlyerBatchWatchContext,
  type WatchBatch,
} from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { LOGO_A, paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { HunterStage } from "./HunterStage.tsx";

type Row = Readonly<Record<string, unknown>>;

export const OWNER = "o1";

export function company(empresa: string, fields: Row = {}): Row {
  return {
    id: empresa,
    user_id: OWNER,
    empresa,
    cuits: ["30711111111"],
    config: "BAU",
    asesores: [{ nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@bancogalicia.com.ar" }],
    rubro: {},
    ...fields,
  };
}

export function flyerFiles() {
  const image = paintedFlyer([LOGO_A]);
  return {
    "_opciones.json": {
      opts: [
        { n: 9, nombre: "Combustible", solapa: "flyer" },
        { n: 8, nombre: "Rubro viejo", solapa: "rubros", rubro: "combustible" },
        { n: 11, nombre: "Rubro nuevo", solapa: "rubros", rubro: "combustible", reemplaza: 8 },
        { n: 12, nombre: "Súper", solapa: "rubros", rubro: "supermercado" },
        { n: 5, nombre: "Sueldo", solapa: "sueldo" },
      ],
    },
    "_active9.json": { imageUrl: image, cfg: {} },
    "_legal9.json": { text: "Legal de la nueve" },
    "_active8.json": { imageUrl: image, cfg: {} },
    "_legal8.json": { text: "Legal viejo" },
    "_active11.json": { imageUrl: image, cfg: {} },
    "_legal11.json": { text: "Legal nuevo" },
    "_active12.json": { imageUrl: null },
    "_legal12.json": { text: "" },
    "_active5.json": { imageUrl: image, cfg: {} },
    "_legal5.json": { text: "" },
  };
}

export interface HunterCloud extends AppAnswers {
  /** Who the screen talks to about Gestiones. */
  readonly desk?: CommercialDesk;
  readonly companies?: readonly Row[] | Answer;
  readonly proposals?: readonly Row[] | Answer;
  readonly permissions?: Readonly<Record<string, boolean>>;
  /** Who watches the batches of the page: the shell, for the search of screens. */
  readonly watchBatch?: WatchBatch;
}

function answerOf(rows: readonly Row[] | Answer | undefined): Answer {
  if (typeof rows === "function") return rows;
  return () => jsonResponse(rows ?? []);
}

export function hunterHarness(cloud: HunterCloud = {}) {
  const { companies, proposals, permissions = { opcion_9: true }, files, tables, ...rest } = cloud;
  /** What the bucket has: a test can change it on the way. */
  const bucketFiles: Record<string, unknown> = {
    ...flyerFiles(),
    "_facultades.json": { roles: { hunter: permissions } },
    ...files,
  };
  const harness = createAppHarness({
    ...rest,
    profile: { ...ADVISOR, role: "hunter", full_name: "Hunter Inventado" },
    files: bucketFiles,
    tables: {
      padron_empresas: answerOf(companies),
      padron_propuestas: answerOf(proposals),
      ...tables,
    },
  });
  harness.storeSession();
  return { harness, bucketFiles };
}

export async function openHunter(
  { desk, watchBatch, ...cloud }: HunterCloud = {},
  isActive = true,
) {
  const { harness, bucketFiles } = hunterHarness(cloud);
  const view = (active: boolean) =>
    harness.wrap(
      <FlyerBatchWatchContext.Provider value={watchBatch ?? null}>
        {desk ? (
          <CommercialDeskContext.Provider value={desk}>
            <HunterStage isActive={active} />
          </CommercialDeskContext.Provider>
        ) : (
          <HunterStage isActive={active} />
        )}
      </FlyerBatchWatchContext.Provider>,
    );
  const screen = await render(view(isActive));
  return {
    screen,
    harness,
    bucketFiles,
    show: (active: boolean) => screen.rerender(view(active)),
  };
}
