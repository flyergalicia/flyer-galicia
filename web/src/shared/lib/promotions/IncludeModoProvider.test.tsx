import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useIncludeModo, useSetIncludeModo } from "./include-modo-context.ts";
import { IncludeModoProvider } from "./IncludeModoProvider.tsx";

const KEY = "fg_promos_modo";

function Tick() {
  const on = useIncludeModo();
  const set = useSetIncludeModo();
  return (
    <button
      type="button"
      onClick={() => {
        set(!on);
      }}
    >
      {on ? "con MODO" : "sin MODO"}
    </button>
  );
}

function OnlySets() {
  useSetIncludeModo();
  return null;
}

function open() {
  return render(
    <IncludeModoProvider>
      <Tick />
    </IncludeModoProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Incluir MODO", () => {
  it("starts on, and it is one for everybody", async () => {
    const screen = await open();
    await expect.element(screen.getByRole("button", { name: "con MODO" })).toBeVisible();
  });

  it("this browser remembers it", async () => {
    const screen = await open();
    await screen.getByRole("button").click();
    await expect.element(screen.getByRole("button", { name: "sin MODO" })).toBeVisible();
    expect(localStorage.getItem(KEY)).toBe("0");

    await screen.getByRole("button").click();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("finds what it remembered", async () => {
    localStorage.setItem(KEY, "0");
    const screen = await open();
    await expect.element(screen.getByRole("button", { name: "sin MODO" })).toBeVisible();
  });

  it("without storage it starts on and goes on working", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("No storage");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("No storage");
    });
    const screen = await open();
    await screen.getByRole("button", { name: "con MODO" }).click();
    await expect.element(screen.getByRole("button", { name: "sin MODO" })).toBeVisible();
  });

  it("needs its provider", async () => {
    await expect(render(<Tick />)).rejects.toThrow(/IncludeModoProvider/);
    await expect(render(<OnlySets />)).rejects.toThrow(/IncludeModoProvider/);
  });
});
