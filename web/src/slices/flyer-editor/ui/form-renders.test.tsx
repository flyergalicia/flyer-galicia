import { Profiler, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { AmountsCard } from "./AmountsCard.tsx";
import { CompanyCard } from "./CompanyCard.tsx";
import { FileNameCard } from "./FileNameCard.tsx";
import { LegalCard } from "./LegalCard.tsx";
import { OfficersCard } from "./OfficersCard.tsx";

const NOTHING = () => undefined;

async function openCards() {
  const drawn = new Map<string, number>();
  const counted = (name: string, card: ReactNode) => (
    <Profiler
      id={name}
      onRender={() => {
        drawn.set(name, (drawn.get(name) ?? 0) + 1);
      }}
    >
      {card}
    </Profiler>
  );
  const opened = await openWithForm(
    <>
      {counted(
        "company",
        <CompanyCard isCategoryTab={false} onChoose={NOTHING} onOpenDatabase={NOTHING} />,
      )}
      {counted("officers", <OfficersCard />)}
      {counted("amounts", <AmountsCard />)}
      {counted("legal", <LegalCard />)}
      {counted("name", <FileNameCard />)}
    </>,
    {
      files: {
        "_active9.json": { imageUrl: paintedFlyer([]), cfg: {} },
        "_legal9.json": { text: "Legal" },
      },
    },
  );
  await opened.workspace().selectOption(9, false);
  await expect.element(opened.screen.getByTestId("legal-text")).toHaveValue("Legal");
  // What was still arriving has arrived: the count starts here.
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  drawn.clear();
  return { ...opened, drawn };
}

describe("writing in the form", () => {
  it("the company draws again its card and the name of the file, not the others", async () => {
    const { screen, drawn } = await openCards();
    await screen.getByPlaceholder("Nombre de la empresa").fill("ACME");
    await vi.waitFor(() => {
      expect(drawn.get("name")).toBeGreaterThan(0);
    });
    expect(drawn.get("company")).toBeGreaterThan(0);
    expect(drawn.has("officers")).toBe(false);
    expect(drawn.has("amounts")).toBe(false);
    expect(drawn.has("legal")).toBe(false);
  });

  it("an officer draws again only its own card", async () => {
    const { screen, drawn } = await openCards();
    await screen.getByTestId("officer-block-1").getByLabelText("Celular").fill("11 4444 5555");
    await vi.waitFor(() => {
      expect(drawn.get("officers")).toBeGreaterThan(0);
    });
    expect([...drawn.keys()]).toEqual(["officers"]);
  });

  it("the legal text draws again only its own card", async () => {
    const { screen, drawn } = await openCards();
    await screen.getByTestId("legal-text").fill("Otro legal");
    await vi.waitFor(() => {
      expect(drawn.get("legal")).toBeGreaterThan(0);
    });
    expect([...drawn.keys()]).toEqual(["legal"]);
  });
});
