import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { destinationOf } from "@/shared/domain/company-registry/index.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { formatAmount } from "@/shared/flyer-engine/index.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { useOptionOnScreen } from "@/shared/lib/option-on-screen/option-on-screen-context.ts";
import { usePrimaryAction } from "@/shared/lib/primary-action/primary-action-context.ts";
import { useAttachFlyerGeneration } from "@/shared/lib/company-registry/flyer-generation-port.ts";
import {
  BATCH_RUNNING_NOTICE,
  FlyerWorkspaceProvider,
  type LoadedOption,
  useCompanyBatch,
  useFlyerHasNoAmounts,
  useFlyerWorkspace,
  useWorkspaceValue,
} from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useCompanyReview } from "@/slices/company-registry/index.ts";
import {
  LogoEditorAdjustBars,
  LogoEditorBar,
  LogoEditorLayer,
  LogoEditorProvider,
  useAttachDesignWorks,
  useLogoEditorActions,
} from "@/slices/logo-editor/index.ts";
import { useFlyerForm } from "../model/form-context.ts";
import { categoryForReview, officersForReview, restoredForm } from "../model/form-state.ts";
import { useCompanyBringing } from "../model/use-company-bringing.ts";
import { useFlyerDownload } from "../model/use-flyer-download.ts";
import { useFlyerOnScreen } from "../model/use-flyer-on-screen.ts";
import { useFlyerRules } from "../model/use-flyer-rules.ts";
import { useFlyerShare } from "../model/use-flyer-share.ts";
import { useGoToOption } from "../model/use-go-to-option.ts";
import { useIsPhone } from "../model/use-is-phone.ts";
import { usePreviewWindow } from "../model/use-preview-window.ts";
import { useSessionDraft } from "../model/use-session-draft.ts";
import { useStoredFlyers } from "../model/use-stored-flyers.ts";
import { CompanyNotices } from "./CompanyNotices.tsx";
import { DraftOffer } from "./DraftOffer.tsx";
import { EditorPanels, type EditorTab } from "./EditorPanels.tsx";
import { FlyerFormProvider } from "./FlyerFormProvider.tsx";
import { FlyerOptionBar } from "./FlyerOptionBar.tsx";
import { FlyerPreviewPane } from "./FlyerPreviewPane.tsx";
import { LoadProblemNotice } from "./LoadProblemNotice.tsx";
import { BulkPanel } from "./BulkPanel.tsx";
import { PhonePill } from "./PhonePill.tsx";
import { PreviewWindow } from "./PreviewWindow.tsx";
import styles from "./FlyerEditorView.module.css";

const NOBODY = () => undefined;
const DEFAULT_CAP = "$24.000";

function useReadForm() {
  const form = useFlyerForm();
  const workspace = useFlyerWorkspace();
  return useCallback(() => {
    const state = form.getState();
    return {
      empresa: state.empresa,
      cashback: state.noCashback ? -1 : state.cashback,
      officers: officersForReview(state),
      officersShown: state.officersOn,
      category: categoryForReview(
        state,
        form.getContext().tab,
        workspace.getState().slot.option ?? 0,
      ),
    };
  }, [form, workspace]);
}

/** Promociones starts its "Vigilar" bar on the flyer open here. */
function useReportOptionOnScreen(): void {
  const report = useOptionOnScreen();
  const option = useWorkspaceValue((state) => state.slot.option);
  useEffect(() => {
    if (option !== null) report.set(option);
  }, [option, report]);
}

/** A design opened with an empty form brings the name of its company. */
function useWorkCompany(): void {
  const form = useFlyerForm();
  const logoEditor = useLogoEditorActions();
  useEffect(
    () =>
      logoEditor.works.onOpened(({ company }) => {
        if (company && !form.getState().empresa.trim()) {
          form.update((state) => ({ ...state, empresa: company }));
        }
      }),
    [form, logoEditor],
  );
}

/** The batches of this editor: the ZIP of the companies, and what Base de datos asks of it. */
function useBatches(choose: (option: number) => Promise<LoadedOption>) {
  const workspace = useFlyerWorkspace();
  const form = useFlyerForm();
  const { can } = usePermissions();
  const rules = useFlyerRules();
  const goTo = useGoToOption(choose);
  const goBack = useCallback(
    (option: number) => {
      if (workspace.getState().slot.option !== option && can(`opcion_${option}`)) {
        void choose(option);
      }
    },
    [can, choose, workspace],
  );
  const companyBatch = useCompanyBatch({
    rules,
    optionOf: (company) => destinationOf(company, rules),
    goTo,
    goBack,
    formCap: () => formatAmount(form.getState().cap) || DEFAULT_CAP,
  });
  const { generate } = companyBatch;
  const works = useMemo(
    () => ({ hasFlyer: workspace.hasFlyer, isGenerating: workspace.batch.isRunning, generate }),
    [generate, workspace],
  );
  useAttachFlyerGeneration(works);
  return { goTo, goBack, companyBatch };
}

function Editor({ isActive, tabId, goToTab = NOBODY, openMenuWindow = NOBODY }: ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const individualRef = useRef<HTMLDivElement>(null);
  const form = useFlyerForm();
  const workspace = useFlyerWorkspace();
  const logoEditor = useLogoEditorActions();
  const { show } = useToast();
  const { titles } = useScreenTitles();
  const hasNoAmounts = useFlyerHasNoAmounts();
  const isPhone = useIsPhone();
  const [panel, setPanel] = useState<EditorTab>("individual");
  const { allowed, choose, options, retry, tab, worksOf } = useFlyerOnScreen(
    tabId,
    isActive,
    goToTab,
  );
  useReportOptionOnScreen();
  useAttachDesignWorks({
    goToTab,
    chooseFlyer: (option) => {
      if (logoEditor.works.chooseFlyer(option)) void choose(option);
    },
  });
  useWorkCompany();
  const readForm = useReadForm();
  const onNote = useCallback(
    (note: string) => {
      form.update((state) => ({ ...state, note }));
    },
    [form],
  );
  const review = useCompanyReview({ readForm, onNote });
  const bringing = useCompanyBringing({ review, choose, goToTab });
  const hooks = {
    checkBefore: bringing.checkBeforeDownload,
    afterDownload: review.reviewAfterDownload,
  };
  const { download, busy, saveShown } = useFlyerDownload(hooks);
  const sharing = useFlyerShare(hooks);
  const { goTo, goBack, companyBatch } = useBatches(choose);
  const stored = useStoredFlyers({
    choose,
    afterDownload: review.reviewAfterDownload,
    onFormReplaced: review.companyForgotten,
    onBackToForm: () => {
      setPanel("individual");
    },
  });
  const draft = useSessionDraft({ panel: individualRef, stored });
  const preview = usePreviewWindow();
  const { shown } = preview;
  // A crop of the flyer on screen: so it is told, and the way back is letting it go.
  const isCropped = useWorkspaceValue((state) => (state.slot.scene?.cuts.length ?? 0) > 0);
  usePrimaryAction(() => {
    void download("pdf");
  }, isActive);

  const restore = () => {
    logoEditor.forget();
    form.update(restoredForm);
    review.companyForgotten();
    workspace.restoreForm(workspace.getState().form);
    draft.clear();
  };

  return (
    <div className={styles.layout}>
      <div className={styles.panel} data-scrolling-panel="" data-no-amounts={hasNoAmounts}>
        <div className={styles.title}>{titleOf(titles, tab === "flyer" ? "ptitle" : tab)}</div>
        <FlyerOptionBar
          options={options}
          allowed={allowed}
          worksOf={worksOf}
          onChoose={(option) => {
            if (workspace.batch.isRunning()) show(BATCH_RUNNING_NOTICE);
            else if (logoEditor.works.chooseFlyer(option)) void choose(option);
          }}
        />
        <EditorPanels
          isCategoryTab={tab === "rubros"}
          busy={busy}
          sharing={sharing.sharing}
          canShare={sharing.isOffered}
          tab={panel}
          onTab={setPanel}
          individual={individualRef}
          draftOffer={
            draft.offer && (
              <DraftOffer
                draft={draft.offer}
                onCarryOn={() => {
                  void draft.carryOn();
                }}
                onDiscard={draft.discard}
              />
            )
          }
          bulkPanel={
            <BulkPanel
              goTo={goTo}
              goBack={goBack}
              companyBatch={companyBatch}
              onOpenDatabase={() => {
                openMenuWindow("database");
              }}
            />
          }
          onChooseCompany={bringing.bring}
          onOpenDatabase={() => {
            openMenuWindow("database");
          }}
          onPreview={preview.open}
          onDownload={(kind) => {
            void download(kind);
          }}
          onShare={() => {
            sharing.share();
          }}
          onRestore={restore}
          onLoadFromHistory={(item) => {
            void stored.load(item);
          }}
          onDownloadFromHistory={(item) => {
            void stored.downloadAgain(item);
          }}
        />
      </div>
      <FlyerPreviewPane
        canvasRef={canvasRef}
        paneRef={paneRef}
        bar={<LogoEditorBar />}
        problem={<LoadProblemNotice options={options} onRetry={retry} />}
        layer={<LogoEditorLayer canvasRef={canvasRef} isActive={isActive} />}
        foot={<LogoEditorAdjustBars />}
      />
      {isActive && isPhone && (
        <PhonePill
          onDownload={() => {
            void download("pdf");
          }}
        />
      )}
      {shown && (
        <PreviewWindow
          picture={shown.picture}
          canShare={sharing.isOffered}
          onClose={preview.close}
          onPdf={() => {
            preview.close();
            void saveShown("pdf", shown.canvas);
          }}
          onPng={() => {
            preview.close();
            void saveShown("png", shown.canvas);
          }}
          onShare={() => {
            preview.close();
            sharing.share(shown.canvas);
          }}
        />
      )}
      {review.dialog}
      {companyBatch.dialogs}
      <CompanyNotices
        notice={bringing.notice}
        isCropped={isCropped}
        onClose={bringing.close}
        onGoToWanted={bringing.goToWanted}
        onShowAmounts={(original, company) => {
          if (logoEditor.cuts().length > 0) logoEditor.backToWhole();
          else if (logoEditor.works.chooseFlyer(original)) void choose(original);
          show(`Listo: el flyer vuelve a mostrar los importes de ${company || "la empresa"}.`);
        }}
      />
    </div>
  );
}

/** The flyer editor: the form, the flyer it draws, and Masivo and Historial in their panels. */
export function FlyerEditorView(props: ViewProps) {
  const { goToTab = NOBODY } = props;
  return (
    <FlyerWorkspaceProvider>
      <LogoEditorProvider goToTab={goToTab}>
        <FlyerFormProvider>
          <Editor {...props} />
        </FlyerFormProvider>
      </LogoEditorProvider>
    </FlyerWorkspaceProvider>
  );
}
