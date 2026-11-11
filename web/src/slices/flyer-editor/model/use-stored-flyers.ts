// A flyer of the history (or the session draft) back on screen, or downloaded again as it was. It
// never comes out on the picture of another flyer (invariant 23): if its flyer does not load or can
// no longer be used, it says so and nothing is downloaded.
import { useCallback } from "react";
import { optionLabel, optionNumber } from "@/shared/domain/flyer-options.ts";
import {
  artFileName,
  artKeyWithCuts,
  type Cut,
  type FlyerScene,
  renderFullResolution,
  saveFlyerPdf,
  sceneForStoredValues,
} from "@/shared/flyer-engine/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { type LoadedOption, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";
import { useFlyerForm } from "./form-context.ts";
import { useGoToOption } from "./use-go-to-option.ts";
import { formOfStored, type HistoryItem, type StoredFlyer } from "./stored-flyer.ts";
import {
  failureText,
  type FlyerDownloadOptions,
  LONG_NOTICE_MS,
  useDownloadBlock,
  useFileNameOf,
} from "./use-flyer-download.ts";
import { useFlyerRecord } from "./use-flyer-record.ts";

const LOADED = "Datos cargados";
const FLYER_CHANGED =
  "El flyer cambió desde entonces: se cargaron los datos, sin el recorte ni los logos.";
const LOGOS_OF_ANOTHER = "Los logos de ese flyer eran de otra versión del flyer y no se cargaron.";
const CUT_DISCARDED = "El flyer cambió desde que se descargó ese: sale sin el recorte.";

export function missingSectionsText(count: number): string {
  const what = count === 1 ? "la sección insertada" : `${String(count)} secciones insertadas`;
  return `No se pudo bajar ${what}: en su lugar queda un espacio vacío. Revisá tu conexión y volvé a abrirlo.`;
}

export interface StoredFlyersOptions extends Pick<FlyerDownloadOptions, "afterDownload"> {
  readonly choose: (option: number) => Promise<LoadedOption>;
  /** It is no row of the list of companies: the review has nothing to compare it against. */
  readonly onFormReplaced: () => void;
  readonly onBackToForm: () => void;
}

export function useStoredFlyers({
  choose,
  onFormReplaced,
  onBackToForm,
  afterDownload,
}: StoredFlyersOptions) {
  const workspace = useFlyerWorkspace();
  const form = useFlyerForm();
  const editor = useLogoEditorActions();
  const { show } = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  const goToOption = useGoToOption(choose);
  const record = useFlyerRecord(afterDownload);
  const blocked = useDownloadBlock();
  const fileNameOf = useFileNameOf();

  /** "" if that option can be used today. */
  const optionProblem = useCallback(
    (raw: number) => {
      const option = raw || 1;
      if (!options.some(({ n }) => n === option)) {
        return "Ese flyer se armó con un formato que ya no existe.";
      }
      return can(`opcion_${option}`)
        ? ""
        : `Ese flyer se armó con «${optionLabel(options, option)}», que hoy no está habilitado para tu perfil.`;
    },
    [can, options],
  );

  const toForm = useCallback(
    (stored: Pick<StoredFlyer, "v" | "ac">) => {
      form.update((state) => formOfStored(state, stored));
      if (stored.v.legal) workspace.setLegal(stored.v.legal);
      onFormReplaced();
      onBackToForm();
      show(LOADED);
    },
    [form, onBackToForm, onFormReplaced, show, workspace],
  );

  /** With its cuts or its logos it opens in a draft, the same as the changes by hand. */
  const openItsChanges = useCallback(
    async ({ v: values, opt }: HistoryItem) => {
      const cuts: readonly Cut[] = values.recortes ?? [];
      const logos = values.logos ?? [];
      if (cuts.length === 0 && logos.length === 0) return;
      const { scene } = workspace.getState().slot;
      if (!scene) return;
      const wholeKey = scene.whole.artKey;
      if (cuts.length > 0 && values.recBase !== artFileName(wholeKey)) {
        show(FLYER_CHANGED);
        return;
      }
      const logosFit = logos.length > 0 && values.logosSrc === artKeyWithCuts(wholeKey, cuts);
      if (logos.length > 0 && !logosFit) show(LOGOS_OF_ANOTHER);
      if (cuts.length === 0 && !logosFit) return;
      await editor.works.openStored({
        option: opt,
        logos: logosFit ? logos : [],
        cuts,
        legal: values.legal ?? null,
      });
    },
    [editor, show, workspace],
  );

  const load = useCallback(
    async (item: HistoryItem) => {
      const problem = optionProblem(item.opt);
      const here = optionLabel(options, workspace.getState().slot.option);
      await goToOption(item.opt);
      toForm(item);
      if (problem) {
        // Without its cuts and logos: they are of another picture.
        show(`${problem} Se cargaron los datos en «${here}».`, LONG_NOTICE_MS);
        return;
      }
      await openItsChanges(item);
    },
    [goToOption, openItsChanges, optionProblem, options, show, toForm, workspace],
  );

  /** It comes out with the picture of then, without touching what is on screen. */
  const sceneOf = useCallback(
    async (scene: FlyerScene, item: HistoryItem) => {
      const stored = await sceneForStoredValues(scene, item.v, {
        loadSection: workspace.sections.fetch,
      });
      if (stored.cropDiscarded) show(CUT_DISCARDED);
      return stored.scene;
    },
    [show, workspace],
  );

  const downloadAgain = useCallback(
    async (item: HistoryItem) => {
      const problem = optionProblem(item.opt);
      if (problem) {
        show(`${problem} No se puede volver a descargar con otro flyer.`, LONG_NOTICE_MS);
        return;
      }
      const cuts = item.v.recortes ?? [];
      await workspace.sections.bring(cuts);
      await goToOption(item.opt);
      const missing = workspace.sections.missing(cuts);
      if (missing > 0) show(missingSectionsText(missing), LONG_NOTICE_MS);
      const { slot } = workspace.getState();
      const reason = blocked();
      if (reason || !slot.scene || slot.option !== optionNumber(options, item.opt)) {
        show(reason, LONG_NOTICE_MS);
        return;
      }
      const canvas = renderFullResolution(await sceneOf(slot.scene, item), item.v, workspace.logos);
      const fileName = fileNameOf(item.v);
      const saved = await saveFlyerPdf(canvas, fileName);
      if (saved.ok) record({ values: item.v, fileName, canvas, format: "pdf" });
      else show(failureText("pdf", saved.error), LONG_NOTICE_MS);
    },
    [blocked, fileNameOf, goToOption, optionProblem, options, record, sceneOf, show, workspace],
  );

  return { load, downloadAgain, goToOption, toForm };
}
