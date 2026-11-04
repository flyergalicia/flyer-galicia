// Test support, not exported from index.ts: the providers of the session over a real Backend whose
// fetch answers as a simulated cloud would. It never reaches a network.
import type { QueryClient } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { createQueryClient } from "@/shared/supabase/index.ts";
import {
  createInventedBackend,
  type InventedBackend,
} from "@/shared/supabase/testing/invented-backend.ts";
import {
  type Answer,
  inventedSession,
  type InventedUser,
  INVENTED_USER,
  jsonResponse,
  type RecordedRequest,
} from "@/shared/supabase/testing/recording-fetch.ts";
import { SessionTestProviders } from "./SessionTestProviders.tsx";

export interface CloudAnswers {
  /** What reading the own profile answers: a row, or a whole answer. */
  profile?: Record<string, unknown> | Answer;
  /** What `_facultades.json` answers. By default it does not exist. */
  permissions?: Answer;
}

export const ACTIVE_PROFILE: Readonly<Record<string, unknown>> = {
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

function isReadingProfile({ path, method }: RecordedRequest): boolean {
  return path === "/rest/v1/profiles" && method === "GET";
}

function answerProfile(request: RecordedRequest, profile: CloudAnswers["profile"]) {
  return typeof profile === "function" ? profile(request) : jsonResponse(profile ?? ACTIVE_PROFILE);
}

export function cloudAnswer(answers: CloudAnswers): Answer {
  return (request) => {
    const { path } = request;
    if (isReadingProfile(request)) return answerProfile(request, answers.profile);
    if (path.endsWith("/_facultades.json")) {
      return answers.permissions?.(request) ?? jsonResponse({}, 404);
    }
    if (path === "/auth/v1/token" || path === "/auth/v1/verify") {
      return jsonResponse(inventedSession());
    }
    return new Response(null, { status: 204 });
  };
}

export interface SessionHarness extends InventedBackend {
  readonly queryClient: QueryClient;
  /** Leaves a session in the browser, as if somebody had entered before. */
  storeSession(user?: InventedUser): void;
  storedSession(): string | null;
  wrap(children: ReactNode, options?: { readonly strict?: boolean }): ReactNode;
  /** The writes that entering leaves. */
  entryWrites(): RecordedRequest[];
  logouts(): RecordedRequest[];
}

export function createSessionHarness(answers: CloudAnswers = {}): SessionHarness {
  const invented = createInventedBackend(cloudAnswer(answers));
  const queryClient = createQueryClient();
  return {
    ...invented,
    queryClient,
    storeSession: (user = INVENTED_USER) => {
      localStorage.setItem(invented.storageKey, JSON.stringify(inventedSession(user)));
    },
    storedSession: () => localStorage.getItem(invented.storageKey),
    wrap: (children, options) =>
      createElement(
        SessionTestProviders,
        { backend: invented.backend, queryClient, strict: options?.strict ?? false },
        children,
      ),
    entryWrites: () => invented.network.to("/rest/v1/profiles", "PATCH"),
    logouts: () => invented.network.to("/auth/v1/logout", "POST"),
  };
}
