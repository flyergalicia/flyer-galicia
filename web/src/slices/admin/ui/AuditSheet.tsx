import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { initialsOf } from "@/shared/domain/initials.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Avatar, SectionLabel, Skeleton } from "@/shared/ui/index.ts";
import { AUDIT_LIMIT, readAudit } from "../api/logs.ts";
import {
  AUDIT_FILTERS,
  auditAction,
  auditActor,
  auditDetails,
  type AuditRow,
} from "../model/audit.ts";
import { countText, dateTime } from "../model/flyer-logs.ts";
import { avatarColor } from "../model/people.ts";
import { SEPARATOR } from "../model/text.ts";
import { FilterField, LogFilters } from "./LogFilters.tsx";
import styles from "./Panel.module.css";

function AuditLine({ row }: { readonly row: AuditRow }) {
  const who = auditActor(row);
  const details = auditDetails(row);
  return (
    <div className={styles.logRow} data-testid="log-row">
      <Avatar
        initials={initialsOf(row.actor_email || "?", row.actor_email ?? "")}
        color={avatarColor(who)}
        size="sm"
      />
      <div className={styles.logInfo}>
        <div className={styles.logTop}>
          <span className={styles.logTitle}>{auditAction(row)}</span>
        </div>
        <div className={styles.logLine}>
          <span className={styles.logLabel}>Cuenta</span> {row.objetivo_email || "—"}
        </div>
        <div className={styles.logLine}>
          <span className={styles.logLabel}>Por</span> {who}
          {details && (
            <>
              {SEPARATOR}
              <span className={styles.logLabel}>{details}</span>
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

function AuditList({ action }: { readonly action: string }) {
  const { db } = useBackend();
  const read = useQuery({
    queryKey: ["admin", "audit", action],
    queryFn: () => readAudit(db, action),
    staleTime: 0,
  });
  if (read.isError) {
    return (
      <p className={styles.failed} role="alert">
        Error: {read.error.message}
      </p>
    );
  }
  if (read.isFetching || !read.data) return [1, 2, 3, 4].map((at) => <Skeleton key={at} />);
  const rows = read.data;
  return (
    <>
      <p className={styles.count}>
        {countText(rows.length, "registro", "registros")}
        {rows.length >= AUDIT_LIMIT ? " (se muestran los últimos 300)" : ""}
      </p>
      {rows.length ? (
        rows.map((row) => <AuditLine key={row.id} row={row} />)
      ) : (
        <p className={styles.empty}>
          Sin registros todavía. Desde ahora queda constancia de cada alta, aprobación, cambio de
          contraseña y baja de cuentas.
        </p>
      )}
    </>
  );
}

/** Admin → Auditoría: who did what on the accounts. Nobody can change or delete these logs. */
export function AuditSheet() {
  const [action, setAction] = useState("");
  const [shown, setShown] = useState({ action: "", turn: 0 });
  return (
    <div data-testid="admin-audit">
      <SectionLabel className={styles.label}>Auditoría de acciones</SectionLabel>
      <p className={`${styles.intro} ${styles.close12}`}>
        Queda constancia de <strong>quién hizo qué</strong> sobre las cuentas: altas, aprobaciones,
        cambios de contraseña y bajas, y también los pedidos de acceso y de cambio de contraseña que
        llegan sin sesión. No se guarda ninguna contraseña y nadie puede modificar ni borrar estos
        registros.
      </p>
      <LogFilters
        searchLabel="Actualizar"
        onSearch={() => {
          setShown((current) => ({ action, turn: current.turn + 1 }));
        }}
      >
        <FilterField label="Acción">
          <select
            aria-label="Acción"
            value={action}
            onChange={({ target }) => {
              setAction(target.value);
              setShown((current) => ({ action: target.value, turn: current.turn + 1 }));
            }}
          >
            {AUDIT_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FilterField>
      </LogFilters>
      <AuditList key={shown.turn} action={shown.action} />
    </div>
  );
}
