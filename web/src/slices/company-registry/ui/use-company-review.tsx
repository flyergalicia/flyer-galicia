import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BorrowedCompany,
  type Company,
  findByName,
  isBorrowed,
  normalizeName,
  officerCount,
  parseTaxIds,
  type SearchableCompany,
  taxIdsLine,
} from "@/shared/domain/company-registry/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { askOwnerForChange } from "../api/companies.ts";
import {
  changeOf,
  changeSignature,
  type CompanyChange,
  type FlyerForm,
} from "../model/company-changes.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import { useCompanies, useSaveCompanies, useSubstituteCompanies } from "../model/use-companies.ts";
import {
  AddCompanyDialog,
  SubstituteChangeDialog,
  UpdateCompanyDialog,
} from "./CompanyReviewDialogs.tsx";

/** What the person sees first is the notice of the download. */
const AFTER_DOWNLOAD_MS = 350;
const NO_OFFICERS_NOTE = "Esta empresa no tiene oficiales asignados.";

type OpenDialog =
  | { readonly kind: "update"; readonly change: CompanyChange; readonly form: FlyerForm }
  | {
      readonly kind: "substitute";
      readonly change: CompanyChange;
      readonly owner: BorrowedCompany["owner"];
    }
  | { readonly kind: "new"; readonly form: FlyerForm };

export interface CompanyReviewOptions {
  /** What the form says at the moment of asking. */
  readonly readForm: () => FlyerForm;
  /** The note under the company field. Empty takes it away. */
  readonly onNote?: (note: string) => void;
}

export interface CompanyReview {
  /** A company was brought into the form: from here on, changes are watched against it. */
  readonly companyBrought: (company: SearchableCompany) => void;
  /** The form stopped being that company. */
  readonly companyForgotten: () => void;
  /** After downloading one flyer, never in a batch: it may offer to update, add or ask. */
  readonly reviewAfterDownload: () => void;
  /** Its windows, to put anywhere on the screen. */
  readonly dialog: ReactNode;
}

function sameCompany(one: SearchableCompany, name: string): boolean {
  return normalizeName(one.empresa) === normalizeName(name);
}

/**
 * "Actualizar mis empresas", "Agregar a mis empresas" and "Cambios en una empresa de Pepito". The
 * flyer editor calls this after each download. A company of a substitute is never saved: it is
 * asked of its owner (invariant 25).
 */
export function useCompanyReview({ readForm, onNote }: CompanyReviewOptions): CompanyReview {
  const backend = useBackend();
  const { can } = usePermissions();
  const { show } = useToast();
  const context = useRegistryContext();
  const companies = useCompanies();
  const { rows: borrowed, refreshIfOld } = useSubstituteCompanies();
  const save = useSaveCompanies();
  const [open, setOpen] = useState<OpenDialog | null>(null);
  const reference = useRef<SearchableCompany | null>(null);
  const saidNoTo = useRef("");
  const saidNoToNew = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ companies, borrowed, open, readForm, context });
  useEffect(() => {
    latest.current = { companies, borrowed, open, readForm, context };
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const companyBrought = useCallback((company: SearchableCompany) => {
    reference.current = company;
    saidNoTo.current = "";
  }, []);
  const companyForgotten = useCallback(() => {
    reference.current = null;
    saidNoTo.current = "";
  }, []);

  const noteAbout = useCallback(
    (company: Pick<Company, "asesores">) => {
      onNote?.(officerCount(company) > 0 ? "" : NO_OFFICERS_NOTE);
    },
    [onNote],
  );

  const askAboutChange = useCallback(() => {
    const now = latest.current;
    const company = reference.current;
    if (!company || now.open) return;
    const form = now.readForm();
    const change = changeOf(company, form, now.context);
    if (!change || changeSignature(change) === saidNoTo.current) return;
    setOpen(
      isBorrowed(company)
        ? { kind: "substitute", change, owner: company.owner }
        : { kind: "update", change, form },
    );
  }, []);
  const askAboutNew = useCallback(() => {
    const now = latest.current;
    const form = now.readForm();
    const name = form.empresa.trim();
    if (!name || normalizeName(name) === saidNoToNew.current || now.open) return;
    setOpen({ kind: "new", form });
  }, []);

  const reviewAfterDownload = useCallback(() => {
    const now = latest.current;
    if (!can("padron_buscar") || now.companies.loading) return;
    // A list that could not be read is not an empty one: saving over it would wipe it out.
    if (now.companies.failed && now.companies.rows.length === 0) return;
    const name = now.readForm().empresa.trim();
    if (!name) {
      reference.current = null;
      return;
    }
    const later = (ask: () => void) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(ask, AFTER_DOWNLOAD_MS);
    };
    const current = reference.current;
    if (current && isBorrowed(current) && sameCompany(current, name)) {
      const stillThere = now.borrowed.find(
        (row) => row.owner.id === current.owner.id && sameCompany(row, name),
      );
      if (stillThere) {
        later(askAboutChange);
        return;
      }
    }
    if (
      !current ||
      !now.companies.rows.some((row) => row === current) ||
      !sameCompany(current, name)
    ) {
      const found = findByName(now.companies.rows, name);
      if (found) {
        reference.current = found;
        saidNoTo.current = "";
      } else {
        reference.current = null;
        later(askAboutNew);
        return;
      }
    }
    later(askAboutChange);
  }, [askAboutChange, askAboutNew, can]);

  /** "Not now": it does not ask again until something else changes. */
  const sayNo = useCallback(() => {
    const now = latest.current;
    const form = now.readForm();
    const company = reference.current;
    if (company) {
      const change = changeOf(company, form, now.context);
      if (change) saidNoTo.current = changeSignature(change);
    } else {
      saidNoToNew.current = normalizeName(form.empresa);
    }
    setOpen(null);
  }, []);

  const update = useCallback(
    async (change: CompanyChange, taxIds: string) => {
      const { rows } = latest.current.companies;
      const row = change.company;
      if (!rows.includes(row)) {
        setOpen(null);
        return;
      }
      const updated: Company = {
        ...row,
        config: change.config,
        asesores: change.officers,
        rubro: change.category,
        cuits: parseTaxIds(taxIds),
      };
      // What is saved is a new list: if it cannot be saved, the company stays as it was.
      const saved = await save(rows.map((company) => (company === row ? updated : company)));
      setOpen(null);
      if (!saved) return;
      reference.current = updated;
      saidNoTo.current = "";
      noteAbout(updated);
      show(`Empresa actualizada: ${row.empresa}`);
    },
    [noteAbout, save, show],
  );
  const add = useCallback(
    async (row: Company) => {
      const saved = await save([...latest.current.companies.rows, row]);
      setOpen(null);
      if (!saved) return;
      reference.current = row;
      saidNoTo.current = "";
      saidNoToNew.current = "";
      noteAbout(row);
      const taxIds = row.cuits.length > 0 ? ` (${String(row.cuits.length)} CUIT)` : "";
      show(`"${row.empresa}" agregada a tus empresas${taxIds}`);
    },
    [noteAbout, save, show],
  );
  const askOwner = useCallback(
    async (change: CompanyChange, owner: BorrowedCompany["owner"]) => {
      const failed = await askOwnerForChange(backend, {
        empresa: change.company.empresa,
        owner: owner.id,
        officers: change.officers,
        config: change.cashbackChanged ? change.config : null,
        category: change.categoryChanged ? change.category : null,
      });
      if (!failed) {
        saidNoTo.current = changeSignature(change);
        setOpen(null);
        show(
          `Listo: ${owner.nombre} va a ver el pedido en Cambios pendientes y decide si lo guarda.`,
        );
        return true;
      }
      const { message } = failed;
      if (/pedido abierto|propuesta abierta/i.test(message)) {
        show(`Esa empresa ya tiene un pedido de cambio esperando a ${owner.nombre}.`);
      } else if (/suplente/i.test(message)) {
        setOpen(null);
        void refreshIfOld();
        show(`Ya no sos suplente de ${owner.nombre}: no se envió el pedido.`);
      } else {
        show(`No se pudo enviar el pedido: ${message}`);
      }
      return false;
    },
    [backend, refreshIfOld, show],
  );

  const dialog = useMemo(() => {
    if (!open) return null;
    if (open.kind === "new") {
      return (
        <AddCompanyDialog
          form={open.form}
          rows={companies.rows}
          context={context}
          onNo={sayNo}
          onSave={add}
        />
      );
    }
    if (open.kind === "substitute") {
      return (
        <SubstituteChangeDialog
          change={open.change}
          owner={open.owner}
          onNo={sayNo}
          onAsk={askOwner}
        />
      );
    }
    return (
      <UpdateCompanyDialog
        change={open.change}
        form={open.form}
        rows={companies.rows}
        initialTaxIds={taxIdsLine(open.change.company, ", ")}
        onNo={sayNo}
        onUpdate={update}
      />
    );
  }, [add, askOwner, companies.rows, context, open, sayNo, update]);

  return { companyBrought, companyForgotten, reviewAfterDownload, dialog };
}
