// Test support: the panel of the administrator over a simulated cloud with accounts, logs and the
// matrix of faculties. Every person here is made up.
import { createElement, type ReactNode } from "react";
import { render } from "vitest-browser-react";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import {
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { AdminPanel } from "../ui/AdminPanel.tsx";
import { RolePreviewBar } from "../ui/RolePreviewBar.tsx";

type Row = Record<string, unknown>;
type Rows = Row[] | ((request: RecordedRequest) => Response | Promise<Response>);

export const ME = INVENTED_USER.id;

export interface PanelCloud {
  accounts: Row[];
  flyerLogs: Rows;
  companyLog: Rows;
  audit: Rows;
  designs: Rows;
  companies: Rows;
  advisors: Row[];
  /** What auth-admin refuses, by action, with its message. */
  refusals: Record<string, { readonly status: number; readonly message: string }>;
  /** What the panel changed on the profiles, in order. */
  profileChanges: { readonly query: string; readonly body: unknown }[];
  /** The answer to a change of a profile: a message makes it fail. */
  profileRefusal: string;
  ownFaculties: unknown;
}

export interface PanelOptions extends Partial<PanelCloud> {
  readonly files?: Readonly<Record<string, unknown>>;
  readonly droppedFiles?: readonly string[];
  readonly commercialFlag?: string;
  readonly intercept?: AppAnswers["intercept"];
  /** What else goes on the page, beside the panel. */
  readonly beside?: ReactNode;
}

const OBJECT = "application/vnd.pgrst.object+json";

function eq(value: string | null): string {
  return value?.replace(/^eq\./, "") ?? "";
}

/** A list of rows with its window of offset and limit, and a count for a head request. */
function pageOf(rows: Row[], { query, method }: RecordedRequest): Response {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "Content-Range": `*/${String(rows.length)}` },
    });
  }
  const offset = Number(query.get("offset") ?? 0);
  const limit = Number(query.get("limit") ?? rows.length);
  const window = rows.slice(offset, offset + limit);
  return jsonResponse(window);
}

function rowsAnswer(rows: Rows) {
  return (request: RecordedRequest) =>
    Array.isArray(rows) ? pageOf(rows, request) : rows(request);
}

function pendingCount(cloud: PanelCloud): Response {
  const pending = cloud.accounts.filter(
    ({ status }) => status === "pending" || status === "reset_pending",
  ).length;
  return new Response(null, { status: 200, headers: { "Content-Range": `*/${String(pending)}` } });
}

function changeProfiles(cloud: PanelCloud, request: RecordedRequest): Response {
  cloud.profileChanges.push({ query: request.query.toString(), body: request.body });
  if (cloud.profileRefusal) return jsonResponse({ message: cloud.profileRefusal }, 400);
  const id = eq(request.query.get("id"));
  const email = eq(request.query.get("email"));
  const body: Row = Object(request.body);
  if (id === ME && "facultades" in body) cloud.ownFaculties = body.facultades;
  for (const row of cloud.accounts) {
    if (row.id === id || (email && row.email === email)) Object.assign(row, body);
  }
  return new Response(null, { status: 204 });
}

function profilesAnswer(cloud: PanelCloud) {
  return (request: RecordedRequest): Response => {
    if (request.method === "HEAD") return pendingCount(cloud);
    if (request.method === "PATCH") return changeProfiles(cloud, request);
    if (request.headers.get("Accept") === OBJECT) {
      return jsonResponse({
        ...ADVISOR,
        role: "admin",
        full_name: "Admin Inventado",
        facultades: cloud.ownFaculties,
      });
    }
    const role = request.query.get("role");
    const rows =
      role === "neq.admin" ? cloud.accounts.filter((row) => row.role !== "admin") : cloud.accounts;
    return jsonResponse(rows);
  };
}

const ACTIVATING = new Set(["approve_user", "approve_reset", "deny_reset"]);

function adminAnswer(cloud: PanelCloud) {
  return (request: RecordedRequest): Response => {
    const body: Row = Object(request.body);
    const action = String(body.action);
    const refusal = cloud.refusals[action];
    if (refusal) return jsonResponse({ error: refusal.message }, refusal.status);
    if (action === "delete_user")
      cloud.accounts = cloud.accounts.filter(({ id }) => id !== body.uid);
    if (ACTIVATING.has(action)) {
      for (const row of cloud.accounts) if (row.id === body.uid) row.status = "active";
    }
    if (action === "create_user") {
      cloud.accounts.push({
        id: `nueva${String(cloud.accounts.length)}`,
        full_name: body.full_name,
        email: body.email,
        email_asesor: body.email,
        role: body.role,
        status: body.status,
      });
    }
    return jsonResponse({ ok: true });
  };
}

export function panelCloud(options: PanelOptions = {}): PanelCloud {
  return {
    accounts: options.accounts ?? [],
    flyerLogs: options.flyerLogs ?? [],
    companyLog: options.companyLog ?? [],
    audit: options.audit ?? [],
    designs: options.designs ?? [],
    companies: options.companies ?? [],
    advisors: options.advisors ?? [],
    refusals: options.refusals ?? {},
    profileChanges: [],
    profileRefusal: options.profileRefusal ?? "",
    ownFaculties: options.ownFaculties ?? null,
  };
}

/** The panel open, as the administrator has it after pressing ⚙ Admin. */
export async function openPanel(options: PanelOptions = {}) {
  const cloud = panelCloud(options);
  const closed: number[] = [];
  const harness = createAppHarness({
    profile: (request) => profilesAnswer(cloud)(request),
    files: {
      "_opciones.json": {
        opts: [
          { n: 1, nombre: "Opción 1" },
          { n: 9, nombre: "Combustible", solapa: "rubros" },
        ],
      },
      ...options.files,
    },
    ...(options.droppedFiles ? { droppedFiles: options.droppedFiles } : {}),
    commercialFlag: options.commercialFlag ?? "off",
    admin: (request) => adminAnswer(cloud)(request),
    ...(options.intercept ? { intercept: options.intercept } : {}),
    tables: {
      profiles: (request) => profilesAnswer(cloud)(request),
      flyer_logs: (request) => rowsAnswer(cloud.flyerLogs)(request),
      padron_log: (request) => rowsAnswer(cloud.companyLog)(request),
      audit_log: (request) => rowsAnswer(cloud.audit)(request),
      flyer_disenos: (request) => rowsAnswer(cloud.designs)(request),
      padron_empresas: (request) => rowsAnswer(cloud.companies)(request),
      asesores_guardados: () => jsonResponse(cloud.advisors),
      app_flags: (request) =>
        request.method === "GET"
          ? jsonResponse({ valor: options.commercialFlag ?? "off" })
          : new Response(null, { status: 201 }),
    },
  });
  harness.storeSession();
  const onClose = () => {
    closed.push(Date.now());
  };
  const screen = await render(
    harness.wrap(
      createElement(
        Inside,
        null,
        createElement(AdminPanel, { onClose }),
        createElement(RolePreviewBar),
        options.beside,
      ),
    ),
  );
  return { screen, harness, cloud, closed };
}
