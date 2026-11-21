import type { ViewProps } from "@/shared/lib/view-props.ts";
import { PromotionsPanel } from "./PromotionsPanel.tsx";
import { PromotionsProvider } from "./PromotionsProvider.tsx";
import { PromotionsResults } from "./PromotionsResults.tsx";
import styles from "./PromotionsView.module.css";

/** Promociones: Buscar validates the brands of a flyer, Activas lists what is current in a zone. */
export function PromotionsView({ isActive }: ViewProps) {
  return (
    <PromotionsProvider isActive={isActive}>
      <div className={styles.view}>
        <PromotionsPanel />
        <PromotionsResults />
      </div>
    </PromotionsProvider>
  );
}
