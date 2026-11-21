// "Compartir" (only the administrator): a COPY of the design for each person chosen. The database
// makes it: it shows in their Estudio as theirs, and whoever had one gets this version instead.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { normalizeText } from "@/shared/domain/promotions/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import type { DesignRow } from "@/shared/lib/studio/design-row.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Modal } from "@/shared/ui/index.ts";
import { type Person, readPeople } from "../api/designs.ts";
import { studioFailure } from "../model/studio-failure.ts";
import { shareSummary, type ShareAnswer } from "../model/share-outcome.ts";
import styles from "./StudioView.module.css";

const SUMMARY_MS = 6000;
const ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "Admin",
  vip: "VIP",
  asesor: "Asesor",
  prospect: "Prueba",
};

interface ShareablePerson {
  readonly id: string;
  readonly name: string;
  readonly mail: string;
  readonly role: string;
}

function shareable(people: readonly Person[], myId: string, ownerId: string | null) {
  return people
    .filter(
      ({ id, status, role }) =>
        id !== myId &&
        id !== ownerId &&
        status === "active" &&
        role !== "hunter" &&
        role !== "lider",
    )
    .map(({ id, full_name: name, email, email_asesor: other, role }): ShareablePerson => ({
      id,
      name: name?.trim() || email || other || "(sin nombre)",
      mail: email || other || "",
      role: role ?? "",
    }))
    .toSorted((one, two) => one.name.localeCompare(two.name, "es"));
}

function isShareAnswer(value: unknown): value is ShareAnswer {
  return typeof value === "object" && value !== null;
}

interface ShareWindowProps {
  readonly design: DesignRow;
  readonly myId: string;
  /** Who already has a copy of this design, of the ones on the list. */
  readonly withCopy: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly onShared: (hasNews: boolean) => void;
}

function confirmText(isSharing: boolean, chosen: number): string {
  if (isSharing) return "Compartiendo…";
  if (chosen === 0) return "Compartir";
  return `Compartir con ${String(chosen)}${chosen === 1 ? " persona" : " personas"}`;
}

export function ShareWindow({ design, myId, withCopy, onClose, onShared }: ShareWindowProps) {
  const backend = useBackend();
  const toast = useToast();
  const { options } = useFlyerOptions();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [isSharing, setSharing] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const people = useQuery({
    queryKey: ["studio", "people"],
    queryFn: () => readPeople(backend),
    staleTime: 0,
    gcTime: 0,
  });
  const { isSuccess } = people;
  useEffect(() => {
    if (isSuccess) searchField.current?.focus();
  }, [isSuccess]);
  const everybody = people.data ? shareable(people.data, myId, design.user_id) : [];
  const wanted = normalizeText(search);
  const shown = everybody.filter(({ name, mail }) =>
    normalizeText(`${name} ${mail}`).includes(wanted),
  );
  const toggle = (id: string, isOn: boolean) => {
    const next = new Set(chosen);
    if (isOn) next.add(id);
    else next.delete(id);
    setChosen(next);
  };
  const share = async () => {
    setSharing(true);
    const answer = await backend.rpc("flyer_diseno_compartir", {
      p_id: design.id,
      p_para: [...chosen],
    });
    if (!answer.ok) {
      setSharing(false);
      toast.show(`No se pudo compartir: ${studioFailure(answer.error)}`);
      return;
    }
    const outcome = isShareAnswer(answer.value) ? answer.value : {};
    onClose();
    toast.show(shareSummary(outcome), SUMMARY_MS);
    onShared(Boolean(outcome.nuevos?.length || outcome.actualizados?.length));
  };
  let list = (
    <div className={styles.peopleEmpty}>
      {people.isError
        ? `No se pudo leer la lista de personas: ${studioFailure(people.error)}`
        : "Cargando…"}
    </div>
  );
  if (people.data) {
    list =
      shown.length > 0 ? (
        <>
          {shown.map(({ id, name, role }) => (
            <label key={id} className={styles.person} data-testid="share-person">
              <input
                type="checkbox"
                checked={chosen.has(id)}
                onChange={({ target }) => {
                  toggle(id, target.checked);
                }}
              />
              <span className={styles.personName} data-part="name">
                {name}
                {withCopy.has(id) && (
                  <>
                    {" "}
                    <i>ya tiene una copia: se le reemplaza por esta versión</i>
                  </>
                )}
              </span>
              <span className={styles.personRole}>{ROLE_LABELS[role] ?? role}</span>
            </label>
          ))}
        </>
      ) : (
        <div className={styles.peopleEmpty}>
          {everybody.length > 0 ? "Nadie con ese nombre." : "No hay otras personas activas."}
        </div>
      );
  }
  return (
    <Modal look="dialog" closeOnBackdrop={false} className={styles.window} onClose={onClose}>
      <Modal.Title className={styles.windowTitle}>Compartir «{design.nombre}»</Modal.Title>
      <div className={styles.windowText}>
        A cada persona que elijas le llega una copia a su Estudio: la puede usar y cambiar sin tocar
        la tuya. Para usarla tiene que tener habilitado el flyer «
        {optionLabel(options, design.opcion)}».
      </div>
      <input
        ref={searchField}
        type="search"
        className={`${styles.windowField} ${styles.peopleSearch}`}
        aria-label="Buscar por nombre o mail"
        placeholder="Buscar por nombre o mail"
        autoComplete="off"
        value={search}
        onChange={({ target }) => {
          setSearch(target.value);
        }}
      />
      <div className={styles.people} data-testid="share-people">
        {list}
      </div>
      <div className={styles.windowActions}>
        <Button variant="ghost" size="dialog" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="dialog"
          disabled={chosen.size === 0 || isSharing}
          data-testid="share-confirm"
          onClick={() => {
            void share();
          }}
        >
          {confirmText(isSharing, chosen.size)}
        </Button>
      </div>
    </Modal>
  );
}
