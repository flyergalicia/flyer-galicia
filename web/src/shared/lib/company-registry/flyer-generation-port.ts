// What Base de datos asks of the flyer editor, which is another slice: generating the ZIP of the
// ticked companies, and knowing which options have a flyer. The app puts the host around the shell,
// and the editor, once it is on the page, says it is there.
import { createContext, useContext, useEffect } from "react";
import type { Company } from "@/shared/domain/company-registry/company.ts";

export type FlyerFileFormat = "pdf" | "png";

export interface GenerationProgress {
  readonly percent: number;
  readonly text: string;
}

export interface FlyerGenerationRequest {
  readonly companies: readonly Company[];
  readonly format: FlyerFileFormat;
  readonly onProgress: (progress: GenerationProgress) => void;
}

export interface FlyerGenerationPort {
  /** Whether that option has a flyer; undefined when nobody knows yet. */
  readonly hasFlyer: (option: number) => boolean | undefined;
  /** A batch is running: nothing that holds it can close meanwhile. */
  readonly isGenerating: () => boolean;
  /** `_pgGenerarRows`: it asks for confirmation, generates, downloads and tells how it went. */
  readonly generate: (request: FlyerGenerationRequest) => Promise<void>;
}

export const FlyerGenerationContext = createContext<FlyerGenerationPort | null>(null);

/** Where the editor says it is there; a test of the editor alone has nobody to tell. */
export const FlyerGenerationAttachContext = createContext<
  ((works: FlyerGenerationPort) => () => void) | null
>(null);

export function useFlyerGeneration(): FlyerGenerationPort | null {
  return useContext(FlyerGenerationContext);
}

export function useAttachFlyerGeneration(works: FlyerGenerationPort): void {
  const attach = useContext(FlyerGenerationAttachContext);
  useEffect(() => attach?.(works), [attach, works]);
}

/** How another batch is watched: it gives what stops watching it. */
export type WatchBatch = (isRunning: () => boolean) => () => void;

/**
 * A batch that is not of the editor (the ZIP of the Hunter, on its own flyer) also counts as generating:
 * `_pgBusy` was one for all of them.
 */
export const FlyerBatchWatchContext = createContext<WatchBatch | null>(null);

export function useWatchFlyerBatch(isRunning: () => boolean): void {
  const watch = useContext(FlyerBatchWatchContext);
  useEffect(() => watch?.(isRunning), [watch, isRunning]);
}
