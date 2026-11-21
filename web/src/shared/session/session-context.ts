import { createContext, useContext } from "react";
import type { AuthFailure, Result, Session } from "@/shared/supabase/index.ts";
import type { PermissionKey } from "./permissions.ts";
import type { SessionView } from "./session-machine.ts";

/** The saved permissions: invalidate it after saving them, and everybody reads them again. */
export const PERMISSIONS_QUERY_KEY = ["session", "permissions"] as const;

export type SessionValue = SessionView & {
  /** The mail link for a new password arrived: the auth slice shows its view. */
  readonly passwordRecovery: boolean;
};

export interface SessionActions {
  readonly signIn: (credentials: {
    readonly email: string;
    readonly password: string;
  }) => Promise<Result<Session, AuthFailure>>;
  readonly signOut: () => Promise<Result<void, AuthFailure>>;
  /** Reads the profile again with the same session. It does not ask for the password. */
  readonly retry: () => void;
  /** Leaves this browser without the session, even if the server cannot be reached. */
  readonly continueWithAnotherAccount: () => Promise<void>;
  /** Enters with the one-time permission of `entrar_como`, without any password. */
  readonly redeemAccountSwitch: (tokenHash: string) => Promise<Result<void, AuthFailure>>;
  readonly refreshProfile: () => void;
  readonly dismissPasswordRecovery: () => void;
  /** Administrators only: see the app as another profile sees it. */
  readonly startRolePreview: (role: string) => void;
  readonly stopRolePreview: () => void;
}

export type PermissionsLoadStatus = "loading" | "ready" | "failed";

export interface PermissionsValue {
  readonly can: (key: PermissionKey) => boolean;
  readonly isAdminNow: boolean;
  readonly effectiveRole: string | null;
  readonly isHunter: boolean;
  readonly isLeader: boolean;
  readonly simulatedRole: string | null;
  /**
   * `failed`: the saved permissions could not be read, so `can` answers with the defaults. It
   * does not mean that nothing is saved.
   */
  readonly loadStatus: PermissionsLoadStatus;
  readonly retryLoad: () => void;
}

export const SessionValueContext = createContext<SessionValue | null>(null);
export const SessionActionsContext = createContext<SessionActions | null>(null);
export const PermissionsContext = createContext<PermissionsValue | null>(null);

function required<T>(value: T | null, hook: string): T {
  if (value === null) throw new Error(`${hook} needs a SessionProvider above it`);
  return value;
}

export function useSession(): SessionValue {
  return required(useContext(SessionValueContext), "useSession");
}

export function useSessionActions(): SessionActions {
  return required(useContext(SessionActionsContext), "useSessionActions");
}

export function usePermissions(): PermissionsValue {
  return required(useContext(PermissionsContext), "usePermissions");
}

export function useCan(key: PermissionKey): boolean {
  return usePermissions().can(key);
}
