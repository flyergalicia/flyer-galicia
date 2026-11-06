import { type ReactNode, useEffect, useRef, useState } from "react";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { optionHasFlyer } from "@/shared/lib/flyer-workspace/option-active.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { createFlyerGenerationHub, type FlyerGenerationHub } from "./flyer-generation-hub.ts";
import {
  FlyerBatchWatchContext,
  FlyerGenerationAttachContext,
  FlyerGenerationContext,
} from "./flyer-generation-port.ts";

/** A while after entering, once the screen is quiet. */
const CHECK_AFTER_MS = 6000;
const COULD_NOT_PREPARE = "No se pudo preparar el ZIP. Revisá la conexión y probá de nuevo.";

/**
 * Finds out, in no hurry, which options of this person have a flyer: so the automatic choice (the
 * search, Generar flyers, Masivo) does not send a company to an empty option. The Hunter asks for
 * them on its own screen.
 */
function useFlyersCheck(hub: FlyerGenerationHub, checkAfterMs: number): void {
  const { bucket } = useBackend();
  const { can, isHunter } = usePermissions();
  const { options, settled } = useFlyerOptions();
  const latest = useRef({ options, can });
  useEffect(() => {
    latest.current = { options, can };
  });
  useEffect(() => {
    if (isHunter || !settled) return undefined;
    const timer = setTimeout(() => {
      const unknown = latest.current.options
        .map(({ n }) => n)
        .filter((n) => latest.current.can(`opcion_${n}`) && hub.hasFlyer(n) === undefined);
      void Promise.all(
        unknown.map(async (n) => [n, await optionHasFlyer(bucket, n)] as const),
      ).then((answers) => {
        const firm = answers.flatMap(([n, has]) => (has === null ? [] : [[n, has] as const]));
        hub.noteCheck(new Map(firm), firm.length < answers.length);
      });
    }, checkAfterMs);
    return () => {
      clearTimeout(timer);
    };
  }, [bucket, checkAfterMs, hub, isHunter, settled]);
}

interface FlyerGenerationHostProps {
  /** Says that the editor has to be on the page, even if its tab is not the one chosen. */
  readonly onNeedEditor: () => void;
  /** For a test: how long it waits to find out. */
  readonly checkAfterMs?: number;
  readonly children: ReactNode;
}

export function FlyerGenerationHost({
  onNeedEditor,
  checkAfterMs = CHECK_AFTER_MS,
  children,
}: FlyerGenerationHostProps) {
  const { show } = useToast();
  const [hub] = useState(() =>
    createFlyerGenerationHub({
      openEditor: onNeedEditor,
      onEditorNotThere: () => {
        show(COULD_NOT_PREPARE);
      },
    }),
  );
  useFlyersCheck(hub, checkAfterMs);
  const { options } = useFlyerOptions();
  useEffect(
    () =>
      registerProbe("flyerKnowledge", () => ({
        ...hub.check(),
        hasFlyer: Object.fromEntries(
          options.flatMap(({ n }) => {
            const has = hub.hasFlyer(n);
            return has === undefined ? [] : [[n, has]];
          }),
        ),
        answer: hub.hasFlyer,
        isGenerating: hub.isGenerating,
      })),
    [hub, options],
  );
  return (
    <FlyerGenerationContext.Provider value={hub}>
      <FlyerGenerationAttachContext.Provider value={hub.attach}>
        <FlyerBatchWatchContext.Provider value={hub.watchBatch}>
          {children}
        </FlyerBatchWatchContext.Provider>
      </FlyerGenerationAttachContext.Provider>
    </FlyerGenerationContext.Provider>
  );
}
