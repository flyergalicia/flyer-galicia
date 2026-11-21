// Test support: Cambiar logos over the canvas of the flyer, as the flyer editor puts it.
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { createFlyerPreview } from "@/shared/flyer-engine/index.ts";
import { FlyerWorkspaceProvider, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import {
  type PromotionPicker,
  PromotionPickerContext,
} from "@/shared/lib/promotions/promotion-picking.ts";
import { usePermissions, useSession, useSessionActions } from "@/shared/session/index.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import { LogoEditorAdjustBars } from "../ui/LogoEditorAdjustBars.tsx";
import { LogoEditorBar } from "../ui/LogoEditorBar.tsx";
import { LogoEditorLayer } from "../ui/LogoEditorLayer.tsx";
import { LogoEditorProvider } from "../ui/LogoEditorProvider.tsx";
import { OpenWorksRow } from "../ui/OpenWorksRow.tsx";
import { handles } from "./handles.ts";

const OPTION = 9;
const ALLOWED_OPTIONS = [9, 11];
const SCALE_ROOM = 800;

function Hands() {
  const editor = useLogoEditorActions();
  const filters = usePromotionFiltersPort();
  const session = useSessionActions();
  useEffect(() => {
    handles.editor = editor;
    handles.filters = filters;
    handles.session = session;
  }, [editor, filters, session]);
  return null;
}

function Stage({ children }: { readonly children: ReactNode }) {
  const workspace = useFlyerWorkspace();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return undefined;
    const preview = createFlyerPreview({
      canvas: canvas.current,
      readFrame: workspace.readFrame,
      logos: workspace.logos,
      onDrawn: ({ extra }) => {
        workspace.noteDrawn(extra);
      },
    });
    workspace.attachPreview(preview);
    workspace.fitToWidth(SCALE_ROOM);
    void workspace.selectOption(OPTION, false);
    return () => {
      workspace.attachPreview(null);
    };
  }, [workspace]);
  return (
    <div data-testid="flyer-preview" data-flyer-box="">
      <LogoEditorBar />
      <div style={{ position: "relative", width: "fit-content" }}>
        <canvas ref={canvas} data-testid="flyer-canvas" />
        <LogoEditorLayer canvasRef={canvas} isActive />
      </div>
      <LogoEditorAdjustBars />
      {children}
    </div>
  );
}

function Inside({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return children;
}

/** The sections of a test are painted, with no address of the bucket. */
function anyAddress(): boolean {
  return true;
}

const NO_PICKER: PromotionPicker = {
  pickOneBrand: () => undefined,
  pickManyBrands: () => undefined,
  stopPicking: () => undefined,
};

interface EditorStageProps {
  readonly fetchLogo: (key: string) => Promise<Blob>;
  readonly picker: Partial<PromotionPicker> | undefined;
}

export function EditorStage({ fetchLogo, picker }: EditorStageProps) {
  const whole = useMemo(() => ({ ...NO_PICKER, ...picker }), [picker]);
  return (
    <Inside>
      <PromotionPickerContext.Provider value={whole}>
        <FlyerWorkspaceProvider options={{ fetchLogo, isSectionAddress: anyAddress }}>
          <LogoEditorProvider>
            <Stage>
              <OpenWorksRow allowed={ALLOWED_OPTIONS} />
              <Hands />
            </Stage>
          </LogoEditorProvider>
        </FlyerWorkspaceProvider>
      </PromotionPickerContext.Provider>
    </Inside>
  );
}
