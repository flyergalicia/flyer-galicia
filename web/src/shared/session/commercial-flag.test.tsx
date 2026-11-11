import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { commercialActionsOn, useCommercialActionsFlag } from "./commercial-flag.ts";
import { createSessionHarness } from "./test-support.ts";

const BASE = {
  flag: "on",
  isAdmin: false,
  isTestAccount: false,
  isLeader: false,
  canUseThem: false,
};

describe("who has Gestiones", () => {
  it("off: nobody", () => {
    expect(commercialActionsOn({ ...BASE, flag: "off", isAdmin: true, canUseThem: true })).toBe(
      false,
    );
  });

  it("in test: only administrators and test accounts", () => {
    const flag = "prueba";
    expect(commercialActionsOn({ ...BASE, flag, canUseThem: true })).toBe(false);
    expect(commercialActionsOn({ ...BASE, flag, isAdmin: true })).toBe(true);
    expect(commercialActionsOn({ ...BASE, flag, isTestAccount: true })).toBe(true);
  });

  it("on: as the permissions say, and a leader always", () => {
    expect(commercialActionsOn(BASE)).toBe(false);
    expect(commercialActionsOn({ ...BASE, canUseThem: true })).toBe(true);
    expect(commercialActionsOn({ ...BASE, isLeader: true })).toBe(true);
  });
});

function Probe({ enabled }: { readonly enabled?: boolean }) {
  const { on, settled } = useCommercialActionsFlag(enabled);
  return (
    <>
      <output data-testid="on">{String(on)}</output>
      <output data-testid="settled">{String(settled)}</output>
    </>
  );
}

function harnessWith(profile: Record<string, unknown>, flag: () => Response) {
  const harness = createSessionHarness({ profile });
  const { network } = harness;
  const original = (request: Parameters<Parameters<typeof network.answerWith>[0]>[0]) => {
    if (request.path === "/rest/v1/app_flags") return flag();
    if (request.path === "/rest/v1/profiles") return jsonResponse(profile);
    return jsonResponse({}, 404);
  };
  network.answerWith(original);
  harness.storeSession();
  return harness;
}

const ACTIVE = { role: "asesor", status: "active", es_prueba: false, facultades: null };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the switch", () => {
  it("is read once it is asked for, and a test account has it in test", async () => {
    const harness = harnessWith({ ...ACTIVE, es_prueba: true }, () =>
      jsonResponse({ valor: "prueba" }),
    );
    const screen = await render(harness.wrap(<Probe />));

    await expect.element(screen.getByTestId("on")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("settled")).toHaveTextContent("true");
    expect(harness.network.to("/rest/v1/app_flags")[0]?.query.get("clave")).toBe("eq.gestiones");
  });

  it("is not read until it is needed", async () => {
    const harness = harnessWith(ACTIVE, () => jsonResponse({ valor: "on" }));
    const screen = await render(harness.wrap(<Probe enabled={false} />));

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("false");
    expect(harness.network.to("/rest/v1/app_flags")).toEqual([]);
  });

  it("with no row it is off", async () => {
    const harness = harnessWith({ ...ACTIVE, role: "admin" }, () => jsonResponse(null));
    const screen = await render(harness.wrap(<Probe />));

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("on")).toHaveTextContent("false");
  });

  it("a failure is like off", async () => {
    const harness = harnessWith({ ...ACTIVE, role: "admin" }, () =>
      jsonResponse({ message: "x" }, 403),
    );
    const screen = await render(harness.wrap(<Probe />));

    await vi.waitFor(() => {
      expect(screen.getByTestId("settled").element().textContent).toBe("true");
    });
    await expect.element(screen.getByTestId("on")).toHaveTextContent("false");
  });
});
