// Test support, not exported from index.ts: a fetch that keeps what it was asked and answers from
// a function, so that no test can ever reach a network.

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  /** Path and query without the host. */
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: unknown;
  readonly init: RequestInit | undefined;
}

/** Throw to simulate a dropped connection; return a promise that never settles to simulate a hang. */
export type Answer = (request: RecordedRequest) => Response | Promise<Response>;

export interface RecordingFetch {
  readonly fetch: typeof fetch;
  readonly requests: RecordedRequest[];
  /** Changes how it answers from now on. */
  answerWith(answer: Answer): void;
  to(pathStart: string, method?: string): RecordedRequest[];
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

/** An answer that arrives when the test says so. */
export function deferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      settle?.(value);
    },
  };
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyOf(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") return init?.body ?? null;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

export function createRecordingFetch(firstAnswer: Answer): RecordingFetch {
  let answer = firstAnswer;
  const requests: RecordedRequest[] = [];
  const recording: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      url: url.href,
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: bodyOf(init),
      init,
    };
    requests.push(request);
    return Promise.resolve().then(() => answer(request));
  };
  return {
    fetch: recording,
    requests,
    answerWith: (next) => {
      answer = next;
    },
    to: (pathStart, method) =>
      requests.filter(
        (request) =>
          request.path.startsWith(pathStart) && (method === undefined || request.method === method),
      ),
  };
}

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export interface InventedUser {
  readonly id: string;
  readonly email: string;
}

export const INVENTED_USER: InventedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "ana.inventada@bancogalicia.com.ar",
};

/** What the auth server answers on a sign-in, and what supabase-js keeps in localStorage. */
export function inventedSession(user: InventedUser = INVENTED_USER): Record<string, unknown> {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const header = base64Url({ alg: "HS256", typ: "JWT" });
  const claims = base64Url({
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    exp: expiresAt,
  });
  return {
    access_token: `${header}.${claims}.c2ln`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "invented-refresh-token",
    user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email },
  };
}
