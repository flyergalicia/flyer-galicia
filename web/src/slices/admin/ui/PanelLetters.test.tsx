// Nothing in the panel goes below the minimum letter: 12 px, or 11 px in capitals (invariant 15),
// sheet by sheet. The spec of the shell looks only at the sheet the panel opens on.
// The sizes are tokens: without them every letter would take the size of the page.
import "@/shared/ui/tokens/tokens.css";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { FIRST_PLACE, PILLARS, rememberPlace, SHEETS } from "../model/panel.ts";
import { bucketStore, openConfigSheet } from "../testing/config-cloud.ts";

const SMALLEST_TEXT_PX = 12;
const SMALLEST_LABEL_PX = 11;

/** Each sheet, with the pillar it is on, in the order a person goes through them. */
const STEPS = PILLARS.flatMap(([pillar, pillarName]) =>
  SHEETS[pillar].map(([sheet, name]) => ({ pillarName, sheet, name })),
);

interface SmallText {
  readonly text: string;
  readonly size: number;
  readonly minimum: number;
}

/** Every text that can be seen, with its size and the minimum it has to keep. */
function smallTexts(root: Element): SmallText[] {
  const found: SmallText[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    const element = node.parentElement;
    if (text.length < 2 || !element || !/[A-Za-z0-9]/.test(text)) continue;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (box.width === 0 || box.height === 0 || style.visibility === "hidden") continue;
    const upperCase = style.textTransform === "uppercase" || text === text.toUpperCase();
    const size = Number.parseFloat(style.fontSize);
    const minimum = upperCase ? SMALLEST_LABEL_PX : SMALLEST_TEXT_PX;
    if (size < minimum) found.push({ text: text.slice(0, 40), size, minimum });
  }
  return found;
}

const panel = () => page.getByTestId("admin-panel");

/** The sheet shows what it read: no row of a skeleton nor «Cargando...» is left. */
async function settled(): Promise<void> {
  await expect
    .poll(
      () => {
        const root = panel().element();
        return (
          root.querySelectorAll('[class*="skeleton"]').length +
          (/Cargando/.test(root.textContent) ? 1 : 0)
        );
      },
      { timeout: 8000 },
    )
    .toBe(0);
}

/** One sheet after the other, as a person goes, keeping what is too small on each. */
async function visit(index: number, offenders: readonly string[]): Promise<readonly string[]> {
  const step = STEPS[index];
  if (!step) return offenders;
  const { pillarName, sheet, name } = step;
  await panel().getByRole("tab", { name: pillarName, exact: true }).click();
  await panel()
    .getByRole("tablist", { name: `Hojas de ${pillarName}` })
    .getByRole("tab", { name, exact: true })
    .click();
  await expect
    .poll(() => panel().element().querySelector(`[data-sheet="${sheet}"]`))
    .not.toBeNull();
  await settled();
  const found = smallTexts(panel().element()).map(
    ({ text, size, minimum }) => `${sheet}: "${text}" ${String(size)}px < ${String(minimum)}px`,
  );
  return visit(index + 1, [...offenders, ...found]);
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
});

describe("the letters of the panel", () => {
  it("no sheet has a letter below the minimum", async () => {
    await page.viewport(1366, 800);
    await openConfigSheet(
      "dashboard",
      "admin-panel",
      bucketStore({
        "_cashback.json": { configs: [{ nombre: "BAU", m1: "$1", m2: "$2", m3: "$3", m4: "$4" }] },
        "_legal.json": { text: "Legal." },
        "_vigilar.json": {
          opciones: { "9": [{ m: "Marca", t: "Otra", img: "x.png", origen: "estudio" }] },
        },
        "_active9.json": { name: "flyer_1_op9.jpg", imageUrl: "https://cubo/flyer_1_op9.jpg" },
      }),
      {
        accounts: [
          {
            id: "a",
            full_name: "Ana Inventada",
            email_asesor: "ana@x.com",
            status: "active",
            role: "asesor",
          },
          { id: "b", full_name: "Beto Inventado", email_asesor: "beto@x.com", status: "pending" },
        ],
        catalog: [{ id: 1, titulo: "Otra", imagen: "x.png", fecha_hasta: "2099-01-01" }],
      },
    );
    const offenders = await visit(0, []);
    expect(STEPS).toHaveLength(15);
    expect(offenders).toEqual([]);
  });
});
