import { describe, expect, it } from "vitest";
import type { User } from "@/shared/supabase/index.ts";
import {
  initialSessionMachine,
  type SessionEvent,
  type SessionMachine,
  sessionReducer,
  sessionView,
  SLOW_AFTER_MS,
} from "./session-machine.ts";

function person(id: string): User {
  return { id, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" };
}

const ANA = person("ana");
const LUIS = person("luis");
const NOTHING_YET = { profile: undefined, error: null };

function after(...events: readonly SessionEvent[]): SessionMachine {
  return events.reduce(sessionReducer, initialSessionMachine);
}

const entered: SessionEvent = { type: "session-found", user: ANA, source: "boot" };

describe("sessionReducer", () => {
  it("gives 10 seconds to whatever it waits for", () => {
    expect(SLOW_AFTER_MS).toBe(10_000);
  });

  it("an entry counts each person entering; a retry of the same person is the same entry", () => {
    const first = after(
      entered,
      { type: "retry-requested" },
      {
        type: "session-found",
        user: ANA,
        source: "retry",
      },
    );
    expect(first.phase).toMatchObject({ name: "reading-profile", entry: 1, attempt: 2 });

    const other = sessionReducer(sessionReducer(first, { type: "retry-requested" }), {
      type: "session-found",
      user: LUIS,
      source: "retry",
    });
    expect(other.phase).toMatchObject({ name: "reading-profile", entry: 2, attempt: 3 });
  });

  it("a saved session counts only while it is being waited for", () => {
    const out = after({ type: "no-session", source: "boot" });
    expect(sessionReducer(out, entered)).toBe(out);

    const closed = after({ type: "waited-too-long" }, { type: "signed-out" });
    expect(sessionReducer(closed, entered)).toBe(closed);

    const late = after({ type: "waited-too-long" });
    expect(sessionReducer(late, entered).phase).toMatchObject({ name: "reading-profile" });
  });

  it("the answer of a retry counts only during a retry", () => {
    const reading = after(entered);
    const found: SessionEvent = { type: "session-found", user: ANA, source: "retry" };

    expect(sessionReducer(reading, found)).toBe(reading);
    expect(sessionReducer(reading, { type: "no-session", source: "retry" })).toBe(reading);
    expect(sessionReducer(reading, { type: "session-unreadable" })).toBe(reading);
    expect(sessionReducer(reading, { type: "no-session", source: "boot" })).toBe(reading);
  });

  it("there is nothing to retry from the form", () => {
    const out = after({ type: "no-session", source: "boot" });

    expect(sessionReducer(out, { type: "retry-requested" })).toBe(out);
  });

  it("a rejected account stays so when its session is closed, but not when it signs in", () => {
    const rejected = after(entered, { type: "rejected", reason: "pending" });

    expect(sessionReducer(rejected, { type: "signed-out" })).toBe(rejected);
    expect(
      sessionReducer(rejected, { type: "session-found", user: LUIS, source: "sign-in" }).phase,
    ).toMatchObject({ name: "reading-profile", user: LUIS });
  });

  it("leaving ends the preview", () => {
    const previewing = after(entered, { type: "role-preview", role: "hunter" });

    expect(previewing.simulatedRole).toBe("hunter");
    expect(sessionReducer(previewing, { type: "signed-out" }).simulatedRole).toBeNull();
    expect(
      sessionReducer(previewing, { type: "rejected", reason: "inactive" }).simulatedRole,
    ).toBeNull();
  });
});

describe("sessionView", () => {
  it("while booting or retrying it is loading, until it has waited too long", () => {
    const retrying = after(entered, { type: "retry-requested" });

    expect(sessionView(initialSessionMachine, NOTHING_YET)).toEqual({ status: "loading" });
    expect(sessionView(retrying, NOTHING_YET)).toEqual({ status: "loading" });
    expect(sessionView(sessionReducer(retrying, { type: "waited-too-long" }), NOTHING_YET)).toEqual(
      { status: "unreachable", user: ANA, slow: true },
    );
  });

  it("no answer yet is loading, and then it stops being so with the session open", () => {
    const reading = after(entered);

    expect(sessionView(reading, NOTHING_YET)).toEqual({ status: "loading" });
    expect(sessionView(sessionReducer(reading, { type: "waited-too-long" }), NOTHING_YET)).toEqual({
      status: "unreachable",
      user: ANA,
      slow: true,
    });
  });

  it("no row and no error counts as inactive, as in the current app", () => {
    expect(sessionView(after(entered), { profile: null, error: null })).toMatchObject({
      status: "rejected",
      reason: "inactive",
    });
  });
});
