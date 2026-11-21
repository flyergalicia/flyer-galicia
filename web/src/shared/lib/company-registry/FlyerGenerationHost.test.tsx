import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ADVISOR, createAppHarness, type AppAnswers } from "@/shared/lib/testing/app-harness.tsx";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { FlyerGenerationHost } from "./FlyerGenerationHost.tsx";
import {
  type FlyerGenerationPort,
  useAttachFlyerGeneration,
  useFlyerGeneration,
} from "./flyer-generation-port.ts";

const FILES = {
  "_opciones.json": {
    opts: [
      { n: 9, nombre: "Con flyer" },
      { n: 10, nombre: "Sin flyer" },
      { n: 11, nombre: "No se puede preguntar" },
      { n: 12, nombre: "No es de esta persona" },
    ],
  },
  "_facultades.json": {
    roles: {
      asesor: { opcion_1: false, opcion_9: true, opcion_10: true, opcion_11: true },
      hunter: { opcion_9: true },
    },
  },
  "_active9.json": { imageUrl: "https://x/nueve.jpg" },
  "_active10.json": { imageUrl: null },
  "_active12.json": { imageUrl: "https://x/doce.jpg" },
};

interface StageProps {
  readonly checkAfterMs?: number;
  readonly onPort: (port: FlyerGenerationPort | null) => void;
  readonly works?: FlyerGenerationPort;
  readonly onNeedEditor?: () => void;
}

function Reader({ onPort, works }: Pick<StageProps, "onPort" | "works">) {
  onPort(useFlyerGeneration());
  return works ? <Attach works={works} /> : <span>abierto</span>;
}

function Attach({ works }: { readonly works: FlyerGenerationPort }) {
  useAttachFlyerGeneration(works);
  return <span>abierto</span>;
}

const NOBODY = () => undefined;

function Stage({ checkAfterMs, onPort, works, onNeedEditor = NOBODY }: StageProps) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <FlyerGenerationHost
      onNeedEditor={onNeedEditor}
      {...(checkAfterMs === undefined ? {} : { checkAfterMs })}
    >
      <Reader onPort={onPort} {...(works ? { works } : {})} />
    </FlyerGenerationHost>
  );
}

async function open(
  answers: AppAnswers = {},
  stage: Pick<StageProps, "checkAfterMs" | "works" | "onNeedEditor"> = { checkAfterMs: 1 },
) {
  const harness = createAppHarness({
    profile: ADVISOR,
    files: FILES,
    droppedFiles: ["_active11.json"],
    ...answers,
  });
  harness.storeSession();
  const seen: { port: FlyerGenerationPort | null } = { port: null };
  await render(
    harness.wrap(
      <Stage
        onPort={(read) => {
          seen.port = read;
        }}
        {...stage}
      />,
    ),
  );
  await expect.element(page.getByText("abierto")).toBeVisible();
  return { harness, seen };
}

function askedFiles(harness: ReturnType<typeof createAppHarness>): string[] {
  return harness.network.requests
    .map(({ path }) => path.split("/").at(-1) ?? "")
    .filter((file) => file.startsWith("_active"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the host of the generation", () => {
  it("finds out which options of this person have a flyer, and writes down only firm answers", async () => {
    const { seen } = await open();
    await vi.waitFor(() => {
      expect(seen.port?.hasFlyer(9)).toBe(true);
      expect(seen.port?.hasFlyer(10)).toBe(false);
    });
    expect(seen.port?.hasFlyer(11), "could not be asked: nobody knows").toBeUndefined();
    const probes: unknown = Reflect.get(window, "__flyerProbe");
    const read: unknown = Reflect.get(Object(probes), "flyerKnowledge");
    expect(typeof read === "function" ? read() : null).toMatchObject({
      done: true,
      failed: true,
      hasFlyer: { "9": true, "10": false },
    });
  });

  it("does not ask for what this person cannot use", async () => {
    const { harness, seen } = await open();
    await vi.waitFor(() => {
      expect(seen.port?.hasFlyer(9)).toBe(true);
    });
    expect(askedFiles(harness)).not.toContain("_active12.json");
    expect(seen.port?.hasFlyer(12)).toBeUndefined();
  });

  it("does not ask what the editor already knows", async () => {
    const works: FlyerGenerationPort = {
      hasFlyer: (option) => (option === 9 ? true : undefined),
      isGenerating: () => false,
      generate: () => Promise.resolve(),
    };
    const { harness, seen } = await open({}, { checkAfterMs: 1, works });
    await vi.waitFor(() => {
      expect(seen.port?.hasFlyer(10)).toBe(false);
    });
    expect(askedFiles(harness)).not.toContain("_active9.json");
  });

  it("the Hunter asks for them on its own screen", async () => {
    const { harness } = await open({ profile: { ...ADVISOR, role: "hunter" } });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(askedFiles(harness)).toEqual([]);
  });

  it("waits a while after entering: the start of the app has other things to do", async () => {
    const { harness } = await open({}, {});
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(askedFiles(harness)).toEqual([]);
  });

  it("with no editor on the page, generating brings it", async () => {
    const onNeedEditor = vi.fn<() => void>();
    const { seen } = await open({}, { onNeedEditor });
    void seen.port?.generate({ companies: [], format: "pdf", onProgress: () => undefined });
    expect(onNeedEditor).toHaveBeenCalledTimes(1);
  });

  it("an editor that is not under a host has nobody to tell, and nothing breaks", async () => {
    const works: FlyerGenerationPort = {
      hasFlyer: () => undefined,
      isGenerating: () => false,
      generate: () => Promise.resolve(),
    };
    await render(<Attach works={works} />);
    await expect.element(page.getByText("abierto")).toBeVisible();
  });
});
