import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import type { LibraryLoader } from "@/shared/lib/library-loader.ts";
import { deferred } from "@/shared/supabase/testing/recording-fetch.ts";
import {
  downloadPromotionsSheet,
  type ExcelLibrary,
  type SheetRequest,
} from "./promotions-sheet.ts";

function request(
  library: LibraryLoader<ExcelLibrary>,
  notice: (text: string) => void,
): SheetRequest {
  return {
    library,
    rows: [],
    isActiveTab: false,
    province: "",
    logoSource: () => "",
    notice,
    setBusy: () => undefined,
  };
}

describe("while the library of the Excel comes down", () => {
  it("says so, and if it does not arrive it says what to do", async () => {
    const notice = vi.fn<(text: string) => void>();
    const library: LibraryLoader<ExcelLibrary> = {
      isReady: () => false,
      load: () => Promise.reject(new Error("Sin red")),
    };

    await downloadPromotionsSheet(request(library, notice));

    expect(notice).toHaveBeenNthCalledWith(1, "Preparando el Excel…");
    expect(notice).toHaveBeenNthCalledWith(
      2,
      "No se pudo preparar el Excel. Revisá la conexión y probá de nuevo.",
    );
  });

  it("a second press does not ask for another sheet", async () => {
    const arrival = deferred<ExcelLibrary>();
    const load = vi.fn<() => Promise<ExcelLibrary>>(() => arrival.promise);
    const notice = vi.fn<(text: string) => void>();
    const library: LibraryLoader<ExcelLibrary> = { isReady: () => false, load };

    const first = downloadPromotionsSheet(request(library, notice));
    await downloadPromotionsSheet(request(library, notice));

    expect(load).toHaveBeenCalledOnce();
    arrival.resolve(ExcelJS);
    await first;
    expect(notice).toHaveBeenLastCalledWith("No hay filas para exportar con el filtro actual");
  });

  it("once it is there it says nothing about it", async () => {
    const notice = vi.fn<(text: string) => void>();
    const library: LibraryLoader<ExcelLibrary> = {
      isReady: () => true,
      load: () => Promise.resolve(ExcelJS),
    };

    await downloadPromotionsSheet(request(library, notice));

    expect(notice).not.toHaveBeenCalledWith("Preparando el Excel…");
  });
});
