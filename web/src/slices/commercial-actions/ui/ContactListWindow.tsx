// Everybody to contact: those left behind first and then those of today. Those with a future date do
// not go here (decision of the owner).
import { Button } from "@/shared/ui/index.ts";
import type { AgendaExtras, PersonToContact } from "../api/agenda.ts";
import { contactGroups } from "../model/agenda-trays.ts";
import { number } from "../model/formatting.ts";
import { MAX_PEOPLE_ON_LIST } from "../model/labels.ts";
import { ActionWindow } from "./ActionWindow.tsx";
import { ContactItem } from "./AgendaTrays.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Agenda.module.css";

function Group({
  title,
  detail,
  people,
  extras,
  onChoose,
}: {
  readonly title: string;
  readonly detail: string;
  readonly people: readonly PersonToContact[];
  readonly extras: AgendaExtras;
  readonly onChoose: (person: PersonToContact) => void;
}) {
  if (people.length === 0) return null;
  return (
    <>
      <h4 className={styles.contactGroup}>
        {title} ({people.length})<span className={base.mini}>{detail}</span>
      </h4>
      <div className={styles.trayList}>
        {people.map((person) => (
          <ContactItem
            key={person.id}
            person={person}
            companies={extras.companies}
            onChoose={onChoose}
          />
        ))}
      </div>
    </>
  );
}

export function ContactListWindow({
  extras,
  onClose,
  onChoose,
}: {
  readonly extras: AgendaExtras;
  readonly onClose: () => void;
  readonly onChoose: (person: PersonToContact) => void;
}) {
  const { overdue, ofToday } = contactGroups(extras.toContact);
  return (
    <ActionWindow
      isWide
      title="Para contactar"
      subtitle="Las personas a las que les pusiste fecha de próximo contacto. Tocá una y se abre su acción con esa persona marcada."
      onClose={onClose}
    >
      {extras.toContact.length >= MAX_PEOPLE_ON_LIST && (
        <p className={base.windowSubtitle}>
          Son muchas: se muestran las primeras {number(MAX_PEOPLE_ON_LIST)}.
        </p>
      )}
      <div className={styles.contacts}>
        <Group
          title="Vencidas"
          detail="tenían fecha anterior a hoy"
          people={overdue}
          extras={extras}
          onChoose={onChoose}
        />
        <Group
          title="Hoy"
          detail="les toca hoy"
          people={ofToday}
          extras={extras}
          onChoose={onChoose}
        />
      </div>
      <div className={base.windowFoot}>
        <Button variant="ghost" data-testid="window-dismiss" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </ActionWindow>
  );
}
