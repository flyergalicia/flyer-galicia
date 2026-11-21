import type { ReactNode } from "react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { companyKey } from "../model/company-flyer-rules.ts";
import type { HunterList } from "../model/use-hunter-list.ts";
import type { OpenProposalStatus } from "../model/use-open-proposals.ts";
import { CompanyRow } from "./CompanyRow.tsx";
import styles from "./HunterView.module.css";

const PROBLEM_TEXT = { companies: "las empresas", flyers: "los flyers" } as const;

interface CompanyListProps {
  readonly list: HunterList;
  readonly selected: number;
  /** Null: the ticks are not on the rows. */
  readonly ticked: ReadonlySet<Company> | null;
  readonly canPropose: boolean;
  readonly statusOf: (company: Company) => OpenProposalStatus | undefined;
  readonly onChoose: (company: Company, position: number) => void;
  readonly onTick: (company: Company, on: boolean) => void;
  readonly onPropose: (company: Company) => void;
}

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.list} data-testid="hunter-list">
      <div className={styles.notice} data-testid="hunter-notice">
        {children}
      </div>
    </div>
  );
}

/** A cut in the network is said as such: it is never "there are no companies" (invariant 24). */
export function CompanyList({
  list,
  selected,
  ticked,
  canPropose,
  statusOf,
  onChoose,
  onTick,
  onPropose,
}: CompanyListProps) {
  const { loading, problem, all, hits, query, rules, retry } = list;
  if (loading) return <div className={styles.list} data-testid="hunter-list" />;
  if (problem) {
    return (
      <Notice>
        No se pudo conectar para traer {PROBLEM_TEXT[problem]}.
        <br />
        <Button variant="soft-neutral" size="xs" onClick={retry}>
          ↻ Reintentar
        </Button>
      </Notice>
    );
  }
  if (all.length === 0) return <Notice>Todavía no hay ninguna empresa cargada.</Notice>;
  if (hits.length === 0) {
    return (
      <Notice>
        <strong>No figura.</strong>
        <br />
        Ninguna de las {all.length} empresas cargadas coincide con «{query.trim()}». Si corresponde,
        pedile al oficial que la cargue.
      </Notice>
    );
  }
  return (
    <div className={styles.list} role="tree" aria-label="Empresas" data-testid="hunter-list">
      {hits.map((company, position) => (
        <CompanyRow
          key={companyKey(company)}
          company={company}
          position={position}
          rules={rules}
          isSelected={position === selected}
          isTicked={ticked ? ticked.has(company) : null}
          canPropose={canPropose}
          proposalStatus={statusOf(company)}
          onChoose={onChoose}
          onTick={onTick}
          onPropose={onPropose}
        />
      ))}
    </div>
  );
}
