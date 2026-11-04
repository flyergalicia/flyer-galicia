// What Base de datos asks of the flyer editor, which is another slice: generating the ZIP of the
// ticked companies, and knowing which options have a flyer. The app puts this provider around the
// shell when the flyer editor arrives. Until then there is nobody to ask.
import { createContext, useContext } from "react";
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

export function useFlyerGeneration(): FlyerGenerationPort | null {
  return useContext(FlyerGenerationContext);
}
