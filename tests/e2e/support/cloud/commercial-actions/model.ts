// Commercial actions (migration 045): example people, companies with CUIT and the tables,
// all in memory and shared by every browser opened on the same cloud. Column names and
// values are contracts with the database, so they stay as they are.
import { type CloudState } from "../state.ts";
import { type CloudUser } from "../users.ts";
import { type CommercialDb } from "./rows.ts";

export type {
  ActionRow,
  CommercialDb,
  CompanyRow,
  EventRow,
  MessageRow,
  ProspectRow,
  ReadMarkRow,
} from "./rows.ts";

function personId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

interface Person extends CloudUser {
  leader?: PersonKey;
}

export type PersonKey = "officer" | "officer2" | "hunter" | "hunter2" | "hunter3" | "leader";

export const PEOPLE: Readonly<Record<PersonKey, Person>> = {
  officer: {
    id: personId(101),
    email: "mariana.costa.demo@bancogalicia.com.ar",
    name: "Mariana Costa",
    role: "vip",
    leader: "leader",
  },
  officer2: {
    id: personId(102),
    email: "diego.ruiz.demo@bancogalicia.com.ar",
    name: "Diego Ruiz",
    role: "asesor",
    leader: "leader",
  },
  hunter: {
    id: personId(201),
    email: "sofia.paz.demo@bancogalicia.com.ar",
    name: "Sofía Paz",
    role: "hunter",
    leader: "leader",
  },
  hunter2: {
    id: personId(202),
    email: "tomas.rios.demo@bancogalicia.com.ar",
    name: "Tomás Ríos",
    role: "hunter",
    leader: "leader",
  },
  hunter3: {
    id: personId(203),
    email: "julia.sosa.demo@bancogalicia.com.ar",
    name: "Julia Sosa",
    role: "hunter",
    leader: "leader",
  },
  leader: {
    id: personId(301),
    email: "laura.mendez.demo@bancogalicia.com.ar",
    name: "Laura Méndez",
    role: "lider",
  },
};

function grantCommercialActions(state: CloudState): void {
  const roles = state.bucketJson["_facultades.json"].roles;
  roles.vip = { ...roles.asesor, gestiones: true };
  roles.asesor = { ...roles.asesor, gestiones: true };
  roles.hunter = { opcion_9: true, gestiones: true, promos_buscar: true };
  roles.lider = { gestiones: true };
}

export function enableCommercialActions(state: CloudState): CommercialDb {
  if (state.commercialActions) return state.commercialActions;
  for (const [key, { id, email, name, role }] of Object.entries(PEOPLE)) {
    state.users[key] = { id, email, name, role };
  }
  grantCommercialActions(state);
  const db: CommercialDb = {
    actions: [],
    prospects: [],
    messages: [],
    readMarks: [],
    events: [],
    companies: [],
    flag: "on",
    sequence: 1000,
  };
  state.commercialActions = db;
  return db;
}

export function nextId(db: CommercialDb): string {
  db.sequence += 1;
  return `00000000-0000-4000-9000-${String(db.sequence).padStart(12, "0")}`;
}

export function leaderOf(id: string | null): string | null {
  const person = Object.values(PEOPLE).find((candidate) => candidate.id === id);
  return person?.leader ? PEOPLE[person.leader].id : null;
}

export interface ProfileSummary {
  id: string;
  nombre: string;
  rol: string;
  lider_id: string | null;
  es_prueba: boolean;
}

export function profileSummaries(state: CloudState): ProfileSummary[] {
  return Object.values(state.users).map((user) => ({
    id: user.id,
    nombre: user.name,
    rol: user.role,
    lider_id: leaderOf(user.id),
    es_prueba: false,
  }));
}

export class DatabaseFailure extends Error {
  readonly code = "P0001";
}

export function fail(message: string): never {
  throw new DatabaseFailure(message);
}

export function nowIso(): string {
  return new Date().toISOString();
}

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${String(date.getFullYear())}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** The database keeps times as HH:MM:SS. */
export function withSeconds(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.length === 5 ? `${time}:00` : time;
}

export function minutes(time: string | null | undefined): number | null {
  const match = /^(\d\d):(\d\d)/.exec(time ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function endMinutes(from: string | null, to: string | null): number {
  return to ? (minutes(to) ?? 0) : Math.min((minutes(from) ?? 0) + 60, 1439);
}

export function clockTime(total: number): string {
  return `${twoDigits(Math.floor(total / 60))}:${twoDigits(total % 60)}`;
}
