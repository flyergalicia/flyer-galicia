import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { Menu } from "../menu/Menu.ts";
import { PalettePicker } from "./PalettePicker.tsx";
import { useTheme, useThemeActions } from "./theme-context.ts";
import { ThemeProvider } from "./ThemeProvider.tsx";

const root = document.documentElement;

function Toggle() {
  const { dark } = useTheme();
  const { toggleDark } = useThemeActions();
  return (
    <button type="button" onClick={toggleDark}>
      {dark ? "Modo claro" : "Modo oscuro"}
    </button>
  );
}

function OnlyActions() {
  useThemeActions();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  root.className = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  root.className = "";
});

describe("ThemeProvider", () => {
  it("starts from what was saved", async () => {
    localStorage.setItem("fg_theme", "dark");
    localStorage.setItem("fg_palette", "t-marino");
    await render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("t-marino")).toBe(true);
  });

  it("changes the look at once, and remembers it for the next time", async () => {
    const screen = await render(
      <ThemeProvider>
        <Toggle />
        <PalettePicker />
      </ThemeProvider>,
    );
    await expect
      .element(screen.getByRole("button", { name: "Marfil" }))
      .toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", { name: "Modo oscuro" }).click();
    await screen.getByRole("button", { name: "Cielo" }).click();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("t-cielo")).toBe(true);
    expect(root.classList.contains("t-marfil")).toBe(false);
    expect(localStorage.getItem("fg_theme")).toBe("dark");
    expect(localStorage.getItem("fg_palette")).toBe("t-cielo");
    await expect
      .element(screen.getByRole("button", { name: "Cielo" }))
      .toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", { name: "Modo claro" }).click();
    expect(root.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("fg_theme")).toBe("light");
  });

  it("does not write anything just by opening, even in StrictMode", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    await render(
      <StrictMode>
        <ThemeProvider>
          <Toggle />
        </ThemeProvider>
      </StrictMode>,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("can start in a given look, without looking at what was saved", async () => {
    localStorage.setItem("fg_palette", "t-marino");
    await render(
      <ThemeProvider initial={{ dark: true, palette: "grafito" }}>
        <Toggle />
      </ThemeProvider>,
    );
    expect(root.classList.contains("t-grafito")).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("fg_palette")).toBe("t-marino");
  });

  it("works in a browser that blocks its storage", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    const screen = await render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    await screen.getByRole("button", { name: "Modo oscuro" }).click();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("t-marfil")).toBe(true);
  });

  it("refuses to be used without its provider, with a clear message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Toggle />)).rejects.toThrow("useTheme must be inside a ThemeProvider");
    await expect(render(<OnlyActions />)).rejects.toThrow(
      "useThemeActions must be inside a ThemeProvider",
    );
    quiet.mockRestore();
  });

  it("the picker fits in a menu", async () => {
    const screen = await render(
      <ThemeProvider>
        <Menu defaultOpen>
          <Menu.List label="Cuenta">
            <PalettePicker />
          </Menu.List>
        </Menu>
      </ThemeProvider>,
    );
    await expect.element(screen.getByRole("group", { name: "Tema" })).toBeVisible();
  });
});
