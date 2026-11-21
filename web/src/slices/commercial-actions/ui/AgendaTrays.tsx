// The trays over the agenda: who to contact, what has no hunter, who asked to be replaced and the data
// lists to work on.
import type { ReactNode } from "react";
import type { AgendaExtras, PersonToContact, TrayAction } from "../api/agenda.ts";
import { type Trays, TRAY_ROWS } from "../model/agenda-trays.ts";
import { daysBetween } from "../model/agenda-dates.ts";
import { dateLabel, timeRange, today } from "../model/formatting.ts";
import { ACTION_TYPES, labelOf } from "../model/labels.ts";
import { canReassign, nameOf, type Who } from "../model/who.ts";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

export function ContactItem({
  person,
  companies,
  onChoose,
}: {
  readonly person: PersonToContact;
  readonly companies: Readonly<Record<string, string>>;
  readonly onChoose: (person: PersonToContact) => void;
}) {
  const { nombre, contacto, proximo, gestion_id: action } = person;
  const isLate = daysBetween(proximo, today()) > 0;
  return (
    <button
      type="button"
      className={styles.trayItem}
      onClick={() => {
        onChoose(person);
      }}
    >
      <span>
        <b>{nombre}</b>
        <span className={base.mini}>
          {`${companies[action] ?? ""}${contacto ? ` · ${contacto}` : ""}${isLate ? " · " : ""}`}
          {isLate && <span>desde el {dateLabel(proximo)}</span>}
        </span>
      </span>
      <span className={base.link}>Abrir</span>
    </button>
  );
}

function Item({
  action,
  title,
  detail,
  button,
  assigns,
  onOpen,
}: {
  readonly action: TrayAction;
  readonly title: string;
  readonly detail: ReactNode;
  readonly button: string;
  readonly assigns: boolean;
  readonly onOpen: (id: string, assign: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={styles.trayItem}
      onClick={() => {
        onOpen(action.id, assigns);
      }}
    >
      <span>
        <b>{title}</b>
        <span className={base.mini}>{detail}</span>
      </span>
      {button && <span className={base.link}>{button}</span>}
    </button>
  );
}

function Tray({
  id,
  tone,
  title,
  children,
}: {
  readonly id: string;
  readonly tone?: string | undefined;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={`${styles.tray}${tone ? ` ${tone}` : ""}`}
      data-tray={id}
      data-testid={`tray-${id}`}
    >
      <h4>{title}</h4>
      <div className={styles.trayList}>{children}</div>
    </section>
  );
}

function More({ total }: { readonly total: number }) {
  return total > TRAY_ROWS ? <span className={base.mini}>Y {total - TRAY_ROWS} más.</span> : null;
}

function signupsText(signups: number): string {
  if (!signups) return "";
  return ` · ${String(signups)} ${signups === 1 ? "alta" : "altas"}`;
}

function whenOf(action: TrayAction): string {
  const time = timeRange(action);
  return `${dateLabel(action.fecha)}${time ? ` ${time}` : ""}`;
}

interface AgendaTraysProps {
  readonly who: Who;
  readonly trays: Trays;
  readonly extras: AgendaExtras;
  readonly onOpen: (id: string, assign: boolean) => void;
  readonly onContact: (person: PersonToContact) => void;
  readonly onSeeAllContacts: () => void;
}

function ContactTray({
  trays,
  extras,
  onContact,
  onSeeAllContacts,
}: Pick<AgendaTraysProps, "trays" | "extras" | "onContact" | "onSeeAllContacts">) {
  const { toContact } = trays;
  if (toContact.length === 0) return null;
  return (
    <Tray
      id="contact"
      tone={styles.trayInfo}
      title={`Para contactar (${String(toContact.length)})`}
    >
      {toContact.slice(0, TRAY_ROWS).map((person) => (
        <ContactItem
          key={person.id}
          person={person}
          companies={extras.companies}
          onChoose={onContact}
        />
      ))}
      {toContact.length > TRAY_ROWS && (
        <button type="button" className={styles.trayMore} onClick={onSeeAllContacts}>
          {`Ver todas (${String(toContact.length)})`}
        </button>
      )}
    </Tray>
  );
}

function UnassignedTray({
  who,
  trays,
  onOpen,
}: Pick<AgendaTraysProps, "who" | "trays" | "onOpen">) {
  const { unassigned } = trays;
  if (unassigned.length === 0) return null;
  return (
    <Tray
      id="unassigned"
      tone={styles.trayWarn}
      title={`Por asignar (${String(unassigned.length)})`}
    >
      {unassigned.slice(0, TRAY_ROWS).map((action) => (
        <Item
          key={action.id}
          action={action}
          title={action.empresa}
          detail={`${labelOf(ACTION_TYPES, action.tipo)} · ${action.tipo === "datos" ? "base de datos" : whenOf(action)} · de ${nameOf(who, action.creada_por)}`}
          button={canReassign(who, action) ? "Asignar" : ""}
          assigns
          onOpen={onOpen}
        />
      ))}
      <More total={unassigned.length} />
    </Tray>
  );
}

function ReassignTray({ who, trays, onOpen }: Pick<AgendaTraysProps, "who" | "trays" | "onOpen">) {
  const { reassign } = trays;
  const isHunter = who.role === "hunter";
  if (reassign.length === 0) return null;
  const count = String(reassign.length);
  return (
    <Tray
      id="reassign-requests"
      tone={styles.trayWarn}
      title={
        isHunter ? `Avisaste que no podés (${count})` : `Piden que se la pasen a otro (${count})`
      }
    >
      {reassign.slice(0, TRAY_ROWS).map((action) => (
        <Item
          key={action.id}
          action={action}
          title={action.empresa}
          detail={`${isHunter ? "" : `${nameOf(who, action.hunter_id)} · `}${whenOf(action)}${action.no_puede_motivo ? ` · ${action.no_puede_motivo}` : ""}`}
          button={!isHunter && canReassign(who, action) ? "Cambiar hunter" : ""}
          assigns={!isHunter}
          onOpen={onOpen}
        />
      ))}
      <More total={reassign.length} />
    </Tray>
  );
}

function DataListsTray({
  who,
  trays,
  extras,
  onOpen,
}: Pick<AgendaTraysProps, "who" | "trays" | "extras" | "onOpen">) {
  const { dataLists } = trays;
  const isHunter = who.role === "hunter";
  if (dataLists.length === 0) return null;
  return (
    <Tray id="data-lists" title={`Bases para trabajar (${String(dataLists.length)})`}>
      {dataLists.slice(0, TRAY_ROWS).map((action) => {
        const { total, contacted, signups } = extras.progress[action.id] ?? {
          total: 0,
          contacted: 0,
          signups: 0,
        };
        return (
          <Item
            key={action.id}
            action={action}
            title={action.empresa}
            detail={
              <>
                {`${isHunter ? "" : `${nameOf(who, action.hunter_id)} · `}${String(contacted)} de ${String(total)} contactados${signupsText(signups)}${action.vence ? " · " : ""}`}
                {action.vence && <span>hasta el {dateLabel(action.vence)}</span>}
              </>
            }
            button="Abrir"
            assigns={false}
            onOpen={onOpen}
          />
        );
      })}
      <More total={dataLists.length} />
    </Tray>
  );
}

export function AgendaTrays(props: AgendaTraysProps) {
  const { toContact, unassigned, reassign, dataLists } = props.trays;
  if (toContact.length + unassigned.length + reassign.length + dataLists.length === 0) return null;
  return (
    <div className={styles.trays}>
      <ContactTray {...props} />
      <UnassignedTray {...props} />
      <ReassignTray {...props} />
      <DataListsTray {...props} />
    </div>
  );
}
