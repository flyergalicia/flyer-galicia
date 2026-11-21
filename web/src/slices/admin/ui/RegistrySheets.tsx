import { SectionLabel } from "@/shared/ui/index.ts";
import { AdvisorsPane, CompaniesPane } from "@/slices/company-registry/index.ts";
import type { SheetProps } from "./SheetProps.ts";
import styles from "./Panel.module.css";

/** Data → Mis empresas: the same list as Base de datos, with its work kept by the panel. */
export function CompaniesSheet({ work }: SheetProps) {
  return (
    <div data-testid="admin-companies">
      <SectionLabel className={styles.label}>Mis empresas</SectionLabel>
      <CompaniesPane
        isActive
        editor={work.editor}
        dispatchEditor={work.dispatchEditor}
        generatorOpen={work.generatorOpen}
        setGeneratorOpen={work.setGeneratorOpen}
        ask={work.ask}
      />
    </div>
  );
}

/** Data → Mis asesores: the same list as Base de datos. */
export function AdvisorsSheet({ work }: SheetProps) {
  return (
    <div data-testid="admin-advisors">
      <SectionLabel className={styles.label}>Mis asesores</SectionLabel>
      <AdvisorsPane isActive draft={work.draft} dispatch={work.dispatchDraft} ask={work.ask} />
    </div>
  );
}
