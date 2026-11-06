// The title of a panel that the administrator renames with four taps, as the tabs of the header.
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ADVISOR, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { RenameableTitle } from "./RenameableTitle.tsx";

async function show(role: string, refuse = false) {
  const harness = createAppHarness({
    profile: { ...ADVISOR, role },
    files: { "_titulos.json": { hunter_ptitle: "Flyer por empresa" } },
    intercept: ({ path, method }) =>
      refuse && method === "POST" && path === "/storage/v1/object/flyers/_titulos.json"
        ? jsonResponse({ statusCode: "403", error: "x", message: "sin permiso" }, 403)
        : null,
  });
  harness.storeSession();
  await render(
    harness.wrap(
      <Inside>
        <RenameableTitle titleKey="hunter_ptitle" className="titulo" />
      </Inside>,
    ),
  );
  return harness;
}

const title = () => page.getByRole("button", { name: "Flyer por empresa" });
const notice = () => page.getByRole("status");

async function tapFour(on = title()) {
  await on.click();
  await on.click();
  await on.click();
  await on.click();
}

describe("a title the administrator renames", () => {
  it("for somebody else it is only text", async () => {
    await show("asesor");
    await expect.element(page.getByText("Flyer por empresa")).toBeVisible();
    expect(title().query()).toBeNull();
  });

  it("four taps open its field; Enter saves it for everybody", async () => {
    const harness = await show("admin");
    await expect
      .element(title())
      .toHaveAttribute("title", "4 toques seguidos para cambiar el nombre");
    await title().click();
    await title().click();
    expect(page.getByRole("textbox").query()).toBeNull();
    await title().click();
    await title().click();
    const field = page.getByRole("textbox", { name: "Nombre del título" });
    await expect.element(field).toHaveValue("Flyer por empresa");
    await userEvent.fill(field, "Buscá <tu> flyer");
    await userEvent.keyboard("{Enter}");
    await expect.element(notice()).toHaveTextContent("Título guardado: Buscá tu flyer");
    await expect.element(page.getByRole("button", { name: "Buscá tu flyer" })).toBeVisible();
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json", "POST")).toHaveLength(1);
  });

  it("Escape, or the same name, changes nothing", async () => {
    const harness = await show("admin");
    await tapFour();
    await userEvent.keyboard("{Escape}");
    await expect.element(title()).toBeVisible();
    await tapFour();
    await userEvent.click(document.body);
    await expect.element(title()).toBeVisible();
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json", "POST")).toEqual([]);
  });

  it("a name that could not be saved says so", async () => {
    await show("admin", true);
    await tapFour();
    await userEvent.fill(page.getByRole("textbox"), "Otro nombre");
    await userEvent.keyboard("{Enter}");
    await expect.element(notice()).toMatchTextContent(/^Error al guardar el título: /);
  });
});

async function showOther(role: string) {
  const harness = createAppHarness({
    profile: { ...ADVISOR, role },
    files: { "_titulos.json": { ptitle: "Flyer del mes", rubros: "Rubros del mes" } },
  });
  harness.storeSession();
  await render(
    harness.wrap(
      <Inside>
        <p data-testid="line">
          <RenameableTitle titleKey="ptitle" shown="rubros" inline />
        </p>
      </Inside>,
    ),
  );
  return harness;
}

describe("a title that shows another one", () => {
  it("shows its name, inside a line of text", async () => {
    await showOther("asesor");
    await expect.element(page.getByTestId("line")).toHaveTextContent("Rubros del mes");
    expect(page.getByTestId("line").element().firstElementChild?.tagName).toBe("SPAN");
  });

  it("renames its own name, as the panel of the flyer editor does today on another tab", async () => {
    const harness = await showOther("admin");
    const shown = page.getByRole("button", { name: "Rubros del mes" });
    await tapFour(shown);
    const field = page.getByRole("textbox", { name: "Nombre del título" });
    await expect.element(field).toHaveValue("Flyer del mes");
    await userEvent.fill(field, "Flyer de noviembre");
    await userEvent.keyboard("{Enter}");
    await expect.element(notice()).toHaveTextContent("Título guardado: Flyer de noviembre");
    await expect.element(shown).toBeVisible();
    expect(harness.network.to("/storage/v1/object/flyers/_titulos.json", "POST")).toHaveLength(1);
    await tapFour(shown);
    await expect.element(field).toHaveValue("Flyer de noviembre");
  });
});
