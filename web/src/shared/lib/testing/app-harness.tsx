// Test support: the whole app over a real Backend whose fetch answers as a simulated cloud would.
// It never reaches a network.
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createQueryClient } from "@/shared/supabase/index.ts";
import {
  createInventedBackend,
  type InventedBackend,
} from "@/shared/supabase/testing/invented-backend.ts";
import {
  type Answer,
  inventedSession,
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { AppProviders } from "../AppProviders.tsx";

export interface AppAnswers {
  /** A row, or a whole answer. */
  readonly profile?: Readonly<Record<string, unknown>> | Answer;
  /** What the JSON files of the bucket answer, by name. One that is not here does not exist. */
  readonly files?: Readonly<Record<string, unknown>>;
  /** Files that do not answer: the connection dropped. */
  readonly droppedFiles?: readonly string[];
  /** The switch of Gestiones. */
  readonly commercialFlag?: string;
  /** What auth-admin answers. */
  readonly admin?: Answer;
  /** What a function of the database answers. */
  readonly rpc?: Answer;
  /** How many accounts are waiting for the administrator. */
  readonly pendingAccounts?: number;
  /** What changing one's password answers. */
  readonly passwordChange?: Answer;
}

export const ADVISOR: Readonly<Record<string, unknown>> = {
  role: "asesor",
  full_name: "Ana Inventada",
  nombre_asesor: "Ana",
  celular_asesor: "11 5555 0000",
  email_asesor: "ana.inventada@bancogalicia.com.ar",
  status: "active",
  facultades: null,
  es_prueba: false,
  lider_id: null,
  flyer_fav: null,
};

function fileAnswer({ path }: RecordedRequest, answers: AppAnswers): Response | null {
  if (path.startsWith("/storage/v1/object/flyers/")) return jsonResponse({ Key: path });
  if (!path.startsWith("/storage/v1/object/public/flyers/")) return null;
  const file = path.split("/").at(-1) ?? "";
  if (answers.droppedFiles?.includes(file)) throw new TypeError("Failed to fetch");
  const content = answers.files?.[file];
  return content === undefined ? jsonResponse({}, 404) : jsonResponse(content);
}

function profileAnswer(
  request: RecordedRequest,
  answers: AppAnswers,
): Response | Promise<Response> {
  const { profile } = answers;
  if (typeof profile === "function") return profile(request);
  return jsonResponse(profile ?? ADVISOR);
}

function tableAnswer(request: RecordedRequest, answers: AppAnswers) {
  const { path, method } = request;
  if (path === "/rest/v1/profiles" && method === "GET") return profileAnswer(request, answers);
  if (path === "/rest/v1/profiles" && method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "Content-Range": `*/${String(answers.pendingAccounts ?? 0)}` },
    });
  }
  if (path === "/rest/v1/app_flags") {
    return jsonResponse(answers.commercialFlag ? { valor: answers.commercialFlag } : null);
  }
  return null;
}

function authAnswer(request: RecordedRequest, answers: AppAnswers) {
  const { path } = request;
  if (path === "/auth/v1/token" || path === "/auth/v1/verify") {
    return jsonResponse(inventedSession());
  }
  if (path === "/auth/v1/user") {
    return answers.passwordChange?.(request) ?? jsonResponse(inventedSession().user);
  }
  return null;
}

function cloudAnswer(answers: AppAnswers): Answer {
  return (request) => {
    const { path } = request;
    if (path.startsWith("/functions/v1/auth-admin")) {
      return answers.admin?.(request) ?? jsonResponse({ ok: true });
    }
    if (path.startsWith("/rest/v1/rpc/")) return answers.rpc?.(request) ?? jsonResponse(null);
    return (
      fileAnswer(request, answers) ??
      tableAnswer(request, answers) ??
      authAnswer(request, answers) ??
      new Response(null, { status: 204 })
    );
  };
}

export interface AppHarness extends InventedBackend {
  readonly queryClient: QueryClient;
  /** Leaves a session in the browser, as if somebody had entered before. */
  storeSession(): void;
  hasSession(): boolean;
  wrap(children: ReactNode): ReactNode;
  adminCalls(): readonly unknown[];
}

export function createAppHarness(answers: AppAnswers = {}): AppHarness {
  const invented = createInventedBackend(cloudAnswer(answers));
  const queryClient = createQueryClient();
  return {
    ...invented,
    queryClient,
    storeSession: () => {
      localStorage.setItem(invented.storageKey, JSON.stringify(inventedSession(INVENTED_USER)));
    },
    hasSession: () => localStorage.getItem(invented.storageKey) !== null,
    wrap: (children) => (
      <AppProviders backend={invented.backend} queryClient={queryClient}>
        {children}
      </AppProviders>
    ),
    adminCalls: () => invented.network.to("/functions/v1/auth-admin").map(({ body }) => body),
  };
}
