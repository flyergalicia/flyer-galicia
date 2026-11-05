// What Estudio says on the header, without its screen being open.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { NO_TITLES } from "@/shared/domain/screen-titles.ts";
import { type AppAnswers, ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { AppShell } from "./AppShell.tsx";

const NOTICE = { compartido_por: null, compartido_at: null };

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
  return screen;
}

const WITH_FACULTY = { "_facultades.json": { roles: { asesor: { estudio: true } } } };
const tab = () => page.getByRole("tab", { name: /^Estudio/ });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("Estudio on the header", () => {
  it("a question goes on the tab and on the name, and says what it is", async () => {
    await open({
      files: WITH_FACULTY,
      tables: {
        flyer_disenos: () =>
          jsonResponse([{ id: "d", nombre: "x", estado: "consulta", ...NOTICE }]),
      },
    });
    await expect.element(tab()).toMatchTextContent(/1$/);
    await expect.element(page.getByTestId("header-notice")).toHaveTextContent("1");
    await expect
      .element(page.getByRole("button", { name: /^Menú de / }))
      .toHaveAttribute("title", "Tenés 1 pregunta sobre un diseño de Estudio");
  });

  it("the requests of an administrator go only on the tab", async () => {
    await open({
      profile: { ...ADVISOR, role: "admin" },
      tables: {
        flyer_disenos: ({ method }) =>
          method === "HEAD"
            ? new Response(null, { status: 200, headers: { "Content-Range": "*/2" } })
            : jsonResponse([]),
      },
    });
    await expect.element(tab()).toMatchTextContent(/2$/);
    await expect.element(page.getByTestId("header-notice")).not.toBeInTheDocument();
  });

  it("a copy from the administrator brings the tab, without the faculty", async () => {
    await open({
      tables: {
        flyer_disenos: () =>
          jsonResponse([
            {
              id: "d",
              nombre: "Copia",
              estado: "privado",
              compartido_por: "Admin",
              compartido_at: "2026-10-23",
            },
          ]),
      },
    });
    await expect.element(tab()).toBeVisible();
    await expect.element(page.getByRole("status")).toMatchTextContent(/te compartió «Copia»/);
  });

  it("without faculty and with nothing shared there is no tab", async () => {
    const screen = await open({ tables: { flyer_disenos: () => jsonResponse([]) } });
    await expect.element(screen.getByRole("tab", { name: /^Flyer/ })).toBeVisible();
    await expect.element(tab()).not.toBeInTheDocument();
  });
});
