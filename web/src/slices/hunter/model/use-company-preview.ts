// A company of the list, on its flyer: it reuses what makes the ZIP, so there is not a second way of
// making a flyer. One at a time. It does not go through the download of the editor on purpose: that
// one offers to add or update the company, which is what a Hunter cannot do. It writes nothing but
// the log of the download.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import {
  detailOf,
  type FlyerScene,
  type FlyerValues,
  renderFullResolution,
  safeFileName,
  saveFlyerPdf,
} from "@/shared/flyer-engine/index.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { companyFlyer } from "@/shared/lib/flyer-workspace/company-flyer.ts";
import {
  BATCH_RUNNING_NOTICE,
  drawsSingleCashback,
  type LoadedOption,
  sceneOnScreen,
  useFlyerWorkspace,
} from "@/shared/lib/flyer-workspace/index.ts";
import { logFlyerUse, usesSecondCapOn } from "@/shared/lib/flyer-workspace/usage-log.ts";
import { createLibraryLoader, type LibraryLoader } from "@/shared/lib/library-loader.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  DEFAULT_CAP,
  flyerOfCompany,
  flyerWarnings,
  type HunterFlyerRules,
} from "./company-flyer-rules.ts";

const JPEG_QUALITY = 0.9;
const CHOOSE_ONE = "Elegí una empresa de la lista para ver su flyer.";
const WORKING = "Armando el flyer…";
const SEPARATOR = "  ·  ";

/** What the place of the preview says, while there is no flyer to show. */
export interface PreviewMessage {
  readonly title?: string;
  readonly detail: string;
}

export interface FlyerShown {
  readonly picture: string;
  readonly canvas: HTMLCanvasElement;
  readonly values: FlyerValues;
  readonly scene: FlyerScene;
  readonly option: number;
  readonly fileName: string;
}

export type PreviewState =
  | { readonly kind: "message"; readonly message: PreviewMessage }
  | { readonly kind: "shown"; readonly flyer: FlyerShown };

const NOTHING_CHOSEN: PreviewState = { kind: "message", message: { detail: CHOOSE_ONE } };
const IN_THE_MAKING: PreviewState = { kind: "message", message: { detail: WORKING } };

function stopped(title: string, detail: string): PreviewState {
  return { kind: "message", message: { title, detail } };
}

export const PDF_LIBRARY: LibraryLoader<unknown> = createLibraryLoader(() => import("jspdf"));

interface PreviewOptions {
  readonly rules: HunterFlyerRules;
  readonly noteHasNoFlyer: (option: number) => void;
  /** A new company starts at 100%. */
  readonly onNewFlyer: () => void;
  readonly library?: LibraryLoader<unknown>;
}

export function useCompanyPreview({
  rules,
  noteHasNoFlyer,
  onNewFlyer,
  library = PDF_LIBRARY,
}: PreviewOptions) {
  const workspace = useFlyerWorkspace();
  const { db } = useBackend();
  const session = useSession();
  const { show, hide } = useToast();
  const { configs, names } = useCashbackConfigs();
  const [state, setState] = useState<PreviewState>(NOTHING_CHOSEN);
  const [making, setMaking] = useState(false);
  const busy = useRef(false);
  const saving = useRef(false);
  const userId = session.status === "signed-in" ? session.user.id : null;
  const { options } = rules;

  const flyerOf = useCallback(
    (company: Company, option: number, loaded: LoadedOption): PreviewState => {
      const arrived = sceneOnScreen(workspace.getState(), option);
      if (!arrived.ok || loaded.failure) {
        return stopped(
          "No se pudo cargar el flyer.",
          "Revisá la conexión y volvé a elegir la empresa.",
        );
      }
      const { scene, legal } = arrived.value;
      const tab = optionTab(options, option);
      try {
        const { values } = companyFlyer(company, {
          configs,
          names,
          legal,
          singleCashback: drawsSingleCashback(tab),
          hasBenefit: tab === "rubros",
          formCap: DEFAULT_CAP,
        });
        const canvas = renderFullResolution(scene, values, workspace.logos);
        onNewFlyer();
        return {
          kind: "shown",
          flyer: {
            picture: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
            canvas,
            values,
            scene,
            option,
            fileName: `Flyer ${safeFileName(values.empresa || "empresa")}`,
          },
        };
      } catch (cause) {
        console.error("hunter:", cause);
        return stopped("No se pudo armar el flyer.", detailOf(cause));
      }
    },
    [configs, names, onNewFlyer, options, workspace],
  );

  const load = useCallback(
    async (option: number) => {
      const label = optionLabel(options, option);
      const waiting = workspace.hasFlyer(option) === undefined ? `Cargando ${label}...` : null;
      if (waiting) show(waiting);
      const loaded = await workspace.selectOption(
        option,
        drawsSingleCashback(optionTab(options, option)),
      );
      if (waiting) hide(waiting);
      if (loaded.scene && loaded.legal !== null && !workspace.getState().legal.trim()) {
        show(`⚠ ${label} no tiene legal cargado — avisá a la central antes de generar el flyer.`);
      }
      return loaded;
    },
    [hide, options, show, workspace],
  );

  /** It says whether it was taken: while another one is being made, a touch does nothing. */
  const choose = useCallback(
    (company: Company): boolean => {
      if (busy.current) return false;
      if (workspace.batch.isRunning()) {
        show(BATCH_RUNNING_NOTICE);
        return false;
      }
      const option = flyerOfCompany(company, rules);
      if (option <= 0) {
        const why = flyerWarnings(company, option, rules).join(SEPARATOR);
        setState(stopped("No hay flyer para esta empresa.", why));
        return true;
      }
      busy.current = true;
      setMaking(true);
      setState(IN_THE_MAKING);
      void load(option).then((loaded) => {
        busy.current = false;
        setMaking(false);
        if (loaded.failure === "no-flyer") {
          noteHasNoFlyer(option);
          setState(
            stopped(
              "Ese flyer todavía no está cargado.",
              `«${optionLabel(options, option)}» no tiene ningún flyer subido: avisale al administrador.`,
            ),
          );
          return;
        }
        setState(flyerOf(company, option, loaded));
      });
      return true;
    },
    [flyerOf, load, noteHasNoFlyer, options, rules, show, workspace],
  );

  const download = useCallback(async () => {
    if (state.kind !== "shown" || saving.current) return;
    const { canvas, fileName, values, option, scene } = state.flyer;
    saving.current = true;
    try {
      if (!library.isReady()) show("Preparando el PDF…");
      const ready = await library.load().then(
        () => true,
        () => false,
      );
      if (!ready) {
        show("No se pudo preparar el PDF. Revisá la conexión y probá de nuevo.");
        return;
      }
      const saved = await saveFlyerPdf(canvas, fileName);
      if (!saved.ok) {
        show(`No se pudo armar el PDF: ${saved.error.detail}`);
        return;
      }
      if (userId) {
        void logFlyerUse(db, userId, {
          values,
          fileName,
          format: "pdf",
          option,
          usesSecondCap: usesSecondCapOn(scene),
        });
      }
      show("Flyer descargado");
    } finally {
      saving.current = false;
    }
  }, [db, library, show, state, userId]);

  useEffect(
    () =>
      registerProbe("hunterPreview", () => ({
        values: state.kind === "shown" ? state.flyer.values : null,
      })),
    [state],
  );

  return { state, making, choose, download };
}
