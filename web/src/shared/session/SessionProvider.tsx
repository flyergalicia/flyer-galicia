import { skipToken, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { type Dispatch, type ReactNode, useEffect, useMemo, useReducer, useState } from "react";
import { type Backend, failure, success, useBackend, type User } from "@/shared/supabase/index.ts";
import {
  can,
  effectiveRole,
  isAdminNow,
  isHunter,
  isLeader,
  mergePermissions,
  type PermissionSubject,
  savedRolesIn,
} from "./permissions.ts";
import { entryUpdate, type Profile, type ProfileReadError, readProfile } from "./profile.ts";
import {
  PERMISSIONS_QUERY_KEY,
  PermissionsContext,
  type PermissionsLoadStatus,
  type PermissionsValue,
  type SessionActions,
  SessionActionsContext,
  type SessionValue,
  SessionValueContext,
} from "./session-context.ts";
import {
  initialSessionMachine,
  type SessionEvent,
  type SessionMachine,
  sessionReducer,
  sessionView,
  SLOW_AFTER_MS,
} from "./session-machine.ts";

const PROFILE_QUERY_KEY = ["session", "profile"] as const;

function profileQueryKey(machine: SessionMachine): readonly unknown[] {
  const { phase } = machine;
  return phase.name === "reading-profile"
    ? [...PROFILE_QUERY_KEY, phase.user.id, phase.attempt]
    : [...PROFILE_QUERY_KEY, null];
}

async function readSavedRoles(bucket: Backend["bucket"]): Promise<unknown> {
  const file = await bucket.readJson("_facultades.json");
  if (file.ok) return savedRolesIn(file.value);
  if (file.error.kind === "not-found") return null;
  throw new Error(`_facultades.json: ${file.error.kind}`);
}

interface EntryLedger {
  /** True only the first time it is asked about an entry. */
  claim(entry: number): boolean;
}

function createEntryLedger(): EntryLedger {
  let last = 0;
  return {
    claim: (entry) => {
      if (last === entry) return false;
      last = entry;
      return true;
    },
  };
}

/**
 * Lives apart so that it mounts when the moment comes: StrictMode runs the effects of whatever
 * mounts twice, and the ledger of its parent is what keeps it to once per entry.
 */
function OncePerEntry({
  entry,
  ledger,
  run,
}: {
  readonly entry: number;
  readonly ledger: EntryLedger;
  readonly run: () => void;
}): null {
  useEffect(() => {
    if (ledger.claim(entry)) run();
  }, [entry, ledger, run]);
  return null;
}

function useSessionBoot(auth: Backend["auth"], dispatch: Dispatch<SessionEvent>): void {
  useEffect(() => {
    let isCurrent = true;
    const stopListening = auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") dispatch({ type: "signed-out" });
      if (event === "PASSWORD_RECOVERY") dispatch({ type: "password-recovery", active: true });
    });
    void auth.getSession().then((session) => {
      if (!isCurrent) return;
      if (session.ok && session.value) {
        dispatch({ type: "session-found", user: session.value.user, source: "boot" });
      } else {
        dispatch({ type: "no-session", source: "boot" });
      }
    });
    return () => {
      isCurrent = false;
      stopListening();
    };
  }, [auth, dispatch]);
}

/** What is being waited for, or null. A new wait starts the time over. */
function waitKeyOf({ phase }: SessionMachine, isProfilePending: boolean): string | null {
  if (phase.name === "reading-profile") return isProfilePending ? `read-${phase.attempt}` : null;
  return phase.name === "booting" || phase.name === "retrying" ? phase.name : null;
}

/** Nothing stays waiting for an answer forever: "Ingresando…" gives way after a while. */
function useSlowWarning(waitKey: string | null, dispatch: Dispatch<SessionEvent>): void {
  useEffect(() => {
    if (waitKey === null) return undefined;
    const timer = setTimeout(() => {
      dispatch({ type: "waited-too-long" });
    }, SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [waitKey, dispatch]);
}

function createActions(
  { auth }: Backend,
  queryClient: QueryClient,
  dispatch: Dispatch<SessionEvent>,
): SessionActions {
  const entered = (user: User): void => {
    queryClient.clear();
    dispatch({ type: "session-found", user, source: "sign-in" });
  };
  return {
    signIn: async (credentials) => {
      const session = await auth.signInWithPassword(credentials);
      if (session.ok) entered(session.value.user);
      return session;
    },
    signOut: async () => {
      const closed = await auth.signOut();
      if (closed.ok) dispatch({ type: "signed-out" });
      return closed;
    },
    retry: () => {
      dispatch({ type: "retry-requested" });
      void auth.getSession().then((session) => {
        if (!session.ok) dispatch({ type: "session-unreadable" });
        else if (session.value) {
          dispatch({ type: "session-found", user: session.value.user, source: "retry" });
        } else dispatch({ type: "no-session", source: "retry" });
      });
    },
    continueWithAnotherAccount: async () => {
      await auth.signOut("local");
      dispatch({ type: "signed-out" });
    },
    redeemAccountSwitch: async (tokenHash) => {
      const session = await auth.verifyOneTimeToken({ tokenHash, type: "magiclink" });
      if (!session.ok) return failure(session.error);
      if (session.value) entered(session.value.user);
      return success(undefined);
    },
    refreshProfile: () => {
      void queryClient.refetchQueries({ queryKey: PROFILE_QUERY_KEY, type: "active" });
    },
    dismissPasswordRecovery: () => {
      dispatch({ type: "password-recovery", active: false });
    },
    startRolePreview: (role) => {
      dispatch({ type: "role-preview", role });
    },
    stopRolePreview: () => {
      dispatch({ type: "role-preview", role: null });
    },
  };
}

function permissionsLoadStatus(hasData: boolean, isError: boolean): PermissionsLoadStatus {
  if (isError) return "failed";
  return hasData ? "ready" : "loading";
}

function usePermissionsValue(
  { bucket }: Backend,
  queryClient: QueryClient,
  session: SessionValue,
  simulatedRole: string | null,
  isEntering: boolean,
): PermissionsValue {
  const saved = useQuery({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: () => readSavedRoles(bucket),
    enabled: isEntering,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const { data, isError } = saved;
  const matrix = useMemo(
    // On failure, the defaults: today's behaviour, and `loadStatus` tells it apart.
    () => (data !== undefined || isError ? mergePermissions(data ?? null) : null),
    [data, isError],
  );
  const loadStatus = permissionsLoadStatus(data !== undefined, isError);
  const signedIn = session.status === "signed-in" ? session : null;
  const role = signedIn?.role ?? null;
  const isAdmin = signedIn?.isAdmin ?? false;
  const ownPermissions = signedIn?.profile.facultades ?? null;
  return useMemo(() => {
    const subject: PermissionSubject | null =
      role === null
        ? null
        : {
            role,
            isAdmin,
            ownPermissions,
            matrix,
            // Only an administrator can look at the app as somebody else.
            simulatedRole: isAdmin ? simulatedRole : null,
          };
    return {
      can: (key) => (subject ? can(subject, key) : false),
      isAdminNow: subject ? isAdminNow(subject) : false,
      effectiveRole: subject ? effectiveRole(subject) : null,
      isHunter: subject ? isHunter(subject) : false,
      isLeader: subject ? isLeader(subject) : false,
      simulatedRole: subject?.simulatedRole ?? null,
      loadStatus,
      retryLoad: () => {
        void queryClient.refetchQueries({ queryKey: PERMISSIONS_QUERY_KEY });
      },
    };
  }, [role, isAdmin, ownPermissions, matrix, simulatedRole, loadStatus, queryClient]);
}

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const [machine, dispatch] = useReducer(sessionReducer, initialSessionMachine);
  const { phase, simulatedRole } = machine;
  const reading = phase.name === "reading-profile" ? phase : null;

  const profileQuery = useQuery<Profile | null, ProfileReadError>({
    queryKey: profileQueryKey(machine),
    queryFn: reading ? () => readProfile(backend.db, reading.user.id) : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useSessionBoot(backend.auth, dispatch);
  useSlowWarning(waitKeyOf(machine, profileQuery.isPending), dispatch);

  const hasLeft = phase.name === "signed-out" || phase.name === "rejected";
  useEffect(() => {
    // What the previous person read does not stay in memory for the next one.
    if (hasLeft) queryClient.clear();
  }, [hasLeft, queryClient]);

  const { data: profile, error: profileError } = profileQuery;
  const session = useMemo<SessionValue>(
    () => ({
      ...sessionView(machine, { profile, error: profileError }),
      passwordRecovery: machine.passwordRecovery,
    }),
    [machine, profile, profileError],
  );
  const actions = useMemo(
    () => createActions(backend, queryClient, dispatch),
    [backend, queryClient],
  );
  const permissions = usePermissionsValue(
    backend,
    queryClient,
    session,
    simulatedRole,
    reading !== null,
  );

  const [enteredLedger] = useState(createEntryLedger);
  const [closedLedger] = useState(createEntryLedger);
  const recordEntry = useMemo(() => {
    if (session.status !== "signed-in") return null;
    const { profile: read, user } = session;
    return () => {
      void backend.db
        .from("profiles")
        .update(entryUpdate(read, user, new Date()))
        .eq("id", user.id)
        .then(
          () => undefined,
          () => undefined,
        );
    };
  }, [session, backend]);
  const closeRejected = useMemo(() => {
    if (session.status !== "rejected") return null;
    const { reason } = session;
    return () => {
      dispatch({ type: "rejected", reason });
      void backend.auth.signOut();
    };
  }, [session, backend]);

  return (
    <SessionActionsContext.Provider value={actions}>
      <SessionValueContext.Provider value={session}>
        <PermissionsContext.Provider value={permissions}>
          {reading && recordEntry ? (
            <OncePerEntry entry={reading.entry} ledger={enteredLedger} run={recordEntry} />
          ) : null}
          {reading && closeRejected ? (
            <OncePerEntry entry={reading.entry} ledger={closedLedger} run={closeRejected} />
          ) : null}
          {children}
        </PermissionsContext.Provider>
      </SessionValueContext.Provider>
    </SessionActionsContext.Provider>
  );
}
