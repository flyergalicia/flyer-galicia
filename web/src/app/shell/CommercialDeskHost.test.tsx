import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useCommercialDesk } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { CommercialDeskHost } from "./CommercialDeskHost.tsx";

const load = vi.hoisted(() => ({ fails: false }));

vi.mock("../registry/views.ts", async (original) => {
  const actual = await original<typeof import("../registry/views.ts")>();
  return {
    ...actual,
    loadRegisterWindow: () =>
      load.fails ? Promise.reject(new Error("no red")) : actual.loadRegisterWindow(),
  };
});

function Asker() {
  const session = useSession();
  const { loadStatus } = usePermissions();
  const desk = useCommercialDesk();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <button
      type="button"
      onClick={() => {
        desk?.register({ empresa: "ACME SA", cuits: [], user_id: "o1" });
      }}
    >
      Registrar
    </button>
  );
}

async function open() {
  const harness = createAppHarness({
    commercialFlag: "on",
    tables: {
      gestiones: ({ method }) =>
        method === "POST"
          ? jsonResponse(
              { id: "new", frecuencia: "unica", estado: "realizada", tipo: "accion" },
              201,
            )
          : jsonResponse([]),
    },
  });
  harness.storeSession();
  const goTo = vi.fn<(tabId: string) => void>();
  await render(
    harness.wrap(
      <CommercialDeskHost goTo={goTo}>
        <Asker />
      </CommercialDeskHost>,
    ),
  );
  await page.getByRole("button", { name: "Registrar" }).click();
  return { goTo };
}

describe("registering from another screen", () => {
  it("brings the window with the code of Gestiones, and closes it", async () => {
    load.fails = false;
    await open();
    const window = page.getByTestId("action-window");
    await expect.element(window).toMatchTextContent(/Registrar gestión/);
    await page.getByTestId("window-dismiss").click();
    await expect.element(window).not.toBeInTheDocument();
  });

  it("if the code does not arrive, it says so", async () => {
    load.fails = true;
    await open();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo cargar Gestiones. Revisá la conexión e intentá de nuevo.");
  });

  it("what it opens goes to Gestiones", async () => {
    load.fails = false;
    const { goTo } = await open();
    await expect.element(page.getByTestId("action-window")).toBeVisible();
    await page.getByTestId("confirm-register").click();
    await vi.waitFor(() => {
      expect(goTo).toHaveBeenCalledWith("gestiones");
    });
  });
});
