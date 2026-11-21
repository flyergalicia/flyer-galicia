// The start by itself: only with its faculty, only the first time, never for the administrator nor
// during the preview of a profile.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { INVENTED_USER } from "@/shared/supabase/testing/recording-fetch.ts";
import { usePermissions, useSession, useSessionActions } from "@/shared/session/index.ts";
import { tourKey } from "./seen.ts";
import { AUTO_START_DELAY_MS, startsByItself, useTourAutoStart } from "./use-tour-auto-start.ts";

/** Longer than the wait, for what must not happen. */
const NEVER_MS = AUTO_START_DELAY_MS + 600;

function Starter({
  onOpen,
  isOpen = false,
}: {
  readonly onOpen: () => void;
  readonly isOpen?: boolean;
}) {
  useTourAutoStart(onOpen, isOpen);
  return <p>Adentro</p>;
}

interface Entry {
  readonly role?: string;
  readonly faculty?: boolean;
  readonly seenBy?: string;
  /** The administrator, looking as an advisor. */
  readonly previewing?: boolean;
  /** The person opened it already. */
  readonly isOpen?: boolean;
}

/** The administrator starts the preview of an advisor before anything else. */
function Previewing({ onOpen }: { readonly onOpen: () => void }) {
  const session = useSession();
  const { startRolePreview } = useSessionActions();
  const { simulatedRole, loadStatus } = usePermissions();
  const isInside = session.status === "signed-in";
  useEffect(() => {
    if (isInside && !simulatedRole) startRolePreview("asesor");
  }, [isInside, simulatedRole, startRolePreview]);
  return simulatedRole && loadStatus !== "loading" ? <Starter onOpen={onOpen} /> : null;
}

async function enter({
  role = "asesor",
  faculty = true,
  seenBy,
  previewing = false,
  isOpen = false,
}: Entry) {
  const harness = createAppHarness({
    profile: { ...ADVISOR, role },
    files: { "_facultades.json": { roles: { asesor: { tutorial_auto: faculty } } } },
  });
  harness.storeSession();
  if (seenBy) localStorage.setItem(tourKey(seenBy), "1");
  const onOpen = vi.fn<() => void>();
  const screen = await render(
    harness.wrap(
      previewing ? (
        <Previewing onOpen={onOpen} />
      ) : (
        <Inside>
          <Starter onOpen={onOpen} isOpen={isOpen} />
        </Inside>
      ),
    ),
  );
  return { onOpen, screen };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the tutorial by itself", () => {
  it("opens with its faculty, a moment after entering, once", async () => {
    const { onOpen, screen } = await enter({});
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    expect(onOpen).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledOnce();
    });
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens for whoever has not seen it, though another person did in this browser", async () => {
    const { onOpen } = await enter({ seenBy: "someone-else" });
    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledOnce();
    });
  });

  it("does not open without its faculty", async () => {
    const { onOpen, screen } = await enter({ faculty: false });
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open a second time", async () => {
    const { onOpen, screen } = await enter({ seenBy: INVENTED_USER.id });
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open over one the person already opened", async () => {
    const { onOpen, screen } = await enter({ isOpen: true });
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("never opens for the administrator", async () => {
    const { onOpen, screen } = await enter({ role: "admin" });
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("never opens during the preview of a profile that has it", async () => {
    const { onOpen, screen } = await enter({ role: "admin", previewing: true });
    await expect.element(screen.getByText("Adentro")).toBeVisible();
    await new Promise((done) => setTimeout(done, NEVER_MS));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("who it opens for", () => {
  it("is whoever has the faculty, is not the administrator now nor previewing, and has not seen it", () => {
    const subject = { isAdminNow: false, simulatedRole: null, hasFaculty: true, seen: false };
    expect(startsByItself(subject)).toBe(true);
    expect(startsByItself({ ...subject, isAdminNow: true })).toBe(false);
    expect(startsByItself({ ...subject, simulatedRole: "asesor" })).toBe(false);
    expect(startsByItself({ ...subject, hasFaculty: false })).toBe(false);
    expect(startsByItself({ ...subject, seen: true })).toBe(false);
  });
});
