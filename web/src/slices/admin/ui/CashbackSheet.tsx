import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { CashbackConfig } from "@/shared/domain/company-registry/cashback.ts";
import { Button, ConfirmDialog, Input, SectionLabel } from "@/shared/ui/index.ts";
import {
  AMOUNT_KEYS,
  type AmountKey,
  CASHBACK_NAME_LENGTH,
  removeQuestion,
} from "../model/cashback-sheet.ts";
import { useCashbackSheet } from "../model/use-cashback-sheet.ts";
import { ReadProblem } from "./ReadProblem.tsx";
import styles from "./Config.module.css";
import panel from "./Panel.module.css";

interface Removing {
  readonly index: number;
  readonly config: CashbackConfig;
}

/** Escape while a name is written leaves it as it was: it never reaches the panel, which would close. */
function useEscapeFirst(active: boolean, onEscape: () => void): void {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    if (!active) return undefined;
    // On the window and in capture: before the panel, which listens on the document.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      escape.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [active]);
}

/** Double click on the name: a field in its place. Enter or leaving keeps it; Escape does not. */
function ConfigName({
  name,
  onRename,
  startRenaming,
}: {
  readonly name: string;
  readonly onRename: (typed: string) => void;
  readonly startRenaming: boolean;
}) {
  const [renaming, setRenaming] = useState(startRenaming);
  const [typed, setTyped] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const finish = (keep: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setRenaming(false);
    if (keep) onRename(typed);
  };
  useEscapeFirst(renaming, () => {
    finish(false);
  });
  useEffect(() => {
    if (!renaming) return;
    finished.current = false;
    field.current?.focus();
    field.current?.select();
  }, [renaming]);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    finish(true);
  };
  if (renaming) {
    return (
      <input
        ref={field}
        type="text"
        className={styles.configNameField}
        aria-label="Nombre de la configuración"
        maxLength={CASHBACK_NAME_LENGTH}
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          finish(true);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={styles.configName}
      title="Doble click para cambiar el nombre"
      data-testid="cashback-name"
      onDoubleClick={() => {
        setTyped(name);
        setRenaming(true);
      }}
    >
      {name}
    </button>
  );
}

function ConfigCard({
  config,
  index,
  isNew,
  onRename,
  onAmount,
  onRemove,
}: {
  readonly config: CashbackConfig;
  readonly index: number;
  readonly isNew: boolean;
  readonly onRename: (typed: string) => void;
  readonly onAmount: (key: AmountKey, value: string) => void;
  readonly onRemove: () => void;
}) {
  return (
    <div className={styles.config} data-testid="cashback-config" data-index={index}>
      <div className={styles.configHead}>
        <ConfigName name={config.nombre} onRename={onRename} startRenaming={isNew} />
        <span className={styles.hint}>doble click para renombrar</span>
        {index === 0 ? (
          <span className={`${styles.hint} ${styles.right}`}>
            La de fallback: no se puede quitar
          </span>
        ) : (
          <Button variant="soft-danger" size="xs" className={styles.right} onClick={onRemove}>
            Quitar
          </Button>
        )}
      </div>
      <div className={styles.amounts}>
        {AMOUNT_KEYS.map((key, at) => (
          <label key={key}>
            <span className={styles.amountLabel}>Monto {at + 1}</span>
            <Input
              controlSize="lg"
              value={config[key]}
              onChange={(event) => {
                onAmount(key, event.target.value);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Config → Cashback: the amounts of each configuration, saved for everybody. */
export function CashbackSheet() {
  const sheet = useCashbackSheet();
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const { configs } = sheet;

  return (
    <div data-testid="admin-cashback">
      <SectionLabel className={panel.label}>Montos de cashback</SectionLabel>
      <p className={styles.intro}>
        Cada tarjeta es una <strong>configuración de cashback</strong> con sus 4 montos. Podés{" "}
        <strong>agregar</strong> configs nuevas (Config 5, 6…) o <strong>quitar</strong> las que ya
        no se usen, y <strong>doble click en el título</strong> para cambiarle el nombre. Al
        guardar, el cambio <strong>impacta para todos los usuarios</strong> la próxima vez que
        entren o generen un flyer: los botones del armador, el masivo y las empresas guardadas se
        adaptan solos. BAU es la de fallback y siempre queda.
      </p>
      {sheet.failure && (
        <ReadProblem
          message="No se pudo leer el cashback"
          detail={sheet.failure}
          onRetry={sheet.reload}
        />
      )}
      {!configs && !sheet.failure && <p className={styles.loading}>Cargando...</p>}
      {configs?.map((config, index) => (
        <ConfigCard
          // A configuration has no identity of its own but its place: removing one remakes the rest.
          key={`${String(index)}-${String(configs.length)}`}
          config={config}
          index={index}
          isNew={added === index}
          onRename={(typed) => {
            sheet.rename(index, typed);
          }}
          onAmount={(key, value) => {
            sheet.setAmount(index, key, value);
          }}
          onRemove={() => {
            setRemoving({ index, config });
          }}
        />
      ))}
      <div className={styles.buttons}>
        <Button
          variant="soft-neutral"
          size="xs"
          disabled={!configs}
          onClick={() => {
            if (!configs) return;
            sheet.add();
            setAdded(configs.length);
          }}
        >
          + Agregar config
        </Button>
        <Button
          size="sm"
          disabled={!configs || sheet.saving}
          onClick={() => {
            setAdded(null);
            void sheet.save();
          }}
        >
          {sheet.saving ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          onClick={() => {
            setAdded(null);
            sheet.reload();
          }}
        >
          Recargar
        </Button>
      </div>
      {removing && (
        <ConfirmDialog
          title={removeQuestion(removing.config.nombre).title}
          confirmLabel="Quitar"
          danger
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            setRemoving(null);
            // If the list changed meanwhile, that one is not there anymore: nothing goes.
            if (configs?.[removing.index] === removing.config) sheet.remove(removing.index);
          }}
        >
          {removeQuestion(removing.config.nombre).body}
        </ConfirmDialog>
      )}
    </div>
  );
}
