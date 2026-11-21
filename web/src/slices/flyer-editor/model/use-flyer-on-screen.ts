// Which option goes with the tab on screen, what the empty form draws, and how to come back from a
// failure. It is the only one that decides to go to another option on its own.
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FLYER_TABS,
  type FlyerTab,
  isFlyerTabId,
  optionLabel,
} from "@/shared/domain/flyer-options.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import {
  allowedOptions,
  drawsSingleCashback,
  firstOptionOf,
  tabOfOption,
  useFlyerWorkspace,
  useWorkspaceValue,
} from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useLogoEditorValue } from "@/slices/logo-editor/index.ts";
import { useFlyerForm } from "./form-context.ts";

function tabOf(tabId: string): FlyerTab {
  return isFlyerTabId(tabId) ? tabId : "flyer";
}

/** The flyers under the copies shared with this person that are open, in order and once each. */
function useSharedFlyers(): readonly number[] {
  const joined = useLogoEditorValue((state) =>
    [...new Set(state.works.filter(({ shared }) => shared).map(({ option }) => option))].join(),
  );
  return useMemo(() => (joined ? joined.split(",").map(Number) : []), [joined]);
}

function loadingText(label: string): string {
  return `Cargando ${label}...`;
}

export function useFlyerOnScreen(
  tabId: string,
  isActive: boolean,
  goToTab: (tabId: string) => void,
) {
  const workspace = useFlyerWorkspace();
  const form = useFlyerForm();
  const toast = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  const { configs, names } = useCashbackConfigs();
  const tab = tabOf(tabId);
  const onScreen = useWorkspaceValue((state) => state.slot.option);
  const lastOfTab = useRef(new Map<FlyerTab, number>());
  // A batch goes through several flyers from one press: it has to know the tab of now, not of then.
  const here = useRef({ tab, isActive });
  useEffect(() => {
    here.current = { tab, isActive };
  });

  const allowed = useMemo(() => allowedOptions(options, tab, can), [options, tab, can]);
  const sharedFlyers = useSharedFlyers();
  const worksOf = useMemo(
    () => [
      ...allowed,
      ...sharedFlyers.filter(
        (option) => tabOfOption(options, option) === tab && !allowed.includes(option),
      ),
    ],
    [allowed, options, sharedFlyers, tab],
  );
  const tabBefore = useRef(tab);

  const go = useCallback(
    (option: number, announce: boolean) => {
      const optionTabId = tabOfOption(options, option);
      lastOfTab.current.set(optionTabId, option);
      const text = loadingText(optionLabel(options, option));
      if (announce) toast.show(text);
      // A batch can go through the flyers with another screen in front: it stays there.
      if (here.current.isActive && optionTabId !== here.current.tab) goToTab(optionTabId);
      return workspace.selectOption(option, drawsSingleCashback(optionTabId)).then((loaded) => {
        if (announce) toast.hide(text);
        if (loaded.scene && loaded.legal !== null && !workspace.getState().legal.trim()) {
          toast.show(
            `⚠ ${optionLabel(options, option)} no tiene legal cargado — avisá a la central antes de generar el flyer.`,
          );
        }
        return loaded;
      });
    },
    [goToTab, options, toast, workspace],
  );

  // A person who loses an option goes to the first one left; the same on changing tab.
  useEffect(() => {
    const tabChanged = tabBefore.current !== tab;
    tabBefore.current = tab;
    if (!isActive) return;
    if (onScreen !== null && tabOfOption(options, onScreen) === tab && allowed.includes(onScreen)) {
      return;
    }
    // A copy that was shared stays on its flyer until it is closed, or another tab is chosen.
    if (onScreen !== null && sharedFlyers.includes(onScreen)) {
      if (!tabChanged || tabOfOption(options, onScreen) === tab) return;
    }
    if (allowed.length === 0) {
      // A tab with nothing of this person: where they have something, if they have it.
      const elsewhere = FLYER_TABS.flatMap((other) => allowedOptions(options, other, can))[0];
      if (elsewhere !== undefined) {
        goToTab(tabOfOption(options, elsewhere));
        return;
      }
    }
    void go(firstOptionOf(allowed, lastOfTab.current.get(tab)), onScreen !== null);
  }, [allowed, can, go, goToTab, isActive, onScreen, options, sharedFlyers, tab]);

  useEffect(() => {
    form.setContext({ configs, names, tab });
  }, [configs, form, names, tab]);

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

  return { allowed, worksOf, choose, options, retry, onScreen, tab };
}
