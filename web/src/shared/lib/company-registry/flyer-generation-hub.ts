// The one that answers Base de datos. It knows of the editor when the editor is on the page, and what
// the check of which options have a flyer found out, with or without it. A failure to ask is no answer
// (invariant 24): only firm answers are written down.
import type {
  FlyerGenerationPort,
  FlyerGenerationRequest,
  WatchBatch,
} from "./flyer-generation-port.ts";

const WAITING_FOR_THE_EDITOR_MS = 30_000;

export interface FlyerGenerationHub extends FlyerGenerationPort {
  readonly attach: (works: FlyerGenerationPort) => () => void;
  /** Another batch (the ZIP of the Hunter): while it runs, it is generating too. */
  readonly watchBatch: WatchBatch;
  /** What a check found out. */
  readonly noteCheck: (found: ReadonlyMap<number, boolean>, failed: boolean) => void;
  /** Nobody asked it yet, or it was asked and it answered. */
  readonly check: () => { readonly done: boolean; readonly failed: boolean };
}

export interface FlyerGenerationHubOptions {
  /** Base de datos can be open while the editor has never been on the page. */
  readonly openEditor: () => void;
  readonly onEditorNotThere: () => void;
  readonly waitMs?: number;
}

export function createFlyerGenerationHub({
  openEditor,
  onEditorNotThere,
  waitMs = WAITING_FOR_THE_EDITOR_MS,
}: FlyerGenerationHubOptions): FlyerGenerationHub {
  let works: FlyerGenerationPort | null = null;
  let onArrival: (() => void) | null = null;
  const known = new Map<number, boolean>();
  const batches = new Set<() => boolean>();
  let done = false;
  let failed = false;

  const editor = (): Promise<FlyerGenerationPort | null> => {
    if (works) return Promise.resolve(works);
    openEditor();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        onArrival = null;
        resolve(null);
      }, waitMs);
      onArrival = () => {
        clearTimeout(timer);
        onArrival = null;
        resolve(works);
      };
    });
  };

  return {
    hasFlyer: (option) => works?.hasFlyer(option) ?? known.get(option),
    isGenerating: () =>
      (works?.isGenerating() ?? false) || Array.from(batches).some((isRunning) => isRunning()),
    generate: async (request: FlyerGenerationRequest) => {
      const ready = await editor();
      if (ready) await ready.generate(request);
      else onEditorNotThere();
    },
    attach: (next) => {
      works = next;
      onArrival?.();
      return () => {
        if (works === next) works = null;
      };
    },
    watchBatch: (isRunning) => {
      batches.add(isRunning);
      return () => {
        batches.delete(isRunning);
      };
    },
    noteCheck: (found, hasFailed) => {
      for (const [option, has] of found) known.set(option, has);
      done = true;
      failed = hasFailed;
    },
    check: () => ({ done, failed }),
  };
}
