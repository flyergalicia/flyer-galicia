// What the reference screenshots show. Every person and company is made up, and the repository
// is public: nothing here may come from the real database.
import { type Cloud, type Row } from "../../support/cloud/index.ts";
import { addDesign } from "../../support/cloud/designs.ts";
import { seedCards, seedComparison, seedHandLoaded } from "../benchmark/benchmark-data.ts";

const DAY_MS = 86_400_000;
const HUNTER_ID = "00000000-0000-4000-8000-0000000000b0";
const PENDING_ID = "00000000-0000-4000-8000-0000000000b1";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export const REFERENCE_HUNTER = {
  id: HUNTER_ID,
  email: "hunter.prueba@bancogalicia.com.ar",
  name: "Hunter Prueba",
  role: "hunter",
};

function mailOf(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@bancogalicia.com.ar`;
}

function officer(name: string, phone: string): Row {
  return { nombre: name, celular: phone, email: mailOf(name) };
}

function companies(): Row[] {
  return [
    {
      id: 1,
      empresa: "ALIMENTOS DEL SUR SA",
      cuits: ["30900001118"],
      config: "BAU",
      asesores: [officer("Ana Perez", "11 4444 5555")],
    },
    {
      id: 2,
      empresa: "CLINICA DEL PARQUE SA",
      cuits: ["30900003110"],
      config: "SIN",
      asesores: [officer("Luis Gomez", "11 4444 6666"), officer("Sara Rios", "11 4444 7777")],
    },
    {
      id: 3,
      empresa: "LOGISTICA ANDINA SRL",
      cuits: ["30900002114"],
      config: "BAU",
      asesores: [],
    },
    {
      id: 4,
      empresa: "METALURGICA NORTE SA",
      cuits: ["30900004117"],
      config: "BAU",
      asesores: [officer("Ana Perez", "11 4444 5555")],
    },
  ];
}

function savedAdvisors(): Row[] {
  return [
    {
      id: "a1",
      name: "Ana Perez",
      nombre: "Ana Perez",
      celular: "11 4444 5555",
      email: "ana.perez@bancogalicia.com.ar",
      orden: 0,
    },
    {
      id: "a2",
      name: "Luis Gomez",
      nombre: "Luis Gomez",
      celular: "11 4444 6666",
      email: "luis.gomez@bancogalicia.com.ar",
      orden: 1,
    },
  ];
}

function profile(
  id: string | undefined,
  name: string,
  access: { role: string; status: string },
  days: number,
): Row {
  return {
    id,
    full_name: name,
    email: mailOf(name),
    email_asesor: mailOf(name),
    ...access,
    last_login: daysAgoIso(days),
    created_at: daysAgoIso(days + 30),
  };
}

function profiles(cloud: Cloud): Row[] {
  const active = "active";
  return [
    profile(cloud.users.admin?.id, "Admin Prueba", { role: "admin", status: active }, 0),
    profile(cloud.users.asesor?.id, "Asesor Prueba", { role: "asesor", status: active }, 1),
    profile(cloud.users.asesor2?.id, "Otra Persona", { role: "asesor", status: active }, 3),
    profile(HUNTER_ID, "Hunter Prueba", { role: "hunter", status: active }, 6),
    profile(PENDING_ID, "Cuenta Pendiente", { role: "vip", status: "pending" }, 12),
  ];
}

function flyerLog(userId: string | undefined, days: number): Row {
  return {
    user_id: userId,
    is_bulk: false,
    bulk_count: 1,
    flyer_type: JSON.stringify({ opcion: 9 }),
    created_at: daysAgoIso(days),
  };
}

function flyerLogs(cloud: Cloud): Row[] {
  return [
    flyerLog(cloud.users.asesor?.id, 1),
    flyerLog(cloud.users.asesor?.id, 2),
    flyerLog(HUNTER_ID, 3),
  ];
}

function designs(cloud: Cloud): void {
  addDesign(cloud, {
    id: "d1",
    nombre: "Combustible con farmacias",
    empresa: "ALIMENTOS DEL SUR SA",
    base_name: "Combustible",
    estado: "pedido",
    datos: { cambios: [] },
    created_at: "2026-10-20T15:00:00.000Z",
    updated_at: "2026-10-28T15:00:00.000Z",
    pedido_at: "2026-10-28T15:00:00.000Z",
  });
  addDesign(cloud, {
    id: "d2",
    nombre: "Combustible sin cashback",
    base_name: "Combustible",
    datos: { cambios: [] },
    created_at: "2026-10-22T15:00:00.000Z",
    updated_at: "2026-10-27T15:00:00.000Z",
  });
}

/** Fills the simulated cloud with what the reference screens show. */
export function seedReferenceData(cloud: Cloud): void {
  cloud.companies = companies();
  cloud.savedAdvisors = savedAdvisors();
  cloud.profiles = profiles(cloud);
  cloud.flyerLogs = flyerLogs(cloud);
  designs(cloud);
  seedComparison(cloud);
  seedHandLoaded(cloud);
  seedCards(cloud);
  cloud.seedCommercialActions();
  cloud.setPermissions("asesor", {
    opcion_1: false,
    opcion_9: true,
    promos_buscar: true,
    estudio: true,
    padron_buscar: true,
    asesores_guardados: true,
  });
  cloud.setPermissions("hunter", { opcion_1: false, opcion_9: true });
}
