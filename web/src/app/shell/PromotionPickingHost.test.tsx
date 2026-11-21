import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import {
  type ManyBrandsRequest,
  type OneBrandRequest,
  usePromotionPicker,
  usePromotionPicking,
} from "@/shared/lib/promotions/promotion-picking.ts";
import {
  NO_PROMOTION_FILTERS,
  usePromotionFiltersPort,
} from "@/shared/lib/promotions/promotion-filters.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { PromotionPickingHost } from "./PromotionPickingHost.tsx";

const PROMOTION: Promotion = { id: 1, titulo: "Adidas", imagen: "a.png" };

function Stage({ onBack }: { readonly onBack: OneBrandRequest["onBack"] }) {
  const { pickOneBrand } = usePromotionPicker();
  const picking = usePromotionPicking();
  const port = usePromotionFiltersPort();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          pickOneBrand({ filters: { ...NO_PROMOTION_FILTERS, province: "SALTA" }, onBack });
        }}
      >
        Elegir
      </button>
      <p data-testid="asked">{port.read().province}</p>
      {picking?.bar}
      {picking?.firstCell({ promotion: PROMOTION, status: "VIGENTE" })}
      {picking?.firstCell({ promotion: PROMOTION, status: "VENCIDA" })}
      {picking?.firstCell({ promotion: PROMOTION, status: "FUERA_PROV" })}
      {picking?.firstCell({ promotion: null, status: "NO_ENCONTRADA" })}
    </>
  );
}

async function open() {
  const onBack = vi.fn<OneBrandRequest["onBack"]>();
  const goTo = vi.fn<(id: string) => void>();
  const screen = await render(
    createAppHarness().wrap(
      <PromotionPickingHost activeId="flyer" goTo={goTo}>
        <Stage onBack={onBack} />
      </PromotionPickingHost>,
    ),
  );
  await screen.getByRole("button", { name: "Elegir" }).click();
  return { screen, onBack, goTo };
}

describe("choosing a brand at full screen", () => {
  it("goes to Promociones with what was chosen, saying what is going on", async () => {
    const { screen, goTo } = await open();
    expect(goTo).toHaveBeenCalledWith("promos");
    await expect.element(screen.getByTestId("picking-bar")).toMatchTextContent(/Cambiar un logo/);
  });

  it("+ chooses it and comes back to where it was", async () => {
    const { screen, goTo, onBack } = await open();
    await screen.getByTestId("pick-brand").first().click();
    expect(onBack).toHaveBeenCalledWith(PROMOTION);
    expect(goTo).toHaveBeenLastCalledWith("flyer");
    await expect.element(screen.getByTestId("picking-bar")).not.toBeInTheDocument();
  });

  it("what is over or of another province cannot be chosen, and says why", async () => {
    const { screen } = await open();
    const buttons = screen.getByTestId("pick-brand");
    await expect.element(buttons.nth(1)).toBeDisabled();
    await expect
      .element(buttons.nth(1))
      .toHaveAttribute("title", "Está vencida: no se puede poner en la franja");
    await expect
      .element(buttons.nth(2))
      .toHaveAttribute("title", "Es de otra provincia: no se puede poner en la franja");
    // A row with no brand offers no +: it keeps the usual tick.
    await expect.element(buttons.nth(3)).not.toBeInTheDocument();
  });

  it("Volver comes back with nothing, and Cancelar stays and says so", async () => {
    const { screen, onBack, goTo } = await open();
    await screen.getByRole("button", { name: "Volver al logo" }).click();
    expect(onBack).toHaveBeenCalledWith(null);
    await screen.getByRole("button", { name: "Elegir" }).click();
    goTo.mockClear();
    await screen.getByRole("button", { name: "Cancelar" }).click();
    expect(goTo).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Listo: no se cambió el logo.");
  });
});

const OTHER: Promotion = { id: 2, titulo: "Fr&eacute;ddo", imagen: "b.png" };
const THIRD: Promotion = { id: 3, titulo: "Coto", imagen: "c.png" };

function ManyStage(props: Omit<ManyBrandsRequest, "filters">) {
  const { pickManyBrands, stopPicking } = usePromotionPicker();
  const picking = usePromotionPicking();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          pickManyBrands({
            filters: { ...NO_PROMOTION_FILTERS, province: "SALTA" },
            ...props,
          });
        }}
      >
        Elegir varias
      </button>
      <button type="button" onClick={stopPicking}>
        Dejar
      </button>
      {picking?.bar}
      <p data-testid="chosen">
        {String(picking?.isChosen?.({ promotion: PROMOTION, status: "VIGENTE" }) ?? "")}
      </p>
      {picking?.firstCell({ promotion: PROMOTION, status: "VIGENTE" })}
      {picking?.firstCell({ promotion: OTHER, status: "VIGENTE" })}
      {picking?.firstCell({ promotion: THIRD, status: "VENCIDA" })}
      {picking?.firstCell({ promotion: null, status: "NO_ENCONTRADA" })}
    </>
  );
}

async function openMany(fields: Partial<Omit<ManyBrandsRequest, "filters">> = {}) {
  const onBack = vi.fn<ManyBrandsRequest["onBack"]>();
  const onCancel = vi.fn<() => void>();
  const onAdd = vi.fn<ManyBrandsRequest["onAdd"]>();
  const goTo = vi.fn<(id: string) => void>();
  const screen = await render(
    createAppHarness().wrap(
      <PromotionPickingHost activeId="sueldo" goTo={goTo}>
        <ManyStage
          picked={[]}
          limit={30}
          limitNotice="Hasta 30 logos por franja."
          onAdd={onAdd}
          onBack={onBack}
          onCancel={onCancel}
          {...fields}
        />
      </PromotionPickingHost>,
    ),
  );
  await screen.getByRole("button", { name: "Elegir varias" }).click();
  return { screen, onBack, onCancel, onAdd, goTo };
}

describe("choosing several brands at full screen", () => {
  it("says how to do it, and + adds them in order", async () => {
    const { screen, onAdd, goTo } = await openMany();
    expect(goTo).toHaveBeenCalledWith("promos");
    const bar = screen.getByTestId("picking-bar");
    await expect.element(bar).toMatchTextContent(/Tocá \+ en las marcas que querés/);
    await expect.element(screen.getByRole("button", { name: "Volver a la franja" })).toBeVisible();
    await screen.getByTestId("pick-brand").nth(1).click();
    expect(onAdd).toHaveBeenCalledWith({ logo: "b.png", title: "Fréddo" });
    await expect.element(bar).toMatchTextContent(/1 marca elegida: 1\. Fréddo/);
    await screen.getByTestId("pick-brand").first().click();
    await expect.element(bar).toMatchTextContent(/2 marcas elegidas: 1\. Fréddo, 2\. Adidas/);
    await expect.element(screen.getByTestId("pick-brand").first()).toHaveTextContent("2");
    await expect
      .element(screen.getByTestId("pick-brand").first())
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(screen.getByTestId("chosen")).toHaveTextContent("true");
    await expect.element(bar).toHaveAttribute("data-titles", '["Fréddo","Adidas"]');
  });

  it("touching a chosen one takes it out, and going back brings what is chosen", async () => {
    const { screen, onBack, goTo } = await openMany({
      picked: [
        { logo: "a.png", title: "Adidas" },
        { logo: "c.png", title: "Coto" },
      ],
    });
    await expect.element(screen.getByTestId("pick-brand").nth(2)).toBeEnabled();
    await expect.element(screen.getByTestId("pick-brand").nth(2)).toHaveTextContent("2");
    await screen.getByTestId("pick-brand").first().click();
    await screen.getByRole("button", { name: "Volver a la franja (1)" }).click();
    expect(onBack).toHaveBeenCalledWith([{ logo: "c.png", title: "Coto" }]);
    expect(goTo).toHaveBeenLastCalledWith("sueldo");
    await expect.element(screen.getByTestId("picking-bar")).not.toBeInTheDocument();
  });

  it("what is over cannot be chosen, and a row with no brand keeps its tick", async () => {
    const { screen } = await openMany();
    await expect.element(screen.getByTestId("pick-brand").nth(2)).toBeDisabled();
    await expect
      .element(screen.getByTestId("pick-brand").nth(2))
      .toHaveAttribute("title", "Está vencida: no se puede poner en la franja");
    await expect.element(screen.getByTestId("pick-brand")).toHaveLength(3);
  });

  it("over the limit it says so", async () => {
    const { screen, onAdd } = await openMany({ limit: 1 });
    await screen.getByTestId("pick-brand").first().click();
    await screen.getByTestId("pick-brand").nth(1).click();
    expect(onAdd).toHaveBeenCalledOnce();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Hasta 30 logos por franja.");
  });

  it("the bar shows the first five", async () => {
    const picked = Array.from({ length: 6 }, (_pick, index) => ({
      logo: `${String(index)}.png`,
      title: `M${String(index)}`,
    }));
    const { screen } = await openMany({ picked });
    await expect.element(screen.getByTestId("picking-bar")).toMatchTextContent(/5\. M4…/);
  });

  it("Cancelar stays and says so, and Dejar says nothing", async () => {
    const { screen, onCancel, goTo } = await openMany();
    goTo.mockClear();
    await screen.getByRole("button", { name: "Cancelar" }).click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(goTo).not.toHaveBeenCalled();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Listo: no se armó la franja.");
    await screen.getByRole("button", { name: "Elegir varias" }).click();
    await screen.getByRole("button", { name: "Dejar" }).click();
    await expect.element(screen.getByTestId("picking-bar")).not.toBeInTheDocument();
  });
});
