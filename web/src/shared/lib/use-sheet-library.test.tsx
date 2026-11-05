import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { deferred } from "@/shared/supabase/testing/recording-fetch.ts";
import type { LibraryLoader } from "./library-loader.ts";
import type { SheetApi } from "./sheet-library.ts";
import { ToastProvider } from "./toast/ToastProvider.tsx";
import { useSheetLibrary } from "./use-sheet-library.ts";

const API: SheetApi = {
  read: vi.fn<SheetApi["read"]>(),
  writeFile: vi.fn<SheetApi["writeFile"]>(),
  utils: {
    book_new: vi.fn<SheetApi["utils"]["book_new"]>(),
    book_append_sheet: vi.fn<SheetApi["utils"]["book_append_sheet"]>(),
    aoa_to_sheet: vi.fn<SheetApi["utils"]["aoa_to_sheet"]>(),
    json_to_sheet: vi.fn<SheetApi["utils"]["json_to_sheet"]>(),
    sheet_to_json: vi.fn<SheetApi["utils"]["sheet_to_json"]>(),
  },
};

function Host({
  library,
  work,
  onDone,
}: {
  readonly library: LibraryLoader<SheetApi>;
  readonly work: (api: SheetApi) => void | Promise<void>;
  readonly onDone: (ran: boolean) => void;
}) {
  const withLibrary = useSheetLibrary(library);
  return (
    <button
      type="button"
      onClick={() => {
        void withLibrary(work).then(onDone);
      }}
    >
      Descargar
    </button>
  );
}

function open(library: LibraryLoader<SheetApi>, work: (api: SheetApi) => void | Promise<void>) {
  const onDone = vi.fn<(ran: boolean) => void>();
  void render(
    <ToastProvider>
      <Host library={library} work={work} onDone={onDone} />
    </ToastProvider>,
  );
  return onDone;
}

const press = () => page.getByRole("button", { name: "Descargar" }).click();
const notice = () => page.getByRole("status");

describe("a button that needs the library of the sheets", () => {
  it("when it is there, it says nothing and does its work", async () => {
    const work = vi.fn<(api: SheetApi) => void>();
    const onDone = open({ isReady: () => true, load: () => Promise.resolve(API) }, work);

    await press();

    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(true);
    });
    expect(work).toHaveBeenCalledWith(API);
    await expect.element(notice()).toHaveTextContent("");
  });

  it("while it comes down it says so, and a second press does not ask again", async () => {
    const arrival = deferred<SheetApi>();
    const load = vi.fn<() => Promise<SheetApi>>(() => arrival.promise);
    const work = vi.fn<(api: SheetApi) => void>();
    const onDone = open({ isReady: () => false, load }, work);

    await press();
    await expect.element(notice()).toHaveTextContent("Preparando el Excel…");
    await press();
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(false);
    });
    expect(load).toHaveBeenCalledOnce();

    arrival.resolve(API);
    await vi.waitFor(() => {
      expect(work).toHaveBeenCalledOnce();
    });
  });

  it("if it does not arrive it says what to do, and it can be tried again", async () => {
    const onDone = open(
      { isReady: () => false, load: () => Promise.reject(new Error("Sin red")) },
      () => undefined,
    );

    await press();

    await expect
      .element(notice())
      .toHaveTextContent("No se pudo preparar el Excel. Revisá la conexión y probá de nuevo.");
    expect(onDone).toHaveBeenCalledWith(false);
    await press();
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(2);
    });
  });

  it("if its work fails, it says so", async () => {
    const onDone = open({ isReady: () => true, load: () => Promise.resolve(API) }, () => {
      throw new Error("falla");
    });

    await press();

    await expect.element(notice()).toHaveTextContent("Algo salió mal. Probá de nuevo.");
    expect(onDone).toHaveBeenCalledWith(false);
  });
});
