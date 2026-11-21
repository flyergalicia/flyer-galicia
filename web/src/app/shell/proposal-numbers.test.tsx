import { describe, expect, it } from "vitest";
import { type Locator } from "vitest/browser";
import { render } from "vitest-browser-react";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { NO_TITLES } from "@/shared/domain/screen-titles.ts";
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { AppShell } from "./AppShell.tsx";

const PENDING = {
  id: "p1",
  empresa: "ACME",
  estado: "pendiente",
  creada_por: "otro",
  dueno_id: INVENTED_USER.id,
  created_at: "2020-10-20T10:00:00Z",
};

function Shell() {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <AppShell
      session={session}
      titles={NO_TITLES}
      flyerOptions={sanitizeFlyerOptions(null)}
      commercialActionsOn={false}
    />
  );
}

async function open(answers: AppAnswers) {
  const harness = createAppHarness(answers);
  harness.storeSession();
  const screen = await render(harness.wrap(<Shell />));
  await expect.element(screen.getByRole("banner")).toBeVisible();
  await screen.getByRole("button", { name: /^Menú de / }).click();
  return screen;
}

function item(screen: Awaited<ReturnType<typeof open>>, name: string): Locator {
  return screen.getByRole("menuitem", { name: new RegExp(name) });
}

describe("what is waiting, on the name menu", () => {
  it("Base de datos carries the number, and the name of the person too", async () => {
    const screen = await open({
      files: { "_facultades.json": { roles: { asesor: { padron_buscar: true } } } },
      tables: { padron_propuestas: () => jsonResponse([PENDING]) },
    });

    await expect.element(item(screen, "Base de datos")).toHaveTextContent("Base de datos1");
    await expect.element(screen.getByTestId("header-notice")).toHaveTextContent("1");
  });

  it("a substitute without the faculty sees it only when there is something to decide", async () => {
    const screen = await open({
      tables: { padron_propuestas: () => jsonResponse([PENDING]) },
    });

    await expect.element(item(screen, "Base de datos")).toBeVisible();
  });

  it("without faculty and with nothing to decide it is not there", async () => {
    const screen = await open({
      tables: { padron_propuestas: () => jsonResponse([]) },
    });

    await expect.element(item(screen, "Bloc de notas")).not.toBeInTheDocument();
    await expect.element(item(screen, "Base de datos")).not.toBeInTheDocument();
  });

  it("Mis propuestas carries what is new for a Hunter", async () => {
    const screen = await open({
      profile: { ...ADVISOR, role: "hunter" },
      files: { "_facultades.json": { roles: { hunter: { proponer_oficiales: true } } } },
      tables: {
        padron_propuestas: ({ query }) =>
          jsonResponse(
            query.get("creada_por")
              ? [{ ...PENDING, estado: "consulta", creada_por: INVENTED_USER.id }]
              : [],
          ),
      },
    });

    await expect.element(item(screen, "Mis propuestas")).toHaveTextContent("Mis propuestas1");
  });
});
