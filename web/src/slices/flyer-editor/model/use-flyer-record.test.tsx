import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { FlyerWorkspaceProvider } from "@/shared/lib/flyer-workspace/index.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { FlyerFormProvider } from "../ui/FlyerFormProvider.tsx";
import { useHistoryItems } from "./history-context.ts";
import { useFlyerRecord } from "./use-flyer-record.ts";

function Recorder({ onOut }: { readonly onOut?: () => void }) {
  const record = useFlyerRecord(onOut);
  const items = useHistoryItems();
  const session = useSession();
  return (
    <>
      <span data-testid="count">{String(items.length)}</span>
      <span data-testid="status">{session.status}</span>
      <button
        type="button"
        onClick={() => {
          record({
            values: { empresa: "ACME SA" },
            fileName: "Flyer ACME SA",
            canvas: document.createElement("canvas"),
            format: "png",
          });
        }}
      >
        Salió
      </button>
    </>
  );
}

async function open(withSession: boolean, onOut?: () => void) {
  const harness = createAppHarness();
  if (withSession) harness.storeSession();
  const screen = await render(
    harness.wrap(
      <FlyerWorkspaceProvider>
        <FlyerFormProvider>
          <Recorder {...(onOut ? { onOut } : {})} />
        </FlyerFormProvider>
      </FlyerWorkspaceProvider>,
    ),
  );
  return { harness, screen };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what a file that came out leaves", () => {
  it("in the history, in the log and to whoever waits for it", async () => {
    const onOut = vi.fn<() => void>();
    const { harness, screen } = await open(true, onOut);
    await expect.element(screen.getByTestId("status")).toHaveTextContent("signed-in");
    await screen.getByRole("button").click();
    await expect.element(screen.getByTestId("count")).toHaveTextContent("1");
    expect(onOut).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toHaveLength(1);
    });
    const [log] = harness.network.to("/rest/v1/flyer_logs", "POST");
    expect(log?.body).toMatchObject({ empresa: "ACME SA", format: "png" });
    expect(String(Reflect.get(Object(log?.body), "flyer_type"))).toContain('"opcion":null');
  });

  it("with nobody in the session there is no log", async () => {
    const { harness, screen } = await open(false);
    await expect.element(screen.getByTestId("status")).toHaveTextContent("signed-out");
    await screen.getByRole("button").click();
    await expect.element(screen.getByTestId("count")).toHaveTextContent("1");
    expect(harness.network.to("/rest/v1/flyer_logs", "POST")).toEqual([]);
  });
});
