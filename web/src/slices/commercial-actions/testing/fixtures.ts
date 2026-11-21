// Test support: people and rows invented for these tests.
import type { CommercialPeople } from "@/shared/lib/commercial-actions/people-query.ts";
import type { ActionRow, ListedAction, PersonRow } from "../api/rows.ts";
import type { Who } from "../model/who.ts";

export const TEAM: CommercialPeople = {
  h1: { id: "h1", nombre: "Sofía Paz", rol: "hunter", lider_id: "l1" },
  h2: { id: "h2", nombre: "Tomás Ríos", rol: "hunter", lider_id: "l1" },
  h9: { id: "h9", nombre: "Otro Hunter", rol: "hunter", lider_id: "l9", es_prueba: true },
  l1: { id: "l1", nombre: "Laura Méndez", rol: "lider" },
  l9: { id: "l9", nombre: "Otra Líder", rol: "lider" },
  o1: { id: "o1", nombre: "Mariana Costa", rol: "vip", lider_id: "l1" },
  a1: { id: "a1", nombre: "Admin", rol: "admin" },
};

export function whoIs(role: string, me: string, isAdmin = false): Who {
  return { me, role, isAdmin, people: TEAM };
}

export const officer = whoIs("vip", "o1");
export const hunter = whoIs("hunter", "h1");
export const leader = whoIs("lider", "l1");
export const administrator = whoIs("admin", "a1", true);

const BASE: ActionRow = {
  id: "g1",
  serie_id: "s1",
  empresa: "ACME SA",
  empresa_key: "acme sa",
  cuit: "30900001118",
  tipo: "accion",
  modalidad: "presencial",
  frecuencia: "unica",
  cada_dias: null,
  veces: null,
  vez: null,
  fecha: "2026-11-10",
  vence: null,
  hora_desde: "10:00:00",
  hora_hasta: "12:00:00",
  lugar: null,
  estado: "planificada",
  origen: "derivada",
  creada_por: "o1",
  dueno_id: "o1",
  hunter_id: "h1",
  lider_id: null,
  dotacion: null,
  asistentes: null,
  nota: null,
  no_puede_at: null,
  no_puede_motivo: null,
  prueba: false,
  visto_hunter: true,
  visto_dueno: true,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

export function anAction(fields: Partial<ActionRow> = {}): ActionRow {
  return { ...BASE, ...fields };
}

export function aListedAction(fields: Partial<ListedAction> = {}): ListedAction {
  return { ...BASE, n_pros: 0, n_altas: 0, n_datos: 0, ...fields };
}

export function aPerson(fields: Partial<PersonRow> = {}): PersonRow {
  return {
    id: "p1",
    gestion_id: "g1",
    nombre: "Ana Pérez",
    contacto: null,
    cuil: null,
    referencia: null,
    paquete: null,
    estado: "prospecto",
    motivo: null,
    proximo: null,
    fecha_alta: null,
    renta: null,
    creado_por: "h1",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...fields,
  };
}
