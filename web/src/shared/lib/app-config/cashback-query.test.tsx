import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useSession } from "@/shared/session/index.ts";
import { type AppAnswers, createAppHarness } from "../testing/app-harness.tsx";
import { useCashbackConfigs } from "./cashback-query.ts";

function Reader() {
  const { names, configs, settled } = useCashbackConfigs();
  return (
    <div data-testid="cashback">
      {`${String(settled)} ${names.join(",")} ${String(configs.length)}`}
    </div>
  );
}

/** Only with a session, as in the app: entering clears what was read before. */
function Inside() {
  const session = useSession();
  return session.status === "signed-in" ? <Reader /> : null;
}

function open(answers: AppAnswers) {
  const harness = createAppHarness(answers);
  harness.storeSession();
  void render(harness.wrap(<Inside />));
  return page.getByTestId("cashback");
}

const ALWAYS = "BAU,Config 1,Config 2,Config 3,Config 4 5";

afterEach(() => {
  localStorage.clear();
});

describe("the configurations of cashback", () => {
  it("come from the file", async () => {
    const reader = open({
      files: { "_cashback.json": { configs: [{ nombre: "Base" }, { nombre: "Otra" }] } },
    });

    await expect.element(reader).toHaveTextContent("true Base,Otra 2");
  });

  it("without the file, the ones of always", async () => {
    const reader = open({});

    await expect.element(reader).toHaveTextContent(`true ${ALWAYS}`);
  });

  it("if the file cannot be read, also the ones of always, and it settles", async () => {
    const reader = open({ droppedFiles: ["_cashback.json"] });

    await expect.element(reader).toHaveTextContent(`true ${ALWAYS}`);
  });
});
