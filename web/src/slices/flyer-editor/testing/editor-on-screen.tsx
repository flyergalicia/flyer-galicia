// Test support: the whole flyer editor over a simulated cloud.
import { expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  LOGO_A,
  LOGO_B,
  paintedFlyer,
  workspaceOnScreen,
} from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import {
  type PromotionPicker,
  PromotionPickerContext,
} from "@/shared/lib/promotions/promotion-picking.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { EditorStage } from "./EditorStage.tsx";

const OPTIONS = {
  opts: [
    { n: 9, nombre: "Combustible", solapa: "flyer", orden: 0, color: "#ff0000" },
    { n: 7, nombre: "Sueldo Uno", solapa: "sueldo" },
    { n: 8, nombre: "Rubro Uno", solapa: "rubros" },
    { n: 6, nombre: "Otro Flyer", solapa: "flyer", orden: 1 },
  ],
};

export const ALLOWED = {
  opcion_9: true,
  opcion_7: true,
  opcion_8: true,
  opcion_6: true,
  opcion_1: false,
};

const NO_PICKER = {
  pickOneBrand: vi.fn<PromotionPicker["pickOneBrand"]>(),
  pickManyBrands: vi.fn<PromotionPicker["pickManyBrands"]>(),
  stopPicking: vi.fn<PromotionPicker["stopPicking"]>(),
};

export function flyerFiles() {
  const image = paintedFlyer([LOGO_A, LOGO_B]);
  return {
    "_opciones.json": OPTIONS,
    "_facultades.json": { roles: { asesor: ALLOWED } },
    "_active9.json": { imageUrl: image, cfg: {} },
    "_legal9.json": { text: "Legal de la nueve" },
    "_active6.json": { imageUrl: null },
    "_legal6.json": { text: "Legal de la seis" },
    "_active7.json": { imageUrl: image, cfg: {} },
    "_legal7.json": { text: "" },
    "_active8.json": { imageUrl: image, cfg: {} },
    "_legal8.json": { text: "Legal" },
  };
}

export async function open(
  answers: AppAnswers = {},
  tabId = "flyer",
  isActive = true,
  ways: Pick<ViewProps, "goToTab" | "openMenuWindow"> = {},
) {
  const harness = createAppHarness({ profile: ADVISOR, files: flyerFiles(), ...answers });
  harness.storeSession();
  const view = (id: string, active: boolean) =>
    harness.wrap(
      <PromotionPickerContext.Provider value={NO_PICKER}>
        <EditorStage tabId={id} isActive={active} {...ways} />
      </PromotionPickerContext.Provider>,
    );
  const screen = await render(view(tabId, isActive));
  return {
    screen,
    harness,
    show: (id: string, active = true) => screen.rerender(view(id, active)),
  };
}

export function flyerShown() {
  return vi.waitFor(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="flyer-canvas"]');
      expect(canvas?.height).toBeGreaterThan(100);
      const { slot, draws } = workspaceOnScreen().getState();
      expect(slot.loading).toBe(false);
      expect(slot.option).not.toBeNull();
      expect(draws).toBeGreaterThan(0);
    },
    { timeout: 10_000 },
  );
}
