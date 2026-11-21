import type { RegistryWork } from "@/slices/company-registry/index.ts";

/** What every sheet of the panel receives. */
export interface SheetProps {
  /** What is being done on Mis empresas and Mis asesores lives in the panel. */
  readonly work: RegistryWork;
  /** Closes the panel, asking first about what would be lost, and then does that. */
  readonly closePanel: (then?: () => void) => void;
}
