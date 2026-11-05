// Who can do what on an action. What is written is decided by the database (migrations 014, 015 and
// 045): this says what is offered, so nobody finds a button that the database would refuse.
import type {
  CommercialPeople,
  CommercialPerson,
} from "@/shared/lib/commercial-actions/people-query.ts";
import type { ActionRow } from "../api/rows.ts";

export interface Who {
  readonly me: string;
  /** Today's profile, also in the preview of a profile. */
  readonly role: string;
  /** The account of the administrator. */
  readonly isAdmin: boolean;
  readonly people: CommercialPeople;
  /** They could not be read: not being there says nothing about somebody (invariant 24). */
  readonly peopleFailed?: boolean;
}

export type InnerTab = "empresas" | "agenda" | "lista" | "tablero";
export type TabChoice = readonly [InnerTab, string];

/** The solapas of each profile. */
export function tabsOf(role: string): readonly TabChoice[] {
  if (role === "hunter") {
    return [
      ["agenda", "Mi agenda"],
      ["lista", "Mis gestiones"],
      ["tablero", "Tablero"],
    ];
  }
  if (role === "lider") {
    return [
      ["agenda", "Agenda del equipo"],
      ["tablero", "Tablero del equipo"],
      ["lista", "Gestiones del equipo"],
    ];
  }
  return [
    ["empresas", "Mis empresas"],
    ["agenda", "Agenda"],
    ["lista", "Gestiones"],
    ["tablero", "Tablero"],
  ];
}

export function subtitleOf(role: string): string {
  if (role === "hunter") {
    return "Tu agenda con día y horario, las bases de datos para contactar y lo que te derivaron. Después de cada acción cargá los prospectos y marcá las altas (con o sin paquete). Si algo no está claro, preguntá en la conversación de la acción.";
  }
  if (role === "lider") {
    return "Cómo viene tu equipo: la agenda de cada hunter, lo que hay que asignar, quién pidió que se la pasen a otro, prospectos, altas y conversión.";
  }
  return "Lo que se hizo con tus empresas. Vos derivás (a un hunter, o al líder para que la reparta); la carga la hacen los hunters.";
}

/** How one reads a person: "Vos", or who it was. */
export function nameOf({ me, people, peopleFailed }: Who, id: string | null | undefined): string {
  if (!id) return "—";
  if (id === me) return "Vos";
  return people[id]?.nombre ?? (peopleFailed ? "—" : "Usuario dado de baja");
}

/** "Tu empresa" or "Empresa de Laura": never "Empresa de Vos". */
export function ownerText(who: Who, id: string | null): string {
  return id === who.me ? "Tu empresa" : `Empresa de ${nameOf(who, id)}`;
}

export function canEdit({ me, isAdmin }: Who, action: ActionRow): boolean {
  return action.hunter_id === me || action.creada_por === me || isAdmin;
}

export function canDelete({ me, isAdmin }: Who, action: ActionRow): boolean {
  return action.creada_por === me || isAdmin;
}

/** A leader sees it in the `lider_id` of each person. */
export function isOfMyTeam({ me, people }: Who, hunter: string | null): boolean {
  const leader = hunter ? people[hunter]?.lider_id : null;
  return Boolean(leader && leader === me);
}

/** Saving over an overlap: the administrator or the leader of that hunter. The database stops it. */
export function canForce(who: Who, hunter: string | null): boolean {
  return who.isAdmin || (who.role === "lider" && isOfMyTeam(who, hunter));
}

/**
 * Changing the hunter: the administrator, the officer who forwarded it while it is not done, and the
 * leader (who assigns it or who has that hunter). The hunter never.
 */
export function canReassign(
  who: Who,
  action: Pick<ActionRow, "estado" | "origen" | "creada_por" | "lider_id" | "hunter_id">,
): boolean {
  if (who.isAdmin) return true;
  if (action.estado === "realizada") return false;
  if (action.origen === "derivada" && action.creada_por === who.me) return true;
  return who.role === "lider" && (action.lider_id === who.me || isOfMyTeam(who, action.hunter_id));
}

function byName(people: CommercialPeople) {
  return (a: string, b: string) => (people[a]?.nombre ?? "").localeCompare(people[b]?.nombre ?? "");
}

/**
 * Only an officer asks for the hidden occupation: the leader and the administrator already see what
 * their people have, and the database does not answer a hunter.
 */
export function asksHiddenOccupancy({ isAdmin, role }: Who): boolean {
  return !isAdmin && role !== "hunter" && role !== "lider";
}

export function leadersOf({ people }: Who): readonly string[] {
  return Object.values(people)
    .filter(({ rol }) => rol === "lider")
    .map(({ id }) => id)
    .toSorted(byName(people));
}

/** An officer can send it "to the team", for the leader to assign it. */
export function canSendToLeader(who: Who): boolean {
  return who.role !== "hunter" && who.role !== "lider" && !who.isAdmin && leadersOf(who).length > 0;
}

/** Hunters to choose from: a leader, only those of the team. */
export function huntersOf(
  { me, role, isAdmin, people }: Who,
  onlyTeam: boolean,
): readonly CommercialPerson[] {
  const isLimited = onlyTeam && !isAdmin && role === "lider";
  return Object.values(people)
    .filter(({ rol, lider_id: leader }) => rol === "hunter" && (!isLimited || leader === me))
    .toSorted((a, b) => a.nombre.localeCompare(b.nombre));
}

export interface LeaderChoice {
  readonly id: string;
  readonly label: string;
}

/** For "Que la asigne el líder": one's own first. */
export function leaderChoices(who: Who, myLeader: string | null): readonly LeaderChoice[] {
  const leaders = leadersOf(who);
  const mine = myLeader && leaders.includes(myLeader) ? myLeader : null;
  const ordered = mine ? [mine, ...leaders.filter((id) => id !== mine)] : leaders;
  return ordered.map((id) => ({
    id,
    label: `${who.people[id]?.nombre ?? ""}${id === mine ? " (tu líder)" : ""}`,
  }));
}

export type ActionCommand =
  | "complete"
  | "assign"
  | "cannot"
  | "flyer"
  | "unread"
  | "edit"
  | "repeat"
  | "delete";

/** What can be done with the work of the action. */
function workCommands(who: Who, action: ActionRow): readonly ActionCommand[] {
  const { estado, hunter_id: hunter, no_puede_at: cannot } = action;
  const isPlanned = estado === "planificada";
  const commands: ActionCommand[] = [];
  if (canEdit(who, action) && isPlanned && hunter) commands.push("complete");
  if (canReassign(who, action) && estado !== "cancelada") commands.push("assign");
  if (hunter === who.me && isPlanned && !cannot) commands.push("cannot");
  return commands;
}

/** The buttons an action offers to this person, in their order on screen. */
export function commandsFor(
  who: Who,
  action: ActionRow,
  canSearchCompanies: boolean,
): readonly ActionCommand[] {
  const edits = canEdit(who, action);
  return [
    ...workCommands(who, action),
    ...(who.role === "hunter" || canSearchCompanies ? (["flyer"] as const) : []),
    "unread",
    ...(edits ? (["edit"] as const) : []),
    ...(edits && action.frecuencia === "repite" && !action.veces ? (["repeat"] as const) : []),
    ...(canDelete(who, action) ? (["delete"] as const) : []),
  ];
}
