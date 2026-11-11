// The window of the search as a person uses it, with the keys arriving as they do on the page.
// The sizes are tokens: without them every letter would take the size of the page.
import "@/shared/ui/tokens/tokens.css";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SearchEntry } from "../model/entry.ts";
import { RECENT_KEY } from "../model/recent.ts";
import { useSearchShortcut } from "../model/use-search-shortcut.ts";
import { SearchWindow } from "./SearchWindow.tsx";

const ENTRIES: readonly SearchEntry[] = [
  { id: "app:flyer", group: "Pantallas", title: "Flyer Galicia", current: true },
  { id: "app:promos", group: "Pantallas", title: "Promociones", keywords: "marcas" },
  { id: "tab:masivo", group: "Armador", title: "Masivo", keywords: "excel zip" },
  { id: "tab:historial", group: "Armador", title: "Historial" },
  { id: "adm:auditoria", group: "Admin", title: "Auditoría" },
  { id: "fn:salir", group: "Cuenta", title: "Salir", forgotten: true },
];

function Opened({
  entries,
  onChoose,
  onCancel,
}: {
  readonly entries: readonly SearchEntry[];
  readonly onChoose: (entry: SearchEntry) => void;
  readonly onCancel: () => void;
}) {
  const keys = useSearchShortcut(true, onCancel);
  return <SearchWindow entries={entries} keys={keys} onChoose={onChoose} onCancel={onCancel} />;
}

async function open(entries: readonly SearchEntry[] = ENTRIES) {
  const onChoose = vi.fn<(entry: SearchEntry) => void>();
  const onCancel = vi.fn<() => void>();
  await render(<Opened entries={entries} onChoose={onChoose} onCancel={onCancel} />);
  const field = page.getByRole("combobox", { name: "Buscar una pantalla o función" });
  await expect.element(field).toHaveFocus();
  return { onChoose, onCancel, field };
}

const panel = () => page.getByRole("dialog", { name: "Buscador de pantallas" });
const list = () => panel().getByRole("listbox", { name: "Resultados" });

function titles(): string[] {
  return [...list().element().querySelectorAll('[data-part="title"]')].map(
    (title) => title.textContent,
  );
}

function headings(): string[] {
  return [...list().element().querySelectorAll('[role="presentation"]')].map(
    (heading) => heading.textContent,
  );
}

function marked(): number {
  return [...list().element().querySelectorAll('[role="option"]')].findIndex(
    (row) => row.getAttribute("aria-selected") === "true",
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("with nothing written", () => {
  it("lists everything by group, with what was used last first and where the person is", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["tab:historial"]));
    await open();

    expect(headings()).toEqual(["Recientes", "Pantallas", "Armador", "Admin", "Cuenta"]);
    expect(titles()).toEqual([
      "Historial",
      "Flyer Galicia",
      "Promociones",
      "Masivo",
      "Auditoría",
      "Salir",
    ]);
    await expect
      .element(list().getByRole("option", { name: /Flyer Galicia/ }))
      .toHaveTextContent("Flyer GaliciaEstás acá");
    expect(marked()).toBe(0);
  });
});

describe("writing", () => {
  it("lists what it finds, each one saying where it is, with the written part marked", async () => {
    const { field } = await open();

    await field.fill("ZIP");

    expect(titles()).toEqual(["Masivo"]);
    expect(headings()).toEqual([]);
    await expect.element(list().getByRole("option")).toHaveTextContent("MasivoArmador");

    await field.fill("audito");
    expect(list().element().querySelector("mark")?.textContent).toBe("Audito");
    expect(marked()).toBe(0);
  });

  it("says when it finds nothing, and what was written is text", async () => {
    const { field, onChoose } = await open();

    await field.fill("<img src=x onerror=window.__searchXss=1>");

    await expect
      .element(panel())
      .toMatchTextContent(/No encontré nada con «<img src=x onerror=window.__searchXss=1>»/);
    expect(list().element().querySelector("img")).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(onChoose).not.toHaveBeenCalled();
    expect(Reflect.get(window, "__searchXss")).toBeUndefined();
  });

  it("paints a title as text", async () => {
    const markup = "<b>Negrita</b>";
    await open([{ id: "opt:2", group: "Flyers", title: markup }]);

    expect(titles()).toEqual([markup]);
    expect(list().element().querySelector("b")).toBeNull();
  });
});

describe("the keyboard", () => {
  it("goes around the list, and Tab does not take the focus out", async () => {
    const { field } = await open();

    await userEvent.keyboard("{ArrowUp}");
    expect(marked()).toBe(ENTRIES.length - 1);
    await userEvent.keyboard("{ArrowDown}");
    expect(marked()).toBe(0);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(marked()).toBe(2);
    await expect.element(field).toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Tab}");
    await expect.element(field).toHaveFocus();
  });

  it("Enter chooses the one marked and remembers it; Escape closes without choosing", async () => {
    const { onChoose, onCancel } = await open();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChoose).toHaveBeenCalledWith(ENTRIES[2]);
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual(["tab:masivo"]);

    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("leaving the session is not remembered", async () => {
    const { field, onChoose } = await open();

    await field.fill("salir");
    await userEvent.keyboard("{Enter}");

    expect(onChoose).toHaveBeenCalledWith(ENTRIES[5]);
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
  });
});

describe("the mouse", () => {
  it("marks by moving over a row, and chooses by touching it", async () => {
    const { onChoose } = await open();

    await list()
      .getByRole("option", { name: /Auditoría/ })
      .hover();
    expect(marked()).toBe(4);
    await list()
      .getByRole("option", { name: /Masivo/ })
      .click();

    expect(onChoose).toHaveBeenCalledWith(ENTRIES[2]);
  });

  it("closes by touching outside, and inside it leaves the cursor on the field", async () => {
    const { onCancel, field } = await open();

    await list().getByText("Pantallas").click();
    await expect.element(field).toHaveFocus();
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(document.body, { position: { x: 4, y: 4 } });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("the letters", () => {
  it("the field has 16 px at least, so the iPhone does not zoom when it is touched", async () => {
    const { field } = await open();

    expect(Number.parseFloat(getComputedStyle(field.element()).fontSize)).toBeGreaterThanOrEqual(
      16,
    );
  });

  it("nothing goes below 12 px, or 11 px in capitals (invariant 15)", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(["tab:masivo"]));
    const { field } = await open();
    const small: string[] = [];
    const measure = () => {
      for (const element of panel().element().querySelectorAll("*")) {
        const own = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && /[A-Za-z0-9]/.test(node.textContent ?? ""),
        );
        if (!own || element.getClientRects().length === 0) continue;
        const style = getComputedStyle(element);
        const text = element.textContent.trim();
        const capitals = style.textTransform === "uppercase" || text === text.toUpperCase();
        if (Number.parseFloat(style.fontSize) < (capitals ? 11 : 12)) small.push(text);
      }
    };
    measure();
    await field.fill("audit");
    measure();

    expect(small).toEqual([]);
  });
});
