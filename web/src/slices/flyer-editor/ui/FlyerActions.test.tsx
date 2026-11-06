import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { MENU_CLOSED, MENU_OPEN } from "@/shared/lib/places/place-desk.ts";
import { placeDeskOnPage } from "@/shared/lib/testing/place-desk-on-page.ts";
import { PlaceDeskReader } from "@/shared/lib/testing/PlaceDeskReader.tsx";
import { GUIDE_TIP_ATTRIBUTE } from "@/shared/ui/index.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { FlyerActions } from "./FlyerActions.tsx";

/** Otros opens upward: it needs room above it, as it has at the foot of the panel. */
function atTheFoot(children: ReactNode) {
  return <div style={{ paddingTop: 200 }}>{children}</div>;
}

function callbacks() {
  return {
    onPreview: vi.fn<() => void>(),
    onDownload: vi.fn<(kind: "pdf" | "png") => void>(),
    onShare: vi.fn<() => void>(),
    onRestore: vi.fn<() => void>(),
  };
}

type ActionsProps = Partial<ComponentProps<typeof FlyerActions>>;

/** They read the form: the switch of Oficiales por sede goes in the menu Otros. */
async function open(props: ActionsProps, foot = true) {
  const handlers = callbacks();
  const actions = (
    <FlyerActions busy={false} sharing={false} canShare={false} {...handlers} {...props} />
  );
  const opened = await openWithForm(foot ? atTheFoot(actions) : actions);
  return { ...handlers, ...opened };
}

const others = () => page.getByRole("button", { name: "Otros" });
const png = () => page.getByRole("button", { name: "Descargar como imagen (PNG)" });

beforeEach(async () => {
  await page.viewport(1280, 800);
});

describe("the buttons of the form", () => {
  it("on a computer, what is used all the time is on the bar, and Restaurar apart", async () => {
    const { onDownload, onRestore, onPreview, screen } = await open({});
    const dock = screen.getByTestId("flyer-dock");
    await dock.getByRole("button", { name: "Descargar PDF" }).click();
    expect(onDownload).toHaveBeenCalledWith("pdf");
    await dock.getByRole("button", { name: "Vista previa" }).click();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(dock.getByRole("button", { name: "Restaurar" }).query()).toBeNull();
    await screen.getByRole("button", { name: "Restaurar" }).click();
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("while it works it says so", async () => {
    const { screen } = await open({ busy: true }, false);
    await expect.element(screen.getByTestId("download-pdf")).toHaveTextContent("Un momento…");
    expect(screen.getByRole("button", { name: "Descargar PDF" }).query()).toBeNull();
  });

  it("Otros opens over the bar, and closes on choosing, with Escape or outside", async () => {
    const { onDownload } = await open({});
    await expect.element(png()).not.toBeInTheDocument();

    await others().click();
    await expect.element(png()).toBeVisible();
    await png().click();
    expect(onDownload).toHaveBeenCalledWith("png");
    await expect.element(png()).not.toBeInTheDocument();

    await others().click();
    await userEvent.keyboard("{Escape}");
    await expect.element(png()).not.toBeInTheDocument();

    await others().click();
    const menu = png().element().parentElement;
    if (!menu) throw new Error("It has no menu");
    await page.elementLocator(menu).click({ position: { x: 1, y: 1 } });
    // Inside, it stays.
    await expect.element(png()).toBeVisible();
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect.element(png()).not.toBeInTheDocument();
  });

  it("the tutorial opens and closes it, and touching its globe leaves it open", async () => {
    const handlers = callbacks();
    await openWithForm(
      atTheFoot(
        <>
          <PlaceDeskReader />
          <section {...{ [GUIDE_TIP_ATTRIBUTE]: "" }}>
            <button type="button">Siguiente</button>
          </section>
          <FlyerActions busy={false} sharing={false} canShare={false} {...handlers} />
        </>,
      ),
    );

    placeDeskOnPage().ask("flyer-others", MENU_OPEN);
    await expect.element(png()).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect.element(png()).toBeVisible();
    placeDeskOnPage().ask("flyer-others", MENU_CLOSED);
    await expect.element(png()).not.toBeInTheDocument();
  });

  it("another key leaves Otros open", async () => {
    await open({});
    await others().click();
    await userEvent.keyboard("a");
    await expect.element(png()).toBeVisible();
  });

  it("on a phone they go back to the column of the form, in their order, and Otros stays open (invariant 17)", async () => {
    await page.viewport(390, 800);
    const { onDownload, screen } = await open({}, false);
    expect(screen.getByTestId("flyer-dock").query()).toBeNull();
    const buttons = [...document.querySelectorAll("button")].map(({ textContent }) =>
      textContent.trim(),
    );
    expect(buttons.filter((text) => /Vista|Descargar PDF|Restaurar|Otros/.test(text))).toEqual([
      "Vista previa",
      "Descargar PDF",
      "Restaurar",
      "Otros ▾",
    ]);
    await others().click();
    await png().click();
    expect(onDownload).toHaveBeenCalledWith("png");
    await expect.element(png()).toBeVisible();
    await screen.getByRole("button", { name: "Restaurar" }).click();
    await expect.element(png()).toBeVisible();
    await others().click();
    await expect.element(png()).not.toBeInTheDocument();
  });

  it("Descargar PDF tells its key when the mouse rests on it", async () => {
    const real = window.matchMedia.bind(window);
    vi.spyOn(window, "matchMedia").mockImplementation((query) => {
      const answer = real(query);
      if (query.includes("pointer")) Object.defineProperty(answer, "matches", { value: true });
      return answer;
    });
    const { screen } = await open({});
    await screen.getByTestId("download-pdf").hover();
    await expect.element(page.getByRole("tooltip")).toMatchTextContent(/\+ Enter/);
    vi.restoreAllMocks();
  });

  it("Compartir is on the menu only if the browser can, and says when it is working", async () => {
    const { onShare } = await open({ canShare: true });
    await others().click();
    const share = page.getByRole("button", { name: /Compartir el PDF/ });
    await share.click();
    expect(onShare).toHaveBeenCalledOnce();
    await expect.element(share, { timeout: 500 }).not.toBeInTheDocument();
  });

  it("while it shares it cannot be pressed again", async () => {
    await open({ canShare: true, sharing: true });
    await others().click();
    await expect.element(page.getByRole("button", { name: "Un momento…" }).last()).toBeDisabled();
  });

  it("without being able to, Compartir is not on the menu", async () => {
    await open({ canShare: false });
    await others().click();
    expect(page.getByRole("button", { name: /Compartir/ }).query()).toBeNull();
  });
});
