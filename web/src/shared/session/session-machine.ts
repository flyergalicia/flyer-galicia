import type { User } from "@/shared/supabase/index.ts";
import {
  displayNameOf,
  type Profile,
  type ProfileReadError,
  REJECTION_MESSAGES,
  type RejectionReason,
  rejectionOf,
  rejectionOfError,
} from "./profile.ts";

/** How long "Ingresando…" can last. */
export const SLOW_AFTER_MS = 10_000;

export type SessionPhase =
  | { readonly name: "booting" }
  /** `bootPending`: the form is showing because the saved session took too long to read. */
  | { readonly name: "signed-out"; readonly bootPending: boolean }
  | { readonly name: "rejected"; readonly reason: RejectionReason }
  | { readonly name: "retrying"; readonly user: User; readonly entry: number }
  | { readonly name: "session-unreadable"; readonly user: User; readonly entry: number }
  | {
      readonly name: "reading-profile";
      readonly user: User;
      /** One per time somebody enters: what is written once per entry looks at this. */
      readonly entry: number;
      /** One per read of the profile, so that an answer of a previous try cannot count. */
      readonly attempt: number;
    };

export interface SessionMachine {
  readonly phase: SessionPhase;
  readonly slow: boolean;
  readonly entries: number;
  readonly attempts: number;
  readonly passwordRecovery: boolean;
  readonly simulatedRole: string | null;
}

export type SessionEvent =
  | {
      readonly type: "session-found";
      readonly user: User;
      readonly source: "boot" | "retry" | "sign-in";
    }
  | { readonly type: "no-session"; readonly source: "boot" | "retry" }
  | { readonly type: "session-unreadable" }
  | { readonly type: "retry-requested" }
  | { readonly type: "waited-too-long" }
  | { readonly type: "signed-out" }
  | { readonly type: "rejected"; readonly reason: RejectionReason }
  | { readonly type: "password-recovery"; readonly active: boolean }
  | { readonly type: "role-preview"; readonly role: string | null };

export const initialSessionMachine: SessionMachine = {
  phase: { name: "booting" },
  slow: false,
  entries: 0,
  attempts: 0,
  passwordRecovery: false,
  simulatedRole: null,
};

function foundAccepted(phase: SessionPhase, source: "boot" | "retry" | "sign-in"): boolean {
  if (source === "sign-in") return true;
  if (source === "retry") return phase.name === "retrying";
  return phase.name === "booting" || (phase.name === "signed-out" && phase.bootPending);
}

function sessionFound(
  machine: SessionMachine,
  user: User,
  source: "boot" | "retry" | "sign-in",
): SessionMachine {
  const { phase, entries, attempts } = machine;
  if (!foundAccepted(phase, source)) return machine;
  const sameEntry = phase.name === "retrying" && phase.user.id === user.id;
  const entry = sameEntry ? phase.entry : entries + 1;
  return {
    ...machine,
    entries: entry,
    attempts: attempts + 1,
    slow: false,
    phase: { name: "reading-profile", user, entry, attempt: attempts + 1 },
  };
}

function noSession(machine: SessionMachine, source: "boot" | "retry"): SessionMachine {
  const { name } = machine.phase;
  const applies =
    source === "retry" ? name === "retrying" : name === "booting" || name === "signed-out";
  return applies
    ? { ...machine, slow: false, phase: { name: "signed-out", bootPending: false } }
    : machine;
}

function retryRequested(machine: SessionMachine): SessionMachine {
  const { phase } = machine;
  if (phase.name !== "reading-profile" && phase.name !== "session-unreadable") return machine;
  return {
    ...machine,
    slow: false,
    phase: { name: "retrying", user: phase.user, entry: phase.entry },
  };
}

function sessionUnreadable(machine: SessionMachine): SessionMachine {
  const { phase } = machine;
  if (phase.name !== "retrying") return machine;
  return {
    ...machine,
    slow: false,
    phase: { name: "session-unreadable", user: phase.user, entry: phase.entry },
  };
}

function waitedTooLong(machine: SessionMachine): SessionMachine {
  return machine.phase.name === "booting"
    ? { ...machine, phase: { name: "signed-out", bootPending: true } }
    : { ...machine, slow: true };
}

/** A rejected account stays rejected: closing its session is what brings this event. */
function signedOut(machine: SessionMachine): SessionMachine {
  if (machine.phase.name === "rejected") return machine;
  return {
    ...machine,
    slow: false,
    simulatedRole: null,
    phase: { name: "signed-out", bootPending: false },
  };
}

export function sessionReducer(machine: SessionMachine, event: SessionEvent): SessionMachine {
  switch (event.type) {
    case "session-found":
      return sessionFound(machine, event.user, event.source);
    case "no-session":
      return noSession(machine, event.source);
    case "session-unreadable":
      return sessionUnreadable(machine);
    case "retry-requested":
      return retryRequested(machine);
    case "waited-too-long":
      return waitedTooLong(machine);
    case "signed-out":
      return signedOut(machine);
    case "rejected":
      return {
        ...machine,
        slow: false,
        simulatedRole: null,
        phase: { name: "rejected", reason: event.reason },
      };
    case "password-recovery":
      return { ...machine, passwordRecovery: event.active };
    default:
      return { ...machine, simulatedRole: event.role };
  }
}

/** What reading the profile has come to. `undefined`: nothing yet. */
export interface ProfileRead {
  readonly profile: Profile | null | undefined;
  readonly error: ProfileReadError | null;
}

export type SessionView =
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  /** A failure that is not an answer: the session stays open and Reintentar reads again. */
  | { readonly status: "unreachable"; readonly user: User; readonly slow: boolean }
  /** The Supabase session is closed, and `message` goes on the form. */
  | {
      readonly status: "rejected";
      readonly reason: RejectionReason;
      readonly message: string;
    }
  | {
      readonly status: "signed-in";
      readonly user: User;
      readonly profile: Profile;
      readonly role: string;
      readonly isAdmin: boolean;
      readonly displayName: string;
    };

function rejected(reason: RejectionReason): SessionView {
  return { status: "rejected", reason, message: REJECTION_MESSAGES[reason] };
}

function signedIn(user: User, profile: Profile): SessionView {
  return {
    status: "signed-in",
    user,
    profile,
    role: profile.role || "asesor",
    isAdmin: profile.role === "admin",
    displayName: displayNameOf(profile, user),
  };
}

function viewOfRead(user: User, slow: boolean, { profile, error }: ProfileRead): SessionView {
  if (profile !== undefined) {
    const reason = rejectionOf(profile);
    if (reason) return rejected(reason);
    if (profile) return signedIn(user, profile);
  }
  if (!error) return slow ? { status: "unreachable", user, slow } : { status: "loading" };
  const reason = rejectionOfError(error);
  return reason ? rejected(reason) : { status: "unreachable", user, slow: false };
}

export function sessionView(machine: SessionMachine, read: ProfileRead): SessionView {
  const { phase, slow } = machine;
  switch (phase.name) {
    case "booting":
      return { status: "loading" };
    case "signed-out":
      return { status: "signed-out" };
    case "rejected":
      return rejected(phase.reason);
    case "retrying":
      return slow ? { status: "unreachable", user: phase.user, slow } : { status: "loading" };
    case "session-unreadable":
      return { status: "unreachable", user: phase.user, slow: false };
    default:
      return viewOfRead(phase.user, slow, read);
  }
}
