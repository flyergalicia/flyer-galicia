// Test support: the tables and functions of Base de datos, answered as the cloud would.
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";

type Row = Readonly<Record<string, unknown>>;

export interface RegistryCloud extends AppAnswers {
  readonly companies?: readonly Row[] | Answer;
  readonly advisors?: readonly Row[] | Answer;
  readonly proposals?: readonly Row[] | Answer;
  readonly messages?: readonly Row[];
  readonly substitutes?: readonly Row[] | Answer;
  readonly colleagues?: readonly Row[];
  /** What the functions of the database answer, by name. Without one, they say yes. */
  readonly functions_?: Readonly<Record<string, Answer>>;
  readonly role?: string;
  readonly faculties?: readonly string[];
}

function answerOf(rows: readonly Row[] | Answer | undefined): Answer {
  if (typeof rows === "function") return rows;
  return () => jsonResponse(rows ?? []);
}

export function registryHarness(cloud: RegistryCloud = {}) {
  const { companies, advisors, proposals, messages, substitutes, colleagues } = cloud;
  const { functions_: rpcs = {}, role = "asesor", faculties = [], ...rest } = cloud;
  const files = {
    "_facultades.json": {
      roles: { [role]: Object.fromEntries(faculties.map((key) => [key, true])) },
    },
    ...cloud.files,
  };
  const answers: AppAnswers = {
    ...rest,
    files,
    profile: { ...ADVISOR, role, ...(role === "admin" ? { full_name: "Admin Inventado" } : {}) },
    tables: {
      padron_empresas: answerOf(companies),
      asesores_guardados: answerOf(advisors),
      padron_propuestas: answerOf(proposals),
      padron_propuesta_mensajes: answerOf(messages),
      ...cloud.tables,
    },
    rpc: (request) => {
      const name = request.path.replace("/rest/v1/rpc/", "");
      const answer = rpcs[name];
      if (answer) return answer(request);
      if (name === "padron_suplencias") return answerOf(substitutes)(request);
      if (name === "colegas_para_suplente") return jsonResponse(colleagues ?? []);
      return jsonResponse(null);
    },
  };
  const harness = createAppHarness(answers);
  harness.storeSession();
  return harness;
}

export const FAILED_CONNECTION: Answer = () => {
  throw new TypeError("Failed to fetch");
};

export function databaseError(message: string): Response {
  return jsonResponse({ message, code: "XX000" }, 500);
}
