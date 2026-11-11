import { useQuery } from "@tanstack/react-query";
import { initialsOf } from "@/shared/domain/initials.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { ROLE_LABELS, roleTone } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Badge, Button, SectionLabel, Skeleton, StatCard } from "@/shared/ui/index.ts";
import { DASHBOARD_QUERY_KEY, type DashboardPerson, readDashboard } from "../api/board.ts";
import { readAllFlyerLogs, readPeopleNames, readRecentFlyers } from "../api/logs.ts";
import {
  authorOf,
  DASHBOARD_HEAD,
  DASHBOARD_WIDTHS,
  dashboardLine,
  sheetFileName,
} from "../model/flyer-logs.ts";
import { SEPARATOR } from "../model/text.ts";
import { PersonRow } from "./PersonRow.tsx";
import { ReadProblem } from "./ReadProblem.tsx";
import { SheetHead } from "./SheetHead.tsx";
import { EXPORT_LABEL, EXPORTING, useExport } from "./use-export.ts";
import styles from "./Panel.module.css";

const RECENT_QUERY_KEY = ["admin", "recent-flyers"] as const;
const LOGINS_SHOWN = 6;

function Skeletons() {
  return (
    <>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </>
  );
}

function Numbers({
  people,
  flyers,
}: {
  readonly people: readonly DashboardPerson[] | undefined;
  readonly flyers: number | undefined;
}) {
  const count = (keep: (person: DashboardPerson) => boolean) =>
    people ? people.filter(keep).length : "—";
  return (
    <div className={styles.stats}>
      <StatCard label="Total usuarios" value={people ? people.length : "—"} />
      <StatCard tone="green" label="Activos" value={count(({ status }) => status === "active")} />
      <StatCard tone="red" label="Admins" value={count(({ role }) => role === "admin")} />
      <StatCard tone="blue" label="Flyers generados" value={flyers ?? "—"} />
      <StatCard
        tone="yellow"
        label="Pendientes aprobación"
        value={count(({ status }) => status === "pending" || status === "reset_pending")}
      />
    </div>
  );
}

function RecentLogins({ people }: { readonly people: readonly DashboardPerson[] }) {
  const recent = people.filter(({ last_login: last }) => last).slice(0, LOGINS_SHOWN);
  if (!recent.length) return <p className={styles.empty}>Sin accesos registrados</p>;
  return recent.map((person) => {
    const mail = person.email_asesor ?? "";
    return (
      <PersonRow
        key={person.id}
        name={person.full_name || mail || "Usuario"}
        initials={initialsOf(person.full_name ?? "", mail)}
        colorOf={person.id || mail}
        detail={mail}
      >
        <Badge tone={roleTone(person.role ?? "")}>
          {ROLE_LABELS[person.role ?? ""] ?? "Asesor"}
        </Badge>
        <span className={styles.time}>{relativeDate(person.last_login)}</span>
      </PersonRow>
    );
  });
}

function RecentFlyers() {
  const { db } = useBackend();
  const recent = useQuery({
    queryKey: RECENT_QUERY_KEY,
    queryFn: async () => {
      const [logs, names] = await Promise.all([readRecentFlyers(db), readPeopleNames(db)]);
      return { logs, names };
    },
    staleTime: 0,
  });
  if (recent.isError) {
    return (
      <ReadProblem
        message="No se pudieron leer los flyers recientes"
        detail={recent.error.message}
        onRetry={() => void recent.refetch()}
      />
    );
  }
  if (!recent.data) return <Skeletons />;
  const { logs, names } = recent.data;
  const withAuthor = logs.filter(({ user_id: id }) => id);
  if (!withAuthor.length) {
    return (
      <p className={styles.empty}>
        Sin flyers generados aún. Cuando un usuario descargue un flyer aparecerá aquí.
      </p>
    );
  }
  return withAuthor.map((log) => {
    const name = authorOf(log, names);
    const detail = `${log.empresa || "Sin empresa"}${log.config_name ? `${SEPARATOR}${log.config_name}` : ""}`;
    return (
      <PersonRow
        key={log.id}
        name={name}
        initials={initialsOf(name)}
        colorOf={log.user_id || "x"}
        detail={detail}
      >
        <span className={styles.time}>{relativeDate(log.created_at)}</span>
      </PersonRow>
    );
  });
}

function ExportButton() {
  const backend = useBackend();
  const { busy, start } = useExport(async () => {
    const [logs, names] = await Promise.all([
      readAllFlyerLogs(backend),
      readPeopleNames(backend.db),
    ]);
    const rows = logs.filter(({ user_id: id }) => id);
    if (!rows.length) return null;
    return {
      lines: [DASHBOARD_HEAD, ...rows.map((log) => dashboardLine(log, names))],
      widths: DASHBOARD_WIDTHS,
      sheetName: "Flyers generados",
      fileName: sheetFileName("flyers_galicia", new Date()),
    };
  }, "No se pudo exportar: ");
  return (
    <Button
      variant="soft-ok"
      size="xs"
      disabled={busy}
      data-testid="export-dashboard"
      onClick={start}
    >
      {busy ? EXPORTING : EXPORT_LABEL}
    </Button>
  );
}

/** Admin → Dashboard: the people, how many flyers came out, who entered and who generated. */
export function DashboardSheet() {
  const { db } = useBackend();
  const board = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => readDashboard(db),
    staleTime: 0,
  });
  return (
    <div data-testid="admin-dashboard">
      <SheetHead title="Resumen general" space="tight">
        <ExportButton />
      </SheetHead>
      {board.isError ? (
        <ReadProblem
          message="No se pudo leer el resumen"
          detail={board.error.message}
          onRetry={() => void board.refetch()}
        />
      ) : (
        <Numbers people={board.data?.people} flyers={board.data?.flyers} />
      )}
      <SectionLabel className={styles.spaced}>Últimos accesos</SectionLabel>
      {board.data ? <RecentLogins people={board.data.people} /> : !board.isError && <Skeletons />}
      <SectionLabel className={styles.spaced}>
        Flyers recientes — quién generó cada uno
      </SectionLabel>
      <RecentFlyers />
    </div>
  );
}
