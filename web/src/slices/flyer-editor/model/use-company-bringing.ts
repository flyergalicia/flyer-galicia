// What bringing a company of the list does beyond the form: which flyer it goes in, and what has to
// be said about it. The warning of the wrong flyer always comes out on bringing it (invariant 2).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cashbackIndex,
  findByName,
  isBorrowed,
  normalizeName,
  officerCount,
  officersLabel,
  type SearchableCompany,
  versionWithoutCashback,
} from "@/shared/domain/company-registry/index.ts";
import { optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import { hasNoAmounts } from "@/shared/flyer-engine/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { type LoadedOption, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { type CompanyReview, useCompanies } from "@/slices/company-registry/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";
import { baseOption, categoryWarning, type CategoryWarning } from "./category-check.ts";
import { useFlyerForm } from "./form-context.ts";
import { withCompanyBrought } from "./form-state.ts";
import { useFlyerRules } from "./use-flyer-rules.ts";

const AFTER_BRINGING_MS = 120;
const AFTER_CHANGING_FLYER_MS = 150;
const NO_OFFICERS_NOTE = "Esta empresa no tiene oficiales asignados.";

export type CompanyNotice =
  | {
      readonly kind: "category";
      readonly company: SearchableCompany;
      readonly warning: CategoryWarning;
      /** On a download: "Descargar igual" goes on with it. */
      readonly goOn: (() => void) | null;
    }
  | { readonly kind: "no-cashback"; readonly company: SearchableCompany }
  /** It has cashback and this flyer shows no amounts, with nothing to go back to. */
  | { readonly kind: "amounts-elsewhere"; readonly company: SearchableCompany }
  | {
      readonly kind: "show-amounts";
      readonly company: SearchableCompany;
      readonly original: number;
      readonly after: () => void;
    };

export interface CompanyBringingOptions {
  readonly review: CompanyReview;
  readonly choose: (option: number) => Promise<LoadedOption>;
  readonly goToTab: (tabId: string) => void;
}

export function useCompanyBringing({ review, choose, goToTab }: CompanyBringingOptions) {
  const form = useFlyerForm();
  const workspace = useFlyerWorkspace();
  const editor = useLogoEditorActions();
  const { show } = useToast();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  const destination = useFlyerRules();
  const { rows } = useCompanies();
  const [notice, setNotice] = useState<CompanyNotice | null>(null);
  const said = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ rows, options, can, destination, notice });
  useEffect(() => {
    latest.current = { rows, options, can, destination, notice };
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const later = useCallback((run: () => void, wait: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(run, wait);
  }, []);

  /** It says whether it opened the warning: a download waits for its buttons. */
  const checkCategory = useCallback(
    (company: SearchableCompany | null, goOn: (() => void) | null, onBringing: boolean) => {
      const now = latest.current;
      const { option } = workspace.getState().slot;
      if (!company || option === null || !now.can("padron_buscar")) return false;
      const warning = categoryWarning(company, {
        options: now.options,
        can: now.can,
        option,
        tab: optionTab(now.options, option),
      });
      if (!warning || (!onBringing && warning.signature === said.current) || now.notice) {
        return false;
      }
      setNotice({ kind: "category", company, warning, goOn: onBringing ? null : goOn });
      said.current = warning.signature;
      return true;
    },
    [workspace],
  );

  /** A version without cashback, if there is one, or back to the original. */
  const flyerToGoTo = useCallback(
    (cashback: number) => {
      const now = latest.current;
      const { option } = workspace.getState().slot;
      const isFree = !editor.works.activeWork() && editor.cuts().length === 0;
      if (option === null || !isFree) return 0;
      const base = baseOption(option, now.options);
      if (cashback < 0) return versionWithoutCashback(base, now.destination);
      const isVersion = now.options.some(({ n, sinCB }) => n === option && Boolean(sinCB));
      return isVersion &&
        base !== option &&
        now.can(`opcion_${base}`) &&
        now.destination.hasFlyer(base) !== false
        ? base
        : 0;
    },
    [editor, workspace],
  );

  const askAboutAmounts = useCallback(
    (company: SearchableCompany, after: () => void) => {
      const now = latest.current;
      const original = workspace.getState().slot.scene?.calibration.recDe ?? 0;
      const canGoBack =
        editor.cuts().length > 0 ||
        (original > 0 &&
          now.options.some(({ n }) => n === original) &&
          now.can(`opcion_${original}`));
      setNotice(
        canGoBack
          ? { kind: "show-amounts", company, original, after }
          : { kind: "amounts-elsewhere", company },
      );
    },
    [editor, workspace],
  );

  const goToItsFlyer = useCallback(
    (company: SearchableCompany, option: number, cashback: number) => {
      void choose(option).then(({ scene }) => {
        // It did not load: the notice of the flyer already says so.
        if (!scene) return;
        const name = company.empresa || "La empresa";
        const label = optionLabel(latest.current.options, option);
        show(
          cashback < 0
            ? `${name} no tiene cashback: se usa «${label}».`
            : `${name} tiene cashback: se usa «${label}».`,
        );
        later(() => {
          checkCategory(company, null, true);
        }, AFTER_CHANGING_FLYER_MS);
      });
    },
    [checkCategory, choose, later, show],
  );

  const bring = useCallback(
    (company: SearchableCompany) => {
      // Another company: the logos go back to how they come, except inside a draft or a design.
      if (!editor.works.activeWork()) editor.forget();
      const { names } = form.getContext();
      const cashback = cashbackIndex(company.config, names);
      form.update((state) => ({
        ...withCompanyBrought(state, company, cashback),
        note: officerCount(company) > 0 ? "" : NO_OFFICERS_NOTE,
      }));
      review.companyBrought(company);
      said.current = "";
      const from = isBorrowed(company) ? `las empresas de ${company.owner.nombre}` : "tus empresas";
      show(`"${company.empresa || "Empresa"}" cargada de ${from} — ${officersLabel(company)}`);
      const { scene, option } = workspace.getState().slot;
      const drawsNoAmounts = scene ? hasNoAmounts(scene) : false;
      const goTo = flyerToGoTo(cashback);
      const check = () => {
        checkCategory(company, null, true);
      };
      later(() => {
        if (goTo && goTo !== option) goToItsFlyer(company, goTo, cashback);
        else if (cashback < 0 && !drawsNoAmounts) setNotice({ kind: "no-cashback", company });
        else if (cashback < 0) check();
        else if (drawsNoAmounts) askAboutAmounts(company, check);
        else check();
      }, AFTER_BRINGING_MS);
    },
    [
      askAboutAmounts,
      checkCategory,
      editor,
      flyerToGoTo,
      form,
      goToItsFlyer,
      later,
      review,
      show,
      workspace,
    ],
  );

  /** Before a download: it says whether it stopped at the warning. */
  const checkBeforeDownload = useCallback(
    (goOn: () => void) => {
      const { empresa, chosen } = form.getState();
      const name = empresa.trim();
      if (!name) return false;
      const { rows: companies } = latest.current;
      const company =
        chosen &&
        companies.some((row) => row === chosen) &&
        normalizeName(chosen.empresa) === normalizeName(name)
          ? chosen
          : (findByName(companies, name) ?? null);
      return checkCategory(company, goOn, false);
    },
    [checkCategory, form],
  );

  const close = useCallback(() => {
    setNotice(null);
  }, []);

  /** "Ir a …": it keeps what was loaded. */
  const goToWanted = useCallback(
    (wanted: number) => {
      setNotice(null);
      said.current = "";
      if (!wanted) {
        goToTab("flyer");
        show("Cambiado a Flyer Galicia. Descargá de nuevo.");
        return;
      }
      void choose(wanted).then(({ scene }) => {
        if (!scene) return;
        const label = optionLabel(latest.current.options, wanted);
        show(`Cambiado a Flyer Rubros · ${label}. Revisá el cartel y descargá de nuevo.`);
      });
    },
    [choose, goToTab, show],
  );

  return { bring, checkBeforeDownload, notice, close, goToWanted };
}
