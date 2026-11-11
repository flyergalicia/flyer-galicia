// Test support: a simulated cloud with what the screens of Gestiones need of the database.
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import {
  type Answer,
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { TEAM } from "./fixtures.ts";

type Row = object;

export const ME = INVENTED_USER.id;

export interface CommercialCloud extends AppAnswers {
  readonly role?: string;
  readonly isTestAccount?: boolean;
  readonly actions?: readonly Row[] | Answer;
  readonly companies?: readonly Row[] | Answer;
  readonly people?: readonly Row[] | Answer;
  readonly prospects?: readonly Row[] | Answer;
  readonly messages?: readonly Row[] | Answer;
  readonly events?: readonly Row[] | Answer;
  readonly personsOfTeam?: readonly Row[] | Answer;
  readonly unread?: readonly Row[] | Answer;
  readonly hunterDay?: readonly Row[] | Answer;
  readonly dayOccupancy?: readonly Row[] | Answer;
  /** What gestiones_lista answers; by default, the `actions`. */
  readonly list?: readonly Row[] | Answer;
  /** Other functions of the database, by name. */
  readonly functions_?: Readonly<Record<string, Answer>>;
}

/** What was sent, to answer with it. */
export function fieldsOf(body: unknown): object {
  return typeof body === "object" && body !== null ? body : {};
}

export const CUT: Answer = () => {
  throw new TypeError("Failed to fetch");
};

export const FAILS: Answer = () => jsonResponse({ message: "falla simulada" }, 500);

function answerOf(rows: readonly Row[] | Answer | undefined): Answer {
  if (typeof rows === "function") return rows;
  return () => jsonResponse(rows ?? []);
}

const wantsOne = ({ headers }: RecordedRequest) =>
  headers.get("Accept")?.includes("vnd.pgrst.object") ?? false;

function eq(request: RecordedRequest, column: string): string | null {
  return request.query.get(column)?.replace(/^eq\./, "") ?? null;
}

function tableOf(rows: readonly Row[] | Answer | undefined, column: string): Answer {
  if (typeof rows === "function") return rows;
  return (request) => {
    const value = eq(request, column);
    const all = rows ?? [];
    const found = value === null ? all : all.filter((row) => Reflect.get(row, column) === value);
    if (!wantsOne(request)) return jsonResponse(found);
    return jsonResponse(found[0] ?? null);
  };
}

export function commercialHarness(cloud: CommercialCloud = {}) {
  const {
    role = "vip",
    isTestAccount = false,
    actions,
    companies,
    prospects,
    messages,
    events,
    personsOfTeam = Object.values(TEAM),
    unread,
    hunterDay,
    dayOccupancy,
    list,
    functions_ = {},
    tables,
    files,
    ...rest
  } = cloud;
  const rpcAnswers: Readonly<Record<string, Answer>> = {
    gestiones_lista: answerOf(list ?? (typeof actions === "function" ? [] : actions)),
    gestiones_personas: answerOf(personsOfTeam),
    gestiones_mensajes_nuevos: answerOf(unread),
    gestiones_ocupado: answerOf(hunterDay),
    gestiones_dia: answerOf(dayOccupancy),
    ...functions_,
  };
  const harness = createAppHarness({
    commercialFlag: "on",
    ...rest,
    profile: { ...ADVISOR, role, es_prueba: isTestAccount, full_name: "Ana Inventada" },
    files: {
      "_facultades.json": { roles: { [role]: { gestiones: true, padron_buscar: true } } },
      ...files,
    },
    rpc: (request) => {
      const answer = rpcAnswers[request.path.replace("/rest/v1/rpc/", "")];
      return answer ? answer(request) : jsonResponse(null);
    },
    tables: {
      gestiones: tableOf(actions, "id"),
      padron_empresas: answerOf(companies),
      gestion_prospectos: tableOf(prospects, "gestion_id"),
      gestion_mensajes: tableOf(messages, "gestion_id"),
      gestion_eventos: tableOf(events, "gestion_id"),
      ...tables,
    },
  });
  harness.storeSession();
  return harness;
}
