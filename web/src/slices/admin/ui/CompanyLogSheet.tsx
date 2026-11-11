import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { initialsOf } from "@/shared/domain/initials.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Avatar, Badge, Button, Skeleton } from "@/shared/ui/index.ts";
import {
  COMPANY_LOG_LIMIT,
  type CompanyLogFilters,
  NO_COMPANY_LOG_FILTERS,
  readAllCompanyLog,
  readCompanyLog,
} from "../api/logs.ts";
import {
  ACTION_NAMES,
  byUser,
  changeDetails,
  COMPANY_LOG_HEAD,
  COMPANY_LOG_WIDTHS,
  type CompanyLogRow,
  detailsText,
  isRelevant,
} from "../model/company-log.ts";
import { countText, dateTime, sheetFileName } from "../model/flyer-logs.ts";
import { avatarColor } from "../model/people.ts";
import { SEPARATOR } from "../model/text.ts";
import { FilterField, LogFilters } from "./LogFilters.tsx";
import { SheetHead } from "./SheetHead.tsx";
import { EXPORT_LABEL, EXPORTING, useExport } from "./use-export.ts";
import styles from "./Panel.module.css";

function ActionBadge({ action }: { readonly action: string }) {
  if (action === "alta") return <Badge tone="green">Alta</Badge>;
  if (action === "baja") return <Badge tone="red">Baja</Badge>;
  return <span className={styles.modification}>Modificación</span>;
}

function ChangeLine({ row }: { readonly row: CompanyLogRow }) {
  const { options } = useFlyerOptions();
  const name = row.usuario || "Usuario";
  const parts = changeDetails(row, options);
  return (
    <div className={styles.logRow} data-testid="log-row">
      <Avatar initials={initialsOf(name)} color={avatarColor(row.user_id || name)} size="sm" />
      <div className={styles.logInfo}>
        <div className={styles.logTop}>
          <span className={styles.logTitle}>{row.empresa || "—"}</span>
          <ActionBadge action={row.accion} />
        </div>
        {parts.length > 0 && (
          <div className={styles.chips}>
            {parts.map(([label, text], at) => (
              <span
                key={`${label}-${String(at)}`}
                className={`${styles.chip} ${styles.chipDetail}`}
              >
                <b>{label}:</b> {text}
              </span>
            ))}
          </div>
        )}
        <div className={styles.logLine}>
          <span className={styles.logLabel}>Por</span> {name}
          {row.total !== null && (
            <>
              {SEPARATOR}
              <span className={styles.logLabel}>Empresas:</span>{" "}
              {countText(row.total, "empresa", "empresas")}
            </>
          )}
        </div>
      </div>
      <span className={styles.date} title={dateTime(row.created_at)}>
        {relativeDate(row.created_at)}
      </span>
    </div>
  );
}

function ChangeList({ filters }: { readonly filters: CompanyLogFilters }) {
  const { db } = useBackend();
  const { options } = useFlyerOptions();
  const read = useQuery({
    queryKey: ["admin", "company-log", filters],
    queryFn: () => readCompanyLog(db, filters),
    staleTime: 0,
  });
  if (read.isError) {
    return (
      <p className={styles.failed} role="alert">
        Error: {read.error.message}
      </p>
    );
  }
  if (!read.data) return [1, 2, 3, 4].map((at) => <Skeleton key={at} />);
  const brought = read.data.length;
  const rows = byUser(read.data, filters.user.trim()).filter((row) => isRelevant(row, options));
  return (
    <>
      <p className={styles.count}>
        {countText(rows.length, "cambio", "cambios")}
        {brought >= COMPANY_LOG_LIMIT
          ? " (se muestran los últimos 500; para ver todo, exportá a Excel)"
          : ""}
      </p>
      {rows.length ? (
        rows.map((row) => <ChangeLine key={row.id} row={row} />)
      ) : (
        <p className={styles.empty}>
          Sin cambios registrados todavía. Cada vez que alguien guarde sus empresas (Excel, editor
          en línea o desde el armador), las altas, modificaciones y bajas aparecen acá.
        </p>
      )}
    </>
  );
}

function ExportButton({ filters }: { readonly filters: CompanyLogFilters }) {
  const backend = useBackend();
  const { options } = useFlyerOptions();
  const { busy, start } = useExport(async () => {
    const all = await readAllCompanyLog(backend, filters);
    const rows = byUser(all, filters.user.trim()).filter((row) => isRelevant(row, options));
    if (!rows.length) return null;
    return {
      lines: [
        COMPANY_LOG_HEAD,
        ...rows.map((row) => [
          dateTime(row.created_at),
          row.usuario ?? "",
          ACTION_NAMES[row.accion] ?? row.accion,
          row.empresa ?? "",
          detailsText(row, options),
          row.total ?? "",
        ]),
      ],
      widths: COMPANY_LOG_WIDTHS,
      sheetName: "Cambios de empresas",
      fileName: sheetFileName("cambios_empresas_galicia", new Date()),
    };
  }, "Error: ");
  return (
    <Button
      variant="soft-ok"
      size="xs"
      className={styles.exportWide}
      disabled={busy}
      data-testid="export-company-log"
      onClick={start}
    >
      {busy ? EXPORTING : EXPORT_LABEL}
    </Button>
  );
}

/** Data → Cambios en las empresas: who added, changed or took out which company, and what. */
export function CompanyLogSheet() {
  const [draft, setDraft] = useState<CompanyLogFilters>(NO_COMPANY_LOG_FILTERS);
  const [applied, setApplied] = useState<CompanyLogFilters>(NO_COMPANY_LOG_FILTERS);
  const set = (patch: Partial<CompanyLogFilters>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  return (
    <div data-testid="admin-company-log">
      <SheetHead title="Cambios en las empresas">
        <ExportButton filters={draft} />
      </SheetHead>
      <p className={`${styles.intro} ${styles.close12}`}>
        Cada vez que alguien guarda sus empresas (subiendo un Excel, con el editor en línea o desde
        el armador), queda constancia de{" "}
        <strong>qué empresas se agregaron, cuáles se modificaron</strong> (y qué cambió: CUIT,
        cashback u oficiales) <strong>y cuáles se borraron</strong>, con fecha, hora y quién lo
        hizo. Un cambio de razón social aparece como una baja más un alta. Ves tus propios cambios y
        los de asesores, VIP y Pro; los de otro administrador no.
      </p>
      <LogFilters
        onSearch={() => {
          setApplied(draft);
        }}
        onClear={() => {
          setDraft(NO_COMPANY_LOG_FILTERS);
          setApplied(NO_COMPANY_LOG_FILTERS);
        }}
      >
        <FilterField label="Usuario">
          <input
            type="text"
            placeholder="Filtrar usuario..."
            value={draft.user}
            onChange={({ target }) => {
              set({ user: target.value });
            }}
          />
        </FilterField>
        <FilterField label="Empresa">
          <input
            type="text"
            placeholder="Filtrar empresa..."
            value={draft.company}
            onChange={({ target }) => {
              set({ company: target.value });
            }}
          />
        </FilterField>
        <FilterField label="Acción">
          <select
            aria-label="Acción"
            value={draft.action}
            onChange={({ target }) => {
              set({ action: target.value });
            }}
          >
            <option value="">Todas</option>
            <option value="alta">Altas</option>
            <option value="modificacion">Modificaciones</option>
            <option value="baja">Bajas</option>
          </select>
        </FilterField>
        <FilterField label="Desde">
          <input
            type="date"
            value={draft.from}
            onChange={({ target }) => {
              set({ from: target.value });
            }}
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={draft.to}
            onChange={({ target }) => {
              set({ to: target.value });
            }}
          />
        </FilterField>
      </LogFilters>
      <ChangeList filters={applied} />
    </div>
  );
}
