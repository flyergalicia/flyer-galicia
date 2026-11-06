import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { PERMISSIONS_QUERY_KEY, useSession, useSessionActions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Icon, SectionLabel, Skeleton } from "@/shared/ui/index.ts";
import {
  FACULTIES_QUERY_KEY,
  readSavedFaculties,
  saveFaculties,
  saveOwnFaculties,
} from "../api/faculties.ts";
import {
  type FacultyMatrix,
  facultyMatrix,
  type FacultyRow,
  facultyRows,
  groupCount,
  isTicked,
  leavesNoFlyer,
  OWN_COLUMN,
  ownApplies,
  ROLE_COLUMNS,
  roleApplies,
  tick,
} from "../model/faculties.ts";
import { CommercialSwitch } from "./CommercialSwitch.tsx";
import { FacultyDescription } from "./FacultyDescription.tsx";
import { ReadProblem } from "./ReadProblem.tsx";
import type { SheetProps } from "./SheetProps.ts";
import styles from "./Faculties.module.css";
import panel from "./Panel.module.css";

const NOT_FOR: Readonly<Record<string, string>> = {
  [OWN_COLUMN]: "No aplica al administrador: podés verlo desde tu nombre → Ver tutorial",
  hunter: "No aplica al perfil Hunter: sólo busca una empresa y baja su flyer",
  lider: "No aplica al perfil Líder: sólo mira el tablero de su equipo",
};

const COLUMNS = [OWN_COLUMN, ...ROLE_COLUMNS.map(([role]) => role)];

function Caret() {
  return (
    <svg className={styles.caret} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 0l8 5-8 5z" />
    </svg>
  );
}

function Cell({
  matrix,
  column,
  row,
  onTick,
}: {
  readonly matrix: FacultyMatrix;
  readonly column: string;
  readonly row: FacultyRow;
  readonly onTick: (column: string, key: string, on: boolean) => void;
}) {
  const applies = column === OWN_COLUMN ? ownApplies(row.key) : roleApplies(column, row.key);
  if (!applies) {
    return (
      <div className={styles.none} title={NOT_FOR[column]} data-column={column}>
        —
      </div>
    );
  }
  return (
    <div data-column={column}>
      <input
        type="checkbox"
        className={styles.box}
        aria-label={row.name}
        checked={isTicked(matrix, column, row.key)}
        onChange={({ target }) => {
          onTick(column, row.key, target.checked);
        }}
      />
    </div>
  );
}

function Head({ onPreview }: { readonly onPreview: (role: string, name: string) => void }) {
  return (
    <div className={`${styles.row} ${styles.headRow}`}>
      <div>Funcionalidad</div>
      <div title="Tu propia cuenta: lo que destildes acá no afecta al otro administrador">
        Vos
        <br />
        <span className={styles.own}>(tu cuenta)</span>
      </div>
      {ROLE_COLUMNS.map(([role, name]) => (
        <div key={role}>
          <button
            type="button"
            className={styles.preview}
            title={`Ver la app como la ve un ${name}`}
            data-preview={role}
            onClick={() => {
              onPreview(role, name);
            }}
          >
            {name}
            <Icon name="eye" className={styles.eye} />
          </button>
        </div>
      ))}
    </div>
  );
}

interface GroupProps {
  readonly tab: FlyerTab;
  readonly name: string;
  readonly open: boolean;
  readonly matrix: FacultyMatrix;
  readonly onToggle: () => void;
}

function GroupHead({ tab, name, open, matrix, onToggle }: GroupProps) {
  const { options } = useFlyerOptions();
  const howMany = options.filter((option) => option.solapa === tab).length;
  return (
    <button
      type="button"
      className={`${styles.row} ${styles.group}`}
      aria-expanded={open}
      data-group={tab}
      title="Mostrar u ocultar las opciones de esta solapa"
      onClick={onToggle}
    >
      <span className={styles.name}>
        <Caret />
        <span data-testid="faculty-group-name">{name}</span>
        <span className={styles.howMany}>
          {howMany} {howMany === 1 ? "opción" : "opciones"}
        </span>
      </span>
      {COLUMNS.map((column) => (
        <span key={column} className={styles.count} data-column={column}>
          {groupCount(matrix, column, tab, options)}
        </span>
      ))}
    </button>
  );
}

function MatrixRows({
  rows,
  matrix,
  open,
  tabName,
  onToggle,
  onTick,
}: {
  readonly rows: readonly FacultyRow[];
  readonly matrix: FacultyMatrix;
  readonly open: ReadonlySet<FlyerTab>;
  readonly tabName: (tab: FlyerTab) => string;
  readonly onToggle: (tab: FlyerTab) => void;
  readonly onTick: (column: string, key: string, on: boolean) => void;
}) {
  return rows.map((row, at) => {
    const { tab } = row;
    const startsGroup = tab !== null && rows[at - 1]?.tab !== tab;
    return (
      <Fragment key={row.key}>
        {startsGroup && (
          <GroupHead
            tab={tab}
            name={tabName(tab)}
            open={open.has(tab)}
            matrix={matrix}
            onToggle={() => {
              onToggle(tab);
            }}
          />
        )}
        <div
          className={tab ? `${styles.row} ${styles.sub}` : styles.row}
          data-faculty={row.key}
          hidden={tab !== null && !open.has(tab)}
        >
          <div>
            <div className={styles.name} data-testid="faculty-name">
              {row.name}
            </div>
            <div className={styles.description}>
              <FacultyDescription row={row} />
            </div>
          </div>
          {COLUMNS.map((column) => (
            <Cell key={column} matrix={matrix} column={column} row={row} onTick={onTick} />
          ))}
        </div>
      </Fragment>
    );
  });
}

function useSaveFaculties() {
  const { bucket, db } = useBackend();
  const queryClient = useQueryClient();
  const session = useSession();
  const { refreshProfile } = useSessionActions();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const myId = session.status === "signed-in" ? session.user.id : "";
  const save = async (matrix: FacultyMatrix): Promise<boolean> => {
    setBusy(true);
    const refused = await saveFaculties(bucket, matrix.roles, new Date());
    if (refused) {
      setBusy(false);
      show(`Error al guardar las facultades: ${refused}`);
      return false;
    }
    // Everybody of each profile reads it the next time they enter; this administrator, now.
    queryClient.setQueryData(FACULTIES_QUERY_KEY, matrix.roles);
    queryClient.setQueryData(PERMISSIONS_QUERY_KEY, matrix.roles);
    // Second step: the column "Vos" goes to one's own profile (RLS: only one's own row).
    const ownRefused = await saveOwnFaculties(db, myId, matrix.own);
    setBusy(false);
    if (ownRefused) {
      show(`Los perfiles se guardaron, pero tu columna "Vos" no: ${ownRefused}`);
      return false;
    }
    refreshProfile();
    show("Facultades actualizadas");
    return true;
  };
  return { busy, save };
}

/** Admin → Facultades: what each profile can do, and the way to see the app as one of them. */
export function FacultiesSheet({ closePanel }: SheetProps) {
  const { bucket } = useBackend();
  const session = useSession();
  const { startRolePreview } = useSessionActions();
  const { show } = useToast();
  const { options } = useFlyerOptions();
  const { titles } = useScreenTitles();
  const read = useQuery({
    queryKey: FACULTIES_QUERY_KEY,
    queryFn: () => readSavedFaculties(bucket),
    staleTime: 0,
  });
  const own = session.status === "signed-in" ? session.profile.facultades : null;
  const [edits, setEdits] = useState<FacultyMatrix | null>(null);
  const [open, setOpen] = useState<ReadonlySet<FlyerTab>>(new Set());
  const { busy, save } = useSaveFaculties();
  const tabName = (tab: FlyerTab) => titleOf(titles, tab);
  const rows = useMemo(
    () => facultyRows(options, titles.order, (tab) => titleOf(titles, tab)),
    [options, titles],
  );
  const base = useMemo(
    () => (read.isSuccess ? facultyMatrix(read.data, options, own) : null),
    [read.isSuccess, read.data, options, own],
  );
  const matrix = edits ?? base;

  const onTick = (column: string, key: string, on: boolean) => {
    if (!matrix) return;
    // The administrator cannot be left without any flyer: there would be nothing to build.
    if (column === OWN_COLUMN && !on && leavesNoFlyer(matrix, key, options)) {
      show("Dejá al menos una opción del armador habilitada.");
      return;
    }
    setEdits(tick(matrix, column, key, on));
  };
  const onToggle = (tab: FlyerTab) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      return next;
    });
  };
  const onPreview = (role: string, name: string) => {
    closePanel(() => {
      startRolePreview(role);
      show(`Vista previa: estás viendo la app como ${name}`);
    });
  };

  return (
    <div data-testid="admin-faculties">
      <SectionLabel className={panel.label}>Facultades por perfil</SectionLabel>
      <p className={panel.intro}>
        Tildá qué <strong>funcionalidades</strong> tiene cada perfil. Al guardar, el cambio impacta
        para todos los usuarios de ese perfil la próxima vez que entren.
        <br />
        <br />
        La columna <strong>Vos</strong> es <strong>tu propia cuenta</strong>: destildá lo que no
        uses (por ejemplo, una opción del armador que no te sirve) y la app se te simplifica. No
        afecta al otro administrador ni al Panel Administrador, que siempre queda disponible; podés
        volver a tildarlo cuando quieras.
        <br />
        <br />
        Tocá el <strong>nombre de un perfil</strong> (Asesor, VIP, Pro) para{" "}
        <strong>ver la app tal cual la ve ese perfil</strong>, sin salir de tu sesión. Para volver,
        usá el botón de la barra de abajo.
        <br />
        <br />
        Esto controla <strong>qué ve y qué puede usar cada uno en la pantalla</strong>. Las acciones
        sensibles (crear o borrar usuarios, cambiar la configuración global) siguen siendo
        exclusivas del administrador y las controla el servidor.
      </p>
      <CommercialSwitch />
      {read.isError && (
        <ReadProblem
          message="No se pudieron leer las facultades"
          detail={read.error.message}
          onRetry={() => void read.refetch()}
        />
      )}
      {!matrix && !read.isError && <Skeleton />}
      {matrix && (
        <div className={styles.grid} data-testid="faculty-grid">
          <Head onPreview={onPreview} />
          <MatrixRows
            rows={rows}
            matrix={matrix}
            open={open}
            tabName={tabName}
            onToggle={onToggle}
            onTick={onTick}
          />
        </div>
      )}
      <div className={panel.buttons}>
        <Button
          size="sm"
          disabled={busy || !matrix}
          onClick={() => {
            if (matrix) {
              void save(matrix);
            }
          }}
        >
          {busy ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            setEdits(null);
            void read.refetch();
          }}
        >
          Recargar
        </Button>
      </div>
    </div>
  );
}
