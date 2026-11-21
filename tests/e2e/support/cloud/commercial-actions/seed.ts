// Example data; every company and person is made up, with CUITs of the unassigned 30-90 range.
import { type CloudState } from "../state.ts";
import {
  type ActionRow,
  type CommercialDb,
  dayFromToday,
  enableCommercialActions,
  nextId,
  nowIso,
  PEOPLE,
  type PersonKey,
  type ProspectRow,
  profileSummaries,
  today,
} from "./model.ts";
import {
  afterInsertAction,
  afterWriteProspect,
  beforeInsertAction,
  beforeWriteProspect,
} from "./rules.ts";
import { COMMERCIAL_RPC } from "./rpc.ts";

const COMPANIES: readonly (readonly [PersonKey, string, string])[] = [
  ["officer", "ALIMENTOS DEL SUR SA", "30900001118"],
  ["officer", "LOGISTICA ANDINA SRL", "30900002114"],
  ["officer", "CLINICA DEL PARQUE SA", "30900003110"],
  ["officer", "METALURGICA NORTE SA", "30900004117"],
  ["officer", "TEXTIL ARGENTA SA", "30900005113"],
  ["officer", "SUPERMERCADOS DEL VALLE SA", "30900006110"],
  ["officer2", "TRANSPORTES RIO SA", "30900007116"],
  ["officer2", "CONSTRUCTORA PAMPA SA", "30900008112"],
];

const NURSING_STAFF = [
  "Ana Gómez",
  "Bruno Díaz",
  "Carla Funes",
  "Daniel Ortiz",
  "Elena Vidal",
  "Federico Luna",
  "Gabriela Ponce",
  "Hernán Sáez",
  "Inés Molina",
  "Jorge Benítez",
  "Karina Rojas",
  "Lucas Herrera",
  "Marta Acosta",
  "Nicolás Vera",
  "Olga Suárez",
];

function addCompanies(db: CommercialDb): void {
  for (const [owner, empresa, cuit] of COMPANIES) {
    db.companies.push({
      id: db.companies.length + 1,
      user_id: PEOPLE[owner].id,
      empresa,
      cuits: [cuit],
      config: "BAU",
      asesores: [
        { nombre: PEOPLE[owner].name, celular: "11 5555-0000", email: PEOPLE[owner].email },
      ],
      rubro: null,
      created_at: nowIso(),
    });
  }
}

export interface SeededActions {
  forwardedWithQuestion: ActionRow;
  dataList: ActionRow;
  cannotAttend: ActionRow;
  doneWithSignups: ActionRow;
}

/** Fills commercial actions the way a team that has been working for a while would. */
export function seedCommercialActions(state: CloudState): SeededActions {
  const db = enableCommercialActions(state);
  const lookup = (id: string | null) =>
    profileSummaries(state).find((profile) => profile.id === id) ?? null;
  const create = (who: PersonKey, body: Partial<ActionRow>): ActionRow => {
    const user = PEOPLE[who];
    const action = beforeInsertAction(db, lookup, user, body);
    db.actions.push(action);
    afterInsertAction(db, user, action);
    return action;
  };
  const addProspects = (
    who: PersonKey,
    action: ActionRow,
    rows: readonly Partial<ProspectRow>[],
  ): ProspectRow[] =>
    rows.map((row) => {
      const prospect = beforeWriteProspect(
        db,
        PEOPLE[who],
        { gestion_id: action.id, ...row },
        null,
      );
      db.prospects.push(prospect);
      afterWriteProspect(db, PEOPLE[who], prospect, null);
      return prospect;
    });
  const change = (who: PersonKey, prospect: ProspectRow, body: Partial<ProspectRow>): void => {
    const next = beforeWriteProspect(db, PEOPLE[who], body, prospect);
    afterWriteProspect(db, PEOPLE[who], next, prospect);
    Object.assign(prospect, next);
  };
  const prospected = (who: PersonKey, action: ActionRow, names: readonly Partial<ProspectRow>[]) =>
    addProspects(
      who,
      action,
      names.map((row) => ({ estado: "prospecto", ...row })),
    );

  addCompanies(db);

  // 1) Forwarded to Sofía (new, with a question of hers Mariana has not read)
  const forwardedWithQuestion = create("officer", {
    empresa: "ALIMENTOS DEL SUR SA",
    origen: "derivada",
    hunter_id: PEOPLE.hunter.id,
    tipo: "posicion",
    estado: "planificada",
    fecha: dayFromToday(1),
    hora_desde: "10:00",
    hora_hasta: "12:00",
    lugar: "Planta Avellaneda, comedor",
    nota: "Hablar con Carla de RRHH. 180 empleados.",
  });
  db.messages.push({
    id: nextId(db),
    gestion_id: forwardedWithQuestion.id,
    autor: PEOPLE.hunter.id,
    tipo: "msg",
    texto: "¿Llevo el flyer de combustible o el genérico? Tienen flota propia.",
    created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  });

  // 2) For the leader to assign
  create("officer", {
    empresa: "LOGISTICA ANDINA SRL",
    origen: "derivada",
    lider_id: PEOPLE.leader.id,
    tipo: "feria",
    estado: "planificada",
    fecha: dayFromToday(2),
    hora_desde: "14:00",
    hora_hasta: "17:00",
    lugar: "Depósito central",
    nota: "Feria de beneficios. Necesitamos a alguien con stand.",
  });

  // 3) A data list for Tomás (15 people, some already worked on)
  const dataList = create("officer", {
    empresa: "CLINICA DEL PARQUE SA",
    origen: "derivada",
    hunter_id: PEOPLE.hunter2.id,
    tipo: "datos",
    modalidad: "virtual",
    estado: "planificada",
    fecha: dayFromToday(-3),
    vence: dayFromToday(12),
    nota: "Personal de enfermería que cobra en otro banco. Ofrecer Plus.",
  });
  const staff = addProspects(
    "officer",
    dataList,
    NURSING_STAFF.map((nombre, index) => ({
      nombre,
      contacto: `11 5${String(100 + index)}-${String(2000 + index * 7)}`,
      referencia: `Legajo ${String(300 + index)}`,
      estado: "a_contactar",
    })),
  );
  const [ana, bruno, carla, daniel, elena] = staff as [
    ProspectRow,
    ProspectRow,
    ProspectRow,
    ProspectRow,
    ProspectRow,
  ];
  change("hunter2", ana, { estado: "alta", paquete: "plus" });
  change("hunter2", bruno, { estado: "en_gestion", proximo: today() });
  change("hunter2", carla, { estado: "descartado", motivo: "ya_galicia" });
  change("hunter2", daniel, { estado: "prospecto", proximo: dayFromToday(-1) });
  change("hunter2", elena, { estado: "descartado", motivo: "no_contesta" });

  // 4) Tomás said he cannot attend
  const cannotAttend = create("officer", {
    empresa: "METALURGICA NORTE SA",
    origen: "derivada",
    hunter_id: PEOPLE.hunter2.id,
    tipo: "accion",
    estado: "planificada",
    fecha: dayFromToday(3),
    hora_desde: "09:00",
    hora_hasta: "13:00",
    lugar: "Parque industrial, nave 4",
  });
  COMMERCIAL_RPC.gestion_no_puedo?.({
    state,
    db,
    user: PEOPLE.hunter2,
    args: {
      p_gestion: cannotAttend.id,
      p_motivo: "Ese día tengo la capacitación de onboarding.",
    },
  });

  // 5) What Sofía did last week (signups with and without a package)
  const doneWithSignups = create("hunter", {
    empresa: "TEXTIL ARGENTA SA",
    dueno_id: PEOPLE.officer.id,
    origen: "propia",
    tipo: "accion",
    estado: "realizada",
    fecha: dayFromToday(-6),
    hora_desde: "09:30",
    hora_hasta: "12:30",
    dotacion: 120,
    asistentes: 35,
    nota: "Muy buena recepción.",
  });
  const [pablo, rocio, sergio, valeria, walter, ximena] = prospected("hunter", doneWithSignups, [
    { nombre: "Pablo Medina", cuil: "20123456786" },
    { nombre: "Rocío Ledesma" },
    { nombre: "Sergio Paredes" },
    { nombre: "Valeria Quiroga" },
    { nombre: "Walter Ibáñez", referencia: "Turno noche" },
    { nombre: "Ximena Toledo" },
  ]) as [ProspectRow, ProspectRow, ProspectRow, ProspectRow, ProspectRow, ProspectRow];
  change("hunter", pablo, { estado: "alta", paquete: "plus" });
  change("hunter", rocio, { estado: "alta", paquete: "gold" });
  change("hunter", sergio, { estado: "alta", paquete: "caja" });
  change("hunter", valeria, { estado: "descartado", motivo: "no_interesa" });
  change("hunter", walter, { estado: "en_gestion", proximo: today() });
  change("hunter", ximena, { estado: "prospecto", proximo: dayFromToday(-4) });

  // 6) Diego forwarded something to Sofía this afternoon (to try an overlap)
  create("officer2", {
    empresa: "TRANSPORTES RIO SA",
    origen: "derivada",
    hunter_id: PEOPLE.hunter.id,
    tipo: "posicion",
    estado: "planificada",
    fecha: today(),
    hora_desde: "15:00",
    hora_hasta: "17:00",
    lugar: "Base Barracas",
  });

  // 7) Tomás, two weeks ago
  const fair = create("hunter2", {
    empresa: "SUPERMERCADOS DEL VALLE SA",
    dueno_id: PEOPLE.officer.id,
    origen: "propia",
    tipo: "feria",
    estado: "realizada",
    fecha: dayFromToday(-13),
    hora_desde: "10:00",
    hora_hasta: "14:00",
    asistentes: 60,
  });
  const [andrea, martin] = prospected("hunter2", fair, [
    { nombre: "Andrea Cabrera" },
    { nombre: "Martín Godoy" },
    { nombre: "Lorena Ferreyra" },
  ]) as [ProspectRow, ProspectRow, ProspectRow];
  change("hunter2", andrea, { estado: "alta", paquete: "black" });
  change("hunter2", martin, { estado: "alta", paquete: "platinum" });

  // What already exists is not news, except what is new in this example.
  for (const action of db.actions) {
    if (action.id !== forwardedWithQuestion.id) action.visto_hunter = true;
    action.visto_dueno = true;
  }
  return { forwardedWithQuestion, dataList, cannotAttend, doneWithSignups };
}
