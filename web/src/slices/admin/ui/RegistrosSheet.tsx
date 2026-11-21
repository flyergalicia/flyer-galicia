import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { optionColor, optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Skeleton } from "@/shared/ui/index.ts";
import {
  NO_REGISTRY_FILTERS,
  readAllRegistros,
  readPeopleNames,
  readRegistros,
  type RegistryFilters,
} from "../api/logs.ts";
import {
  byAuthor,
  countText,
  REGISTRY_HEAD,
  REGISTRY_WIDTHS,
  registryLine,
  sheetFileName,
} from "../model/flyer-logs.ts";
import { FlyerLogRow, type OptionLook } from "./FlyerLogRow.tsx";
import { FilterField, LogFilters } from "./LogFilters.tsx";
import { SheetHead } from "./SheetHead.tsx";
import { EXPORT_LABEL, EXPORTING, useExport } from "./use-export.ts";
import styles from "./Panel.module.css";

function useOptionLook(): OptionLook {
  const { options } = useFlyerOptions();
  return {
    label: (option) => optionLabel(options, option),
    color: (option) => optionColor(options, option),
  };
}

function ExportButton({
  filters,
  look,
}: {
  readonly filters: RegistryFilters;
  readonly look: OptionLook;
}) {
  const backend = useBackend();
  const { busy, start } = useExport(async () => {
    const [logs, names] = await Promise.all([
      readAllRegistros(backend, filters),
      readPeopleNames(backend.db),
    ]);
    const rows = byAuthor(logs, names, filters.user);
    if (!rows.length) return null;
    return {
      lines: [REGISTRY_HEAD, ...rows.map((log) => registryLine(log, names, look.label))],
      widths: REGISTRY_WIDTHS,
      sheetName: "Registros",
      fileName: sheetFileName("registros_flyers_galicia", new Date()),
    };
  }, "No se pudo exportar: ");
  return (
    <Button
      variant="soft-ok"
      size="xs"
      className={styles.exportWide}
      disabled={busy}
      data-testid="export-registros"
      onClick={start}
    >
      {busy ? EXPORTING : EXPORT_LABEL}
    </Button>
  );
}

function RegistryList({
  filters,
  look,
}: {
  readonly filters: RegistryFilters;
  readonly look: OptionLook;
}) {
  const { db } = useBackend();
  const read = useQuery({
    queryKey: ["admin", "registros", filters],
    queryFn: async () => {
      const [logs, names] = await Promise.all([readRegistros(db, filters), readPeopleNames(db)]);
      return { logs, names };
    },
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
  const { logs, names } = read.data;
  const rows = byAuthor(logs, names, filters.user);
  return (
    <>
      <p className={styles.count}>{countText(rows.length, "registro", "registros")}</p>
      {rows.length ? (
        rows.map((log) => <FlyerLogRow key={log.id} log={log} names={names} options={look} />)
      ) : (
        <p className={styles.empty}>
          Sin registros aún. Los flyers generados por los usuarios aparecerán aquí.
        </p>
      )}
    </>
  );
}

/** Admin → Registros: the flyers that came out, with their filters and the whole Excel. */
export function RegistrosSheet() {
  const look = useOptionLook();
  const [draft, setDraft] = useState<RegistryFilters>(NO_REGISTRY_FILTERS);
  const [applied, setApplied] = useState<RegistryFilters>(NO_REGISTRY_FILTERS);
  const set = (patch: Partial<RegistryFilters>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  return (
    <div data-testid="admin-registros">
      <SheetHead title="Registros de flyers generados">
        <ExportButton filters={draft} look={look} />
      </SheetHead>
      <LogFilters
        onSearch={() => {
          setApplied(draft);
        }}
        onClear={() => {
          setDraft(NO_REGISTRY_FILTERS);
          setApplied(NO_REGISTRY_FILTERS);
        }}
      >
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
      <RegistryList filters={applied} look={look} />
    </div>
  );
}
