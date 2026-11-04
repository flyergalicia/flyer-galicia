import type { AuthChangeEvent, Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { type FailureKind, failureKind } from "./network-status.ts";
import { failure, type Result, success } from "./result.ts";

export type { AuthChangeEvent, Session, User };

export interface AuthFailure {
  readonly kind: FailureKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly message: string;
}

export type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
export type SignOutScope = "global" | "local";

export interface OneTimeToken {
  readonly tokenHash: string;
  readonly type: "magiclink";
}

export interface AuthGateway {
  readonly signInWithPassword: (credentials: {
    readonly email: string;
    readonly password: string;
  }) => Promise<Result<Session, AuthFailure>>;
  readonly signOut: (scope?: SignOutScope) => Promise<Result<void, AuthFailure>>;
  /** A session that is simply not there is a value: `null`, not a failure. */
  readonly getSession: () => Promise<Result<Session | null, AuthFailure>>;
  readonly updatePassword: (password: string) => Promise<Result<User, AuthFailure>>;
  /** Redeems the one-time permission that the action `entrar_como` of auth-admin hands out. */
  readonly verifyOneTimeToken: (
    token: OneTimeToken,
  ) => Promise<Result<Session | null, AuthFailure>>;
  /** Everyone shares one subscription to Supabase. Returns how to stop listening. */
  readonly onAuthStateChange: (listener: AuthListener) => () => void;
}

function answerFailure({
  status = null,
  code = null,
  message,
}: {
  readonly status?: number | null | undefined;
  readonly code?: string | null | undefined;
  readonly message: string;
}): Result<never, AuthFailure> {
  return failure({ kind: failureKind(status), status, code, message });
}

/** A hung lock or a broken storage must end up as a failure too, never as a rejection. */
async function guarded<V>(
  call: () => Promise<Result<V, AuthFailure>>,
): Promise<Result<V, AuthFailure>> {
  try {
    return await call();
  } catch (cause) {
    return answerFailure({ message: cause instanceof Error ? cause.message : String(cause) });
  }
}

export function createAuthGateway(client: SupabaseClient<Database>): AuthGateway {
  const listeners = new Set<AuthListener>();
  let stopListening: (() => void) | null = null;

  return {
    signInWithPassword: (credentials) =>
      guarded(async () => {
        const { data, error } = await client.auth.signInWithPassword(credentials);
        return error ? answerFailure(error) : success(data.session);
      }),
    signOut: (scope) =>
      guarded(async () => {
        const { error } = await client.auth.signOut(scope ? { scope } : undefined);
        return error ? answerFailure(error) : success(undefined);
      }),
    getSession: () =>
      guarded(async () => {
        const { data, error } = await client.auth.getSession();
        return error ? answerFailure(error) : success(data.session);
      }),
    updatePassword: (password) =>
      guarded(async () => {
        const { data, error } = await client.auth.updateUser({ password });
        return error ? answerFailure(error) : success(data.user);
      }),
    verifyOneTimeToken: ({ tokenHash, type }) =>
      guarded(async () => {
        const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        return error ? answerFailure(error) : success(data.session);
      }),
    onAuthStateChange: (listener) => {
      listeners.add(listener);
      if (!stopListening) {
        const { data } = client.auth.onAuthStateChange((event, session) => {
          for (const each of listeners) each(event, session);
        });
        stopListening = () => {
          data.subscription.unsubscribe();
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopListening?.();
          stopListening = null;
        }
      };
    },
  };
}
