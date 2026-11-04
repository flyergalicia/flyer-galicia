// Which option goes with the tab on screen, what the empty form draws, and how to come back from a
// failure. It is the only one that decides to go to another option on its own.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type FlyerTab, isFlyerTabId, optionLabel } from "@/shared/domain/flyer-options.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import {
  allowedOptions,
  drawsSingleCashback,
  emptyFormValues,
  firstOptionOf,
  tabOfOption,
  useFlyerWorkspace,
  useWorkspaceValue,
} from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";

function tabOf(tabId: string): FlyerTab {
  return isFlyerTabId(tabId) ? tabId : "flyer";
}

function loadingText(label: string): string {
  return `Cargando ${label}...`;
}

export function useFlyerOnScreen(tabId: string, isActive: boolean) {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  const { configs, names } = useCashbackConfigs();
  const tab = tabOf(tabId);
  const onScreen = useWorkspaceValue((state) => state.slot.option);
  const lastOfTab = useRef(new Map<FlyerTab, number>());

  const allowed = useMemo(() => allowedOptions(options, tab, can), [options, tab, can]);
  const form = useMemo(
    () => emptyFormValues(tab, configs[0], names[0] ?? ""),
    [tab, configs, names],
  );

  const go = useCallback(
    (option: number, announce: boolean) => {
      const optionTabId = tabOfOption(options, option);
      lastOfTab.current.set(optionTabId, option);
      const text = loadingText(optionLabel(options, option));
      if (announce) toast.show(text);
      void workspace.selectOption(option, drawsSingleCashback(optionTabId)).then((loaded) => {
        if (announce) toast.hide(text);
        if (loaded.scene && loaded.legal !== null && !loaded.legal.trim()) {
          toast.show(
            `⚠ ${optionLabel(options, option)} no tiene legal cargado — avisá a la central antes de generar el flyer.`,
          );
        }
      });
    },
    [options, toast, workspace],
  );

  // A person who loses an option goes to the first one left; the same on changing tab.
  useEffect(() => {
    if (!isActive) return;
    if (onScreen !== null && tabOfOption(options, onScreen) === tab && allowed.includes(onScreen)) {
      return;
    }
    go(firstOptionOf(allowed, lastOfTab.current.get(tab)), onScreen !== null);
  }, [allowed, go, isActive, onScreen, options, tab]);

  useEffect(() => {
    workspace.setForm(form);
  }, [form, workspace]);

  const retry = useCallback(() => {
    void workspace.retryLoading(drawsSingleCashback(tab));
  }, [tab, workspace]);

  const failure = useWorkspaceValue((state) => state.slot.failure);
  // A flyer that could not arrive is asked for again when the connection comes back.
  useEffect(() => {
    if (failure !== "network") return undefined;
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
    };
  }, [failure, retry]);

  const choose = useCallback((option: number) => go(option, true), [go]);
  const restore = useCallback(() => {
    workspace.restoreForm(form);
  }, [form, workspace]);

  return { allowed, choose, options, retry, restore, onScreen };
}
