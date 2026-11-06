// The frame of the panel: its pillars and sheets, where it opens, and what it asks before closing.
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { FIRST_PLACE, rememberPlace } from "../model/panel.ts";
import { openPanel } from "../testing/panel-cloud.ts";

const panel = () => page.getByTestId("admin-panel");
const pillar = (name: string) =>
  panel()
    .getByRole("tablist", { name: "Pilares del panel" })
    .getByRole("tab", { name, exact: true });
const sheet = (pillarName: string, name: string) =>
  panel()
    .getByRole("tablist", { name: `Hojas de ${pillarName}` })
    .getByRole("tab", { name, exact: true });

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("the panel", () => {
  it("has three pillars with their sheets, and every one of Config is there", async () => {
    await openPanel();
    await expect.element(sheet("Admin", "Dashboard")).toHaveAttribute("aria-selected", "true");
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sheets-of]"),
      (group) => [
        group.dataset.sheetsOf,
        Array.from(group.querySelectorAll('[role="tab"]'), (tab) => tab.textContent),
      ],
    );
    expect(groups).toEqual([
      ["Admin", ["Dashboard", "Usuarios", "Registros", "Uso", "Facultades", "Auditoría"]],
      ["Data", ["Mis empresas", "Mis asesores", "Empresas por usuario", "Cambios en las empresas"]],
      ["Config", ["Flyer", "Cashback", "Legales", "Opciones", "Marcas vigiladas"]],
    ]);
    await pillar("Config").click();
    await expect.element(sheet("Config", "Flyer")).toHaveAttribute("aria-selected", "true");
    await expect.element(panel()).toMatchTextContent(/Subir nueva versión del flyer/);
    await sheet("Config", "Cashback").click();
    await expect.element(panel()).toMatchTextContent(/Montos de cashback/);
    await sheet("Config", "Legales").click();
    await expect.element(panel()).toMatchTextContent(/Términos y condiciones/);
    await sheet("Config", "Opciones").click();
    await expect.element(panel()).toMatchTextContent(/Opciones del armador/);
    await sheet("Config", "Marcas vigiladas").click();
    await expect.element(panel()).toMatchTextContent(/Todos los días a las 9/);
  });

  it("goes back to the last sheet seen of each pillar, and opens again where it was left", async () => {
    const { screen } = await openPanel();
    await sheet("Admin", "Auditoría").click();
    await pillar("Data").click();
    await sheet("Data", "Cambios en las empresas").click();
    await pillar("Admin").click();
    await expect.element(sheet("Admin", "Auditoría")).toHaveAttribute("aria-selected", "true");
    await pillar("Data").click();
    await expect
      .element(sheet("Data", "Cambios en las empresas"))
      .toHaveAttribute("aria-selected", "true");
    await screen.unmount();

    await openPanel();
    await expect
      .element(sheet("Data", "Cambios en las empresas"))
      .toHaveAttribute("aria-selected", "true");
  });

  it("marks Admin with a dot while an account waits for a decision", async () => {
    await openPanel({ accounts: [{ id: "p", full_name: "Pedro", status: "pending" }] });
    await expect.poll(() => pillar("Admin").element().className).toMatch(/dot/);
  });

  it("closes with its button, its backdrop or Escape, sliding out", async () => {
    const first = await openPanel();
    await panel().getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect.poll(() => first.closed.length).toBe(1);
    await first.screen.unmount();

    // The backdrop is what is left of the window to the left of the panel: it is touched there.
    await page.viewport(1366, 800);
    const second = await openPanel();
    await expect.element(panel()).toBeVisible();
    await page.getByRole("button", { name: "Cerrar el panel" }).click({ position: { x: 5, y: 5 } });
    await expect.poll(() => second.closed.length).toBe(1);
    await second.screen.unmount();

    const third = await openPanel();
    await expect.element(panel()).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => third.closed.length).toBe(1);
  });

  it("asks before closing with advisors not saved, and stays if told so", async () => {
    const { closed } = await openPanel();
    await pillar("Data").click();
    await sheet("Data", "Mis asesores").click();
    await panel()
      .getByRole("button", { name: /Agregar asesor/ })
      .click();
    await panel().getByRole("button", { name: "Cerrar", exact: true }).click();

    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/cambios sin guardar en tus asesores/);
    await question.getByRole("button", { name: "Seguir editando" }).click();
    expect(closed).toEqual([]);
    await expect.element(panel()).toBeVisible();

    await panel().getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Salir sin guardar" }).click();
    await expect.poll(() => closed.length).toBe(1);
  });
});
