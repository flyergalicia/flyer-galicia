// The tutorial opens by itself on entering (`_tourAutoStart`) only with the faculty `tutorial_auto`,
// that the administrator turns on by profile: never for the administrator nor during the preview of
// a profile, and only once per account and browser. It is decided once, on entering, as today.
import { useEffect, useRef } from "react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { tourSeen } from "./seen.ts";

/** As today: a little after the screen is there. */
export const AUTO_START_DELAY_MS = 900;

export interface AutoStartSubject {
  readonly isAdminNow: boolean;
  readonly simulatedRole: string | null;
  readonly hasFaculty: boolean;
  readonly seen: boolean;
}

export function startsByItself({
  isAdminNow,
  simulatedRole,
  hasFaculty,
  seen,
}: AutoStartSubject): boolean {
  return !isAdminNow && simulatedRole === null && hasFaculty && !seen;
}

type Decision = "waiting" | "no" | "opened";

/**
 * Opens the tutorial once, if it has to: `open` is how the shell opens its window. Not over one the
 * person already opened (`if(_me&&!_tour)`).
 */
export function useTourAutoStart(open: () => void, isOpen: boolean): void {
  const session = useSession();
  const { can, isAdminNow, simulatedRole } = usePermissions();
  const userId = session.status === "signed-in" ? session.user.id : null;
  const hasFaculty = can("tutorial_auto");
  const decision = useRef<Decision>("waiting");
  const latest = useRef({ open, isOpen });
  useEffect(() => {
    latest.current = { open, isOpen };
  });
  useEffect(() => {
    if (decision.current !== "waiting" || userId === null) return undefined;
    if (!startsByItself({ isAdminNow, simulatedRole, hasFaculty, seen: tourSeen(userId) })) {
      decision.current = "no";
      return undefined;
    }
    const timer = setTimeout(() => {
      decision.current = "opened";
      if (!latest.current.isOpen) latest.current.open();
    }, AUTO_START_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [userId, isAdminNow, simulatedRole, hasFaculty]);
}
