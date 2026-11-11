import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { BackendProvider, createQueryClient } from "@/shared/supabase/index.ts";
import { createInventedBackend } from "@/shared/supabase/testing/invented-backend.ts";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { useFlyerOptions } from "./flyer-options-query.ts";
import { usePendingAccounts } from "./pending-accounts-query.ts";
import { useSaveScreenTitles, useScreenTitles } from "./screen-titles-query.ts";

const failing: Answer = () => {
  throw new TypeError("Failed to fetch");
};

function open(answer: Answer, children: ReactNode) {
  const invented = createInventedBackend(answer);
  return {
    network: invented.network,
    tree: render(
      <BackendProvider backend={invented.backend}>
        <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
      </BackendProvider>,
    ),
  };
}

function Options({ enabled }: { readonly enabled?: boolean }) {
  const { options, settled, failed } = useFlyerOptions(enabled);
  return (
    <>
      <output data-testid="numbers">{options.map(({ n }) => n).join()}</output>
      <output data-testid="settled">{String(settled)}</output>
      <output data-testid="failed">{String(failed)}</output>
    </>
  );
}

describe("the list of flyers", () => {
  it("comes from its file", async () => {
    const { tree } = open(() => jsonResponse({ opts: [{ n: 1 }, { n: 9 }] }), <Options />);
    const screen = await tree;

    await expect.element(screen.getByTestId("numbers")).toHaveTextContent("1,9");
    await expect.element(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("without the file is the three of always", async () => {
    const { tree } = open(() => jsonResponse({}, 404), <Options />);
    const screen = await tree;

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("numbers")).toHaveTextContent("1,2,3");
    await expect.element(screen.getByTestId("failed")).toHaveTextContent("false");
  });

  it("a failure of the network is told apart", async () => {
    const { tree } = open(failing, <Options />);
    const screen = await tree;

    await expect.element(screen.getByTestId("failed")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("numbers")).toHaveTextContent("1,2,3");
  });

  it("is not asked until it is needed", async () => {
    const { tree, network } = open(failing, <Options enabled={false} />);
    const screen = await tree;

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("false");
    expect(network.requests).toEqual([]);
  });
});

function Titles({ enabled }: { readonly enabled?: boolean }) {
  const { titles, settled } = useScreenTitles(enabled);
  const save = useSaveScreenTitles();
  return (
    <>
      <output data-testid="order">{titles.order?.join() ?? "none"}</output>
      <output data-testid="settled">{String(settled)}</output>
      <button
        type="button"
        onClick={() => {
          void save({ names: {}, order: ["promos"] }).then((result) => {
            document.body.dataset.savedOk = String(result.ok);
          });
        }}
      >
        guardar
      </button>
    </>
  );
}

describe("the names of the screens", () => {
  it("come from their file", async () => {
    const { tree } = open(() => jsonResponse({ orden: ["promos", "flyer"] }), <Titles />);
    const screen = await tree;

    await expect.element(screen.getByTestId("order")).toHaveTextContent("promos,flyer");
  });

  it("without the file there are none", async () => {
    const { tree } = open(() => jsonResponse({}, 404), <Titles />);
    const screen = await tree;

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("order")).toHaveTextContent("none");
  });

  it("a failure of the network leaves the ones of the app", async () => {
    const { tree } = open(failing, <Titles />);
    const screen = await tree;

    await expect.element(screen.getByTestId("settled")).toHaveTextContent("true");
    await expect.element(screen.getByTestId("order")).toHaveTextContent("none");
  });

  it("saving writes the file and everybody here reads the new one", async () => {
    const { tree, network } = open(
      ({ method }) => (method === "POST" ? jsonResponse({ Key: "x" }) : jsonResponse({})),
      <Titles enabled />,
    );
    const screen = await tree;

    await screen.getByRole("button", { name: "guardar" }).click();

    await expect.element(screen.getByTestId("order")).toHaveTextContent("promos");
    expect(network.to("/storage/v1/object/flyers/_titulos.json", "POST")).toHaveLength(1);
  });

  it("saving can fail, and it says so", async () => {
    delete document.body.dataset.savedOk;
    const { tree } = open(
      ({ method }) => (method === "POST" ? jsonResponse({ message: "no" }, 500) : jsonResponse({})),
      <Titles />,
    );
    const screen = await tree;

    await screen.getByRole("button", { name: "guardar" }).click();

    await expect.poll(() => document.body.dataset.savedOk).toBe("false");
  });
});

function Pending() {
  const pending = usePendingAccounts();
  return <output data-testid="pending">{pending}</output>;
}

describe("the accounts that wait", () => {
  it("are counted without reading them", async () => {
    const { tree, network } = open(
      () => new Response(null, { status: 200, headers: { "Content-Range": "*/4" } }),
      <Pending />,
    );
    const screen = await tree;

    await expect.element(screen.getByTestId("pending")).toHaveTextContent("4");
    const [asked] = network.to("/rest/v1/profiles", "HEAD");
    expect(asked?.query.get("status")).toBe("in.(pending,reset_pending)");
  });

  it("without an answer there are none", async () => {
    const { tree } = open(() => new Response(null, { status: 200 }), <Pending />);
    const screen = await tree;

    await expect.element(screen.getByTestId("pending")).toHaveTextContent("0");
  });
});
