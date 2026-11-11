import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { EmptyState } from "./EmptyState.tsx";
import { Notice, type NoticeTone } from "./Notice.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { Skeleton } from "./Skeleton.tsx";
import { Spinner } from "./Spinner.tsx";
import { Toast } from "./Toast.tsx";

describe("Toast", () => {
  it("is announced, and does not get in the way of a press", async () => {
    const screen = await render(<Toast visible>PDF descargado</Toast>);
    const toast = screen.getByRole("status");
    await expect.element(toast).toHaveTextContent("PDF descargado");
    expect(getComputedStyle(toast.element()).opacity).toBe("1");
    expect(getComputedStyle(toast.element()).pointerEvents).toBe("none");
  });

  it("is transparent while it is not shown", async () => {
    const screen = await render(<Toast visible={false}>Listo</Toast>);
    expect(getComputedStyle(screen.getByRole("status").element()).opacity).toBe("0");
  });
});

describe("Spinner", () => {
  it("says what it is waiting for", async () => {
    const screen = await render(<Spinner label="Ingresando" />);
    await expect.element(screen.getByRole("status", { name: "Ingresando" })).toBeVisible();
  });
});

describe("Skeleton", () => {
  it("has the height of what is going to be there, hidden from readers", async () => {
    const screen = await render(
      <>
        <Skeleton />
        <Skeleton shape="card" />
      </>,
    );
    const [row, card] = screen.container.querySelectorAll('[aria-hidden="true"]');
    expect(row?.getBoundingClientRect().height).toBe(48);
    expect(card?.getBoundingClientRect().height).toBe(78);
  });
});

describe("EmptyState", () => {
  it("says what is missing, with something to do about it", async () => {
    const screen = await render(
      <EmptyState icon="clock" title="Todavía no generaste flyers">
        Cuando bajes uno va a aparecer acá.
      </EmptyState>,
    );
    await expect.element(screen.getByText("Todavía no generaste flyers")).toBeVisible();
    expect(screen.container.textContent).toContain("Cuando bajes uno va a aparecer acá.");
  });
});

describe("Notice", () => {
  it("interrupts only for an error", async () => {
    const screen = await render(<Notice tone="error">Falta la columna empresa.</Notice>);
    await expect.element(screen.getByRole("alert")).toHaveTextContent("Falta la columna empresa.");
  });

  it.each(["ok", "warning", "accent"] as const)(
    "%s is only announced",
    async (tone: NoticeTone) => {
      const screen = await render(<Notice tone={tone}>Texto</Notice>);
      await expect.element(screen.getByRole("status")).toHaveTextContent("Texto");
    },
  );
});

describe("ProgressBar", () => {
  it("says how far it is", async () => {
    const screen = await render(<ProgressBar value={50} label="Generando" />);
    await expect
      .element(screen.getByRole("progressbar", { name: "Generando" }))
      .toHaveAttribute("value", "50");
  });

  it("never goes out of its limits", async () => {
    const screen = await render(
      <>
        <ProgressBar value={150} label="Mucho" />
        <ProgressBar value={-3} label="Poco" />
      </>,
    );
    await expect
      .element(screen.getByRole("progressbar", { name: "Mucho" }))
      .toHaveAttribute("value", "100");
    await expect
      .element(screen.getByRole("progressbar", { name: "Poco" }))
      .toHaveAttribute("value", "0");
  });
});
