import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFlyerWorkspace, useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import {
  catalogNeverUpdated,
  PROMOTION_CATALOG_QUERY_KEY,
  usePromotionCatalog,
} from "@/shared/lib/promotions/catalog-query.ts";
import { askUpdateCatalog } from "@/shared/lib/promotions/promotions-edge.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import { promotionsProbe } from "@/shared/lib/promotions/promotions-probe.ts";
import { registerProbe, registerProbeIfMissing } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { LogoEditorContext } from "../model/editor-context.ts";
import { logoEditorProbe } from "../model/editor-probe.ts";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { drawsSingleCashback, tabOfOption } from "@/shared/lib/flyer-workspace/index.ts";
import { type PromotionCatalog, shownPromotions } from "@/shared/lib/promotions/catalog-query.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { createLogoEditor, type LogoEditor } from "../model/editor-store.ts";
import type { EditorEnvironment } from "../model/editor-state.ts";

/** What a test reads of the catalog: in Cambiar logos, Promociones may not have been opened. */
function usePromotionsProbe() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const port = usePromotionFiltersPort();
  const includeModo = useIncludeModo();
  const modo = useRef(includeModo);
  useEffect(() => {
    modo.current = includeModo;
  }, [includeModo]);
  useEffect(
    () =>
      registerProbeIfMissing("promotions", () =>
        promotionsProbe(backend, queryClient, { read: () => modo.current }, () => ({
          ...port.read(),
          localityIds: null,
        })),
      ),
    [backend, port, queryClient],
  );
}

/** Entering the mode reads the catalog, so that the window opens with its list ready. */
function useCatalogOnEntering(editor: LogoEditor) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const isOn = useSyncExternalStore(editor.subscribe, () => editor.getState().on);
  const { data: catalog } = usePromotionCatalog(isOn);
  const asked = useRef(false);
  useEffect(() => {
    // A catalog that never updated asks for itself, once.
    if (!isOn || !catalog || !catalogNeverUpdated(catalog) || asked.current) return;
    asked.current = true;
    void askUpdateCatalog(backend).then((answer) => {
      if (answer.ok) {
        void queryClient.invalidateQueries({ queryKey: PROMOTION_CATALOG_QUERY_KEY });
      }
    });
  }, [backend, catalog, isOn, queryClient]);
}

/** What the store asks about who is using it: always what is true at that moment. */
function useEnvironment(): Omit<EditorEnvironment, "workspace" | "notify"> {
  const workspace = useFlyerWorkspace();
  const queryClient = useQueryClient();
  const { options } = useFlyerOptions();
  const { can } = usePermissions();
  const session = useSession();
  const includeModo = useIncludeModo();
  const now = useRef({ options, can, session, includeModo });
  useEffect(() => {
    now.current = { options, can, session, includeModo };
  }, [can, includeModo, options, session]);
  const [environment] = useState(() => ({
    selectOption: (option: number) =>
      workspace.selectOption(option, drawsSingleCashback(tabOfOption(now.current.options, option))),
    personId: () => (now.current.session.status === "signed-in" ? now.current.session.user.id : ""),
    canUseOption: (option: number) =>
      now.current.options.some(({ n }) => n === option) && now.current.can(`opcion_${option}`),
    optionLabel: (option: number) => optionLabel(now.current.options, option),
    catalog: () => {
      const catalog = queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY);
      return {
        all: catalog?.all ?? [],
        shown: shownPromotions(catalog, now.current.includeModo),
      };
    },
  }));
  return environment;
}

/** On entering with a flyer on screen, the drafts of last time are looked for. */
function useDraftsOffer(editor: LogoEditor) {
  const hasFlyer = useWorkspaceValue((state) => state.slot.scene !== null);
  useEffect(() => {
    if (hasFlyer) editor.works.offerSoon();
  }, [editor, hasFlyer]);
  useEffect(() => editor.works.stop, [editor]);
}

export function LogoEditorProvider({ children }: { readonly children: ReactNode }) {
  const workspace = useFlyerWorkspace();
  const queryClient = useQueryClient();
  const toast = useToast();
  const environment = useEnvironment();
  const [editor] = useState(() =>
    createLogoEditor({
      ...environment,
      workspace,
      notify: (text, durationMs) => {
        toast.show(text, durationMs);
      },
    }),
  );
  useCatalogOnEntering(editor);
  useDraftsOffer(editor);
  usePromotionsProbe();
  useEffect(
    () => registerProbe("logoEditor", () => logoEditorProbe(editor, workspace, queryClient)),
    [editor, queryClient, workspace],
  );
  return <LogoEditorContext.Provider value={editor}>{children}</LogoEditorContext.Provider>;
}
