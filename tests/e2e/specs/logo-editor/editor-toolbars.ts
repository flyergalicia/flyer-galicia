import { type Page } from "@playwright/test";
import { type FlyerBox, type PlacedLogo } from "../../support/driver/logo-editor.ts";
import { type OpenedApp } from "../../support/open-app.ts";

/** The bar at the foot of the preview to adjust what is chosen. */
export function adjustBar(page: Page) {
  return page.getByRole("toolbar", { name: "Ajustar el elemento elegido" });
}

/** The bar for logos of the flyer chosen with Shift that were not changed yet. */
export function groupBar(page: Page) {
  return page.getByRole("toolbar", { name: "Varios elegidos" });
}

/** The window for changing a logo, whatever its title says. */
export function picker(page: Page) {
  return page.getByRole("dialog", { name: /Cambiar esto|Agregar acá|Reemplazar \d+ lugares/ });
}

/** The window for building a strip of logos. */
export function stripWindow(page: Page) {
  return page.getByRole("dialog", { name: "Armar franja" });
}

export function button(page: Page, name: string | RegExp) {
  return page.getByRole("button", { name, exact: typeof name === "string" });
}

/** "Vista previa" of the bar of Cambiar logos; the panel has another one with that name. */
export function cleanPreviewButton(page: Page) {
  return page.getByRole("button", {
    name: "Vista previa",
    description: /tal como se va a descargar/,
  });
}

/** A change of the flyer that has to be there. */
export async function placedAt(app: OpenedApp, index: number): Promise<PlacedLogo> {
  const placed = (await app.logoEditor.placements())[index];
  if (!placed) throw new Error(`There is no change number ${index} on the flyer`);
  return placed;
}

/** Where a change is drawn, when it has to be drawn. */
export function boxOf({ box }: PlacedLogo): FlyerBox {
  if (!box) throw new Error("That change draws nothing");
  return box;
}

/** The nth item of a list that has to have it. */
export function nth<Item>(items: readonly Item[], index: number): Item {
  const item = items[index];
  if (item === undefined) throw new Error(`There is no item number ${index}`);
  return item;
}
