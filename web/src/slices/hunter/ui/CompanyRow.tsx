import { type KeyboardEvent, memo, type MouseEvent } from "react";
import { type Company, companySubtitle } from "@/shared/domain/company-registry/index.ts";
import {
  flyerLabel,
  flyerOfCompany,
  flyerWarnings,
  type HunterFlyerRules,
  officerNames,
} from "../model/company-flyer-rules.ts";
import type { OpenProposalStatus } from "../model/use-open-proposals.ts";
import styles from "./HunterView.module.css";

const SEPARATOR = "  ·  ";

interface CompanyRowProps {
  readonly company: Company;
  readonly position: number;
  readonly rules: HunterFlyerRules;
  readonly isSelected: boolean;
  /** Null: the tick is not on the row. */
  readonly isTicked: boolean | null;
  /** With the permission to propose. */
  readonly canPropose: boolean;
  readonly proposalStatus: OpenProposalStatus | undefined;
  readonly onChoose: (company: Company, position: number) => void;
  readonly onTick: (company: Company, on: boolean) => void;
  readonly onPropose: (company: Company) => void;
}

function ProposalState({
  company,
  canPropose,
  proposalStatus,
  onPropose,
}: Pick<CompanyRowProps, "company" | "canPropose" | "proposalStatus" | "onPropose">) {
  if (!canPropose) return null;
  if (proposalStatus === "consulta") {
    return (
      <div className={`${styles.proposalTag} ${styles.proposalQuestion}`} data-part="proposal">
        El oficial te hizo una consulta · tu nombre → Mis propuestas
      </div>
    );
  }
  if (proposalStatus) {
    return (
      <div className={styles.proposalTag} data-part="proposal">
        Propusiste un cambio: pendiente de aprobación
      </div>
    );
  }
  return (
    <button
      type="button"
      className={styles.proposeButton}
      data-part="propose"
      onClick={() => {
        onPropose(company);
      }}
    >
      ✎ Oficiales
    </button>
  );
}

/** The tick and the button of the row do their own: they do not choose the company. */
function isOnItsControls({ target }: MouseEvent): boolean {
  return target instanceof Element && Boolean(target.closest("label, button"));
}

const CHOOSING_KEYS = new Set(["Enter", " "]);

function CompanyRowView({
  company,
  position,
  rules,
  isSelected,
  isTicked,
  canPropose,
  proposalStatus,
  onChoose,
  onTick,
  onPropose,
}: CompanyRowProps) {
  const option = flyerOfCompany(company, rules);
  const canDraw = option > 0;
  const warnings = flyerWarnings(company, option, rules);
  const hasOfficers = company.asesores.some(({ nombre }) => nombre.trim());
  return (
    <div
      className={styles.row}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
      data-testid="hunter-row"
      data-selected={isSelected}
      data-can-draw={canDraw}
      onClick={(event) => {
        if (!isOnItsControls(event)) onChoose(company, position);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.target !== event.currentTarget || !CHOOSING_KEYS.has(event.key)) return;
        event.preventDefault();
        onChoose(company, position);
      }}
    >
      {isTicked !== null && (
        <label className={styles.tickPlace}>
          <input
            type="checkbox"
            className={styles.tick}
            aria-label={`Tildar ${company.empresa}`}
            disabled={!canDraw}
            checked={isTicked}
            onChange={({ target }) => {
              onTick(company, target.checked);
            }}
          />
        </label>
      )}
      <div className={styles.rowBody}>
        <div className={styles.company} data-part="company">
          {company.empresa || "(sin nombre)"}
        </div>
        <div className={styles.subtitle}>{companySubtitle(company, rules.cashbackNames)}</div>
        {hasOfficers && <div className={styles.officers}>{officerNames(company)}</div>}
        <div className={styles.flyerTag} data-part="flyer">
          {flyerLabel(option, rules)}
        </div>
        {warnings.length > 0 && (
          <div className={styles.warnings} data-part="warnings">
            {warnings.join(SEPARATOR)}
          </div>
        )}
        <ProposalState
          company={company}
          canPropose={canPropose}
          proposalStatus={proposalStatus}
          onPropose={onPropose}
        />
      </div>
    </div>
  );
}

export const CompanyRow = memo(CompanyRowView);
