// What goes wrong with the library of the PDF: it cannot be left to what a whole screen does.
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type Company, sanitizeCompanies } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { FlyerWorkspaceProvider } from "@/shared/lib/flyer-workspace/index.ts";
import type { LibraryLoader } from "@/shared/lib/library-loader.ts";
import { hunterHarness } from "../testing/hunter-on-screen.tsx";
import type { HunterFlyerRules } from "./company-flyer-rules.ts";
import { useCompanyPreview } from "./use-company-preview.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";

const RULES: HunterFlyerRules = {
  options: sanitizeFlyerOptions([{ n: 9, nombre: "Combustible", solapa: "flyer" }]),
  cashbackNames: ["BAU"],
  can: () => true,
  tabLabel: () => "Flyer",
  hasFlyer: () => true,
};
function acme(): Company {
  const [company] = sanitizeCompanies([{ empresa: "ACME SA", config: "BAU", user_id: "o1" }]);
  if (!company) throw new Error("It should be a company");
  return company;
}

const NOTHING = () => undefined;

function Buttons({ library }: { readonly library: LibraryLoader<unknown> }) {
  const { state, choose, download } = useCompanyPreview({
    rules: RULES,
    noteHasNoFlyer: NOTHING,
    onNewFlyer: NOTHING,
    library,
  });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          choose(acme());
        }}
      >
        Elegir
      </button>
      <button type="button" disabled={state.kind !== "shown"} onClick={() => void download()}>
        Bajar
      </button>
    </>
  );
}

function Inside({ library }: { readonly library: LibraryLoader<unknown> }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <FlyerWorkspaceProvider>
      <Buttons library={library} />
    </FlyerWorkspaceProvider>
  );
}

async function open(library: LibraryLoader<unknown>) {
  const { harness } = hunterHarness();
  await render(harness.wrap(<Inside library={library} />));
  await page.getByRole("button", { name: "Elegir" }).click();
  const download = page.getByRole("button", { name: "Bajar" });
  await expect.element(download).toBeEnabled();
  return { harness, download };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the library of the PDF", () => {
  it("that does not come says so, without naming it, and it can be tried again", async () => {
    const load = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("Sin red"));
    const { harness, download } = await open({ isReady: () => false, load });
    await download.click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo preparar el PDF. Revisá la conexión y probá de nuevo.");
    expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(0);

    await download.click();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("on its way says it is being prepared", async () => {
    const pending = new Promise(NOTHING);
    const { download } = await open({ isReady: () => false, load: () => pending });
    await download.click();
    await expect.element(page.getByRole("status")).toHaveTextContent("Preparando el PDF…");
  });
});
