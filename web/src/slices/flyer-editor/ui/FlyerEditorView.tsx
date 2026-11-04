import { useRef } from "react";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { usePrimaryAction } from "@/shared/lib/primary-action/primary-action-context.ts";
import {
  FlyerWorkspaceProvider,
  useFlyerHasNoAmounts,
} from "@/shared/lib/flyer-workspace/index.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { Button } from "@/shared/ui/index.ts";
import {
  LogoEditorAdjustBars,
  LogoEditorBar,
  LogoEditorLayer,
  LogoEditorProvider,
  useLogoEditorActions,
} from "@/slices/logo-editor/index.ts";
import { useFlyerDownload } from "../model/use-flyer-download.ts";
import { useFlyerOnScreen } from "../model/use-flyer-on-screen.ts";
import { FlyerOptionBar } from "./FlyerOptionBar.tsx";
import { FlyerPreviewPane } from "./FlyerPreviewPane.tsx";
import { LoadProblemNotice } from "./LoadProblemNotice.tsx";
import styles from "./FlyerEditorView.module.css";

function Editor({ isActive, tabId }: ViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const { allowed, choose, options, retry, restore } = useFlyerOnScreen(tabId, isActive);
  const { download, busy } = useFlyerDownload();
  const logoEditor = useLogoEditorActions();
  const { titles } = useScreenTitles();
  const hasNoAmounts = useFlyerHasNoAmounts();
  usePrimaryAction(() => {
    void download("pdf");
  }, isActive);

  return (
    <div className={styles.layout}>
      <div className={styles.panel} data-scrolling-panel="" data-no-amounts={hasNoAmounts}>
        <div className={styles.title}>{titleOf(titles, "ptitle")}</div>
        <FlyerOptionBar
          options={options}
          allowed={allowed}
          onChoose={(option) => {
            if (logoEditor.works.chooseFlyer(option)) choose(option);
          }}
        />
        <div className={styles.actions}>
          <Button
            icon="download"
            disabled={busy}
            onClick={() => {
              void download("pdf");
            }}
          >
            {busy ? "Un momento…" : "Descargar PDF"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void download("png");
            }}
          >
            Descargar como imagen
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              logoEditor.forget();
              restore();
            }}
          >
            Restaurar
          </Button>
        </div>
      </div>
      <FlyerPreviewPane
        canvasRef={canvasRef}
        paneRef={paneRef}
        bar={<LogoEditorBar />}
        problem={<LoadProblemNotice options={options} onRetry={retry} />}
        layer={<LogoEditorLayer canvasRef={canvasRef} isActive={isActive} />}
        foot={<LogoEditorAdjustBars />}
      />
    </div>
  );
}

/** The flyer editor, for the moment without its form: see "logo-editor, parte 1" in the notes. */
export function FlyerEditorView(props: ViewProps) {
  return (
    <FlyerWorkspaceProvider>
      <LogoEditorProvider>
        <Editor {...props} />
      </LogoEditorProvider>
    </FlyerWorkspaceProvider>
  );
}
