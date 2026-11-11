// What a proposal changes, as the card says it.
import {
  cashbackIndex,
  cashbackName,
  categoryLabel,
  officerChanges,
  type OfficerChange,
  type Options,
  sameCategory,
  sanitizeCategory,
} from "@/shared/domain/company-registry/index.ts";
import type { Proposal } from "@/shared/lib/company-registry/proposals-query.ts";

interface Context {
  readonly options: Options;
  readonly cashbackNames: readonly string[];
}

function categoryText(category: unknown, options: Options): string {
  return categoryLabel(category, options) || sanitizeCategory(category).txt || "sin rubro";
}

/**
 * The request of a substitute can also bring cashback and category; null means it does not touch
 * that piece of data.
 */
export function proposalChanges(
  proposal: Pick<
    Proposal,
    "config" | "config_antes" | "rubro" | "rubro_antes" | "asesores_antes" | "asesores"
  >,
  { options, cashbackNames }: Context,
): readonly OfficerChange[] {
  const { config, config_antes: configBefore, rubro, rubro_antes: rubroBefore } = proposal;
  const extra: OfficerChange[] = [];
  if (config != null && config !== configBefore) {
    const before = cashbackName(cashbackIndex(configBefore, cashbackNames), cashbackNames);
    const after = cashbackName(cashbackIndex(config, cashbackNames), cashbackNames);
    extra.push(["Cashback", `${before} → ${after}`]);
  }
  if (rubro && !sameCategory(rubro, rubroBefore)) {
    extra.push([
      "Rubro",
      `${categoryText(rubroBefore, options)} → ${categoryText(rubro, options)}`,
    ]);
  }
  return [...extra, ...officerChanges(proposal.asesores_antes, proposal.asesores)];
}
