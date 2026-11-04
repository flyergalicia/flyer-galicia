import { readFile } from "node:fs/promises";
import { type Page } from "@playwright/test";
import {
  type CompanyCategory,
  type CompanyOfficer,
  type CompanyRecord,
  type CompanyRegistryDriver,
  type FlyerGeneration,
} from "../company-registry.ts";
import { readCapturedZip, startCapturingZips, stopCapturingZips } from "./zip-capture.ts";

const LOAD_TIMEOUT_MS = 8_000;
const DIALOG_TIMEOUT_MS = 4_000;
const SETTLE_MS = 300;
const GENERATION_TIMEOUT_MS = 20_000;
const AFTER_GENERATION_MS = 800;
const OUTCOME_SELECTOR = "#pad-upd";
const CONFIRM_BUTTON = "#fg-cf-ok";

function legacyOfficer({ name, phone, email }: CompanyOfficer): LegacyCompanyOfficer {
  return { nombre: name, celular: phone ?? "", email: email ?? "" };
}

function legacyCategory(category: CompanyCategory): LegacyCompanyCategory {
  const { option, name, cap, secondCap } = category;
  return {
    ...(option === undefined ? {} : { opcion: option }),
    ...(name === undefined ? {} : { txt: name }),
    ...(cap === undefined ? {} : { importe: cap }),
    ...(secondCap === undefined ? {} : { importe2: secondCap }),
  };
}

function legacyCompany(company: CompanyRecord): LegacyCompany {
  return {
    empresa: company.name,
    cuits: company.taxIds ?? [],
    config: company.cashback,
    asesores: (company.officers ?? []).map(legacyOfficer),
    rubro: legacyCategory(company.category ?? {}),
  };
}

const readCategory = ({
  importe,
  importe2,
  opcion,
  txt,
}: LegacyCompanyCategory): CompanyCategory => ({
  ...(opcion === undefined ? {} : { option: opcion }),
  ...(txt === undefined ? {} : { name: txt }),
  ...(importe === undefined ? {} : { cap: importe }),
  ...(importe2 === undefined ? {} : { secondCap: importe2 }),
});

async function waitForGenerationEnd(page: Page): Promise<void> {
  await page.waitForFunction(
    (outcome) => window.__fgCapturedZips.length > 0 || Boolean(document.querySelector(outcome)),
    OUTCOME_SELECTOR,
    { timeout: GENERATION_TIMEOUT_MS },
  );
  await page.waitForTimeout(AFTER_GENERATION_MS);
}

async function generateFlyers(page: Page, companies: CompanyRecord[]): Promise<FlyerGeneration> {
  await startCapturingZips(page);
  await page.evaluate((rows) => {
    _pgGenerarRows(rows, "pdf", { prog: "x1", fill: "x2", txt: "x3", btn: "x4" }, "Prueba");
  }, companies.map(legacyCompany));
  await page.locator(CONFIRM_BUTTON).click();
  await waitForGenerationEnd(page);
  const zip = await readCapturedZip(page);
  const screen = await page.evaluate(
    (outcome) => ({
      finalOption: _optN(_fgOpt),
      notice: document.querySelector<HTMLElement>(outcome)?.innerText ?? "",
      stillGenerating: _pgBusy,
    }),
    OUTCOME_SELECTOR,
  );
  await stopCapturingZips(page);
  return { ...zip, ...screen };
}

const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

function createCompanyLoading(page: Page) {
  return {
    forgetCompanies: () =>
      page.evaluate(() => {
        _padron = null;
        _padLoadErr = false;
        _padCargando = null;
        _padSupAt = 0;
        _padReintentoAt = 0;
      }),
    loadCompanies: () =>
      page.evaluate(() => {
        loadPadron(true);
      }),
    waitForConnectionProblem: async () => {
      await page.waitForFunction(() => _padLoadErr, null, { timeout: LOAD_TIMEOUT_MS });
      await sleep(page, SETTLE_MS);
    },
    waitForCompaniesLoaded: async (count: number) => {
      await page.waitForFunction((n) => !_padLoadErr && _padron?.length === n, count, {
        timeout: LOAD_TIMEOUT_MS,
      });
      await sleep(page, SETTLE_MS);
    },
    ownCompanyCount: () => page.evaluate(() => _padron?.length ?? 0),
    retryConnection: () =>
      page.evaluate(() => {
        _padReintentar();
      }),
  };
}

function createSearch(page: Page) {
  return {
    openSearch: async () => {
      await page.evaluate(() => {
        openPadronPop();
      });
      await sleep(page, SETTLE_MS);
    },
    closeSearch: () =>
      page.evaluate(() => {
        closePadronPop();
      }),
    waitForSearchResults: async (count: number) => {
      await page.waitForFunction(
        (n) => document.querySelectorAll("#pad-list .pad-item").length === n,
        count,
        { timeout: LOAD_TIMEOUT_MS },
      );
    },
    searchList: () =>
      page.evaluate(() => {
        return {
          text: document.querySelector<HTMLElement>("#pad-list")?.innerText ?? "",
          hasRetry: Boolean(document.querySelector("#pad-list button")),
          companies: [
            ...document.querySelectorAll<HTMLElement>("#pad-list .pad-item .pad-emp"),
          ].map((name) => name.innerText),
          ownerTags: [...document.querySelectorAll<HTMLElement>("#pad-list .pad-de")].map(
            (tag) => tag.innerText,
          ),
        };
      }),
    searchFor: async (text: string) => {
      await page.locator("#pad-q").fill(text);
      await sleep(page, SETTLE_MS);
    },
    retrySearch: () => page.locator("#pad-list button").click(),
    chooseFromSearch: async (name: string) => {
      await page.locator("#pad-list .pad-item", { hasText: name }).first().click();
      await sleep(page, SETTLE_MS);
    },
    searchOffered: () => page.locator("#fg-pad-btn").isVisible(),
    typeCompanyName: async (text: string) => {
      await page.evaluate(() => {
        _padReintentoAt = 0;
      });
      await page.locator("#empresa").fill(text);
    },
    suggestions: async () => {
      await sleep(page, SETTLE_MS);
      return page.evaluate(() => ({
        visible: Boolean(document.querySelector("#pad-sug")),
        count: _padSug.length,
        ownerTags: document.querySelectorAll("#pad-sug .pad-de").length,
      }));
    },
    closeSuggestions: () =>
      page.evaluate(() => {
        _padCloseSug();
      }),
    suggestedCompanies: async () => {
      await sleep(page, SETTLE_MS);
      return page.locator("#pad-sug .pad-item .pad-emp").allInnerTexts();
    },
    pressInCompanyField: (key: string) => page.locator("#empresa").press(key),
    companyNote: async () => {
      const note = page.locator("#fg-pad-note");
      return (await note.count()) > 0 && (await note.isVisible()) ? await note.innerText() : "";
    },
    fileNameField: () => page.locator("#filename").inputValue(),
  };
}

function createCompanyApplying(page: Page) {
  return {
    applyCompany: async (company: CompanyRecord) => {
      await page.evaluate((row) => {
        _padApply(row);
      }, legacyCompany(company));
      await sleep(page, 1_500);
    },
    applyOwnCompany: async (index: number) => {
      await page.evaluate((row) => {
        const company = _padron?.[row];
        if (company) _padApply(company);
      }, index);
      await sleep(page, 400);
    },
    applySubstituteCompany: async (index: number) => {
      await page.evaluate((row) => {
        if (!window.__fgNotices) {
          const original = window.showToast;
          window.showToast = (message) => {
            window.__fgNotices?.push(String(message));
            original(message);
          };
        }
        window.__fgNotices = [];
        const company = _padSuplencia[row];
        if (company) _padApply(company);
      }, index);
      await sleep(page, 400);
      return page.evaluate(() => window.__fgNotices ?? []);
    },
    destinationOption: (company: CompanyRecord) =>
      page.evaluate((row) => _pgOptDe(row), legacyCompany(company)),
    refreshSubstitutes: () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            _padSupCargar(true, resolve);
          }),
      ),
    reviewChangesAfterDownload: () =>
      page.evaluate(() => {
        _padAfterFlyer();
      }),
  };
}

function createUpdateDialog(page: Page) {
  return {
    waitForUpdateDialog: async () => {
      await page.locator(OUTCOME_SELECTOR).waitFor({ timeout: DIALOG_TIMEOUT_MS });
      return page.evaluate((dialog) => {
        const element = document.querySelector<HTMLElement>(dialog);
        return {
          title: element?.querySelector("h3")?.innerText ?? "",
          text: element?.innerText ?? "",
          asksForTaxId: Boolean(document.querySelector("#pad-cuit")),
        };
      }, OUTCOME_SELECTOR);
    },
    updateDialogIsOpen: async () => {
      await sleep(page, 500);
      return (await page.locator(OUTCOME_SELECTOR).count()) > 0;
    },
    acceptUpdateDialog: async () => {
      await page.locator(`${OUTCOME_SELECTOR} .pu-si`).click();
      await page
        .locator(OUTCOME_SELECTOR)
        .waitFor({ state: "detached", timeout: DIALOG_TIMEOUT_MS });
    },
    dismissUpdateDialog: () =>
      page.evaluate(() => {
        _padCloseUpdate(0);
      }),
    declineUpdateDialog: () => page.locator(`${OUTCOME_SELECTOR} .pu-no`).click(),
    clickOutsideUpdateDialog: () => page.mouse.click(4, 4),
    updateDialogLosses: () =>
      page.locator(OUTCOME_SELECTOR).evaluate((dialog) => {
        const red = dialog.querySelector(".pu-quita");
        return {
          redItems: Array.from(dialog.querySelectorAll(".pu-quita"), (item) => item.textContent),
          alert: dialog.querySelector(".pu-alerta")?.textContent ?? "",
          redColor: red ? getComputedStyle(red).color : "",
        };
      }),
    fillTaxIdInDialog: (text: string) => page.locator("#pad-cuit").fill(text),
    updateDialogTaxIdNote: async () => (await page.locator("#pad-cuit-prev").textContent()) ?? "",
    saveFlyerChanges: async (
      index: number,
      change: { cashback: string; officers: CompanyOfficer[] },
    ) => {
      const officers = change.officers.map(legacyOfficer);
      await page.evaluate(
        ({ row, config, asesores }) => {
          const company = _padron?.[row];
          _padPending = { row: company, empresa: company?.empresa, config, asesores, rubro: null };
          _padDoUpdate();
        },
        { row: index, config: change.cashback, asesores: officers },
      );
      await sleep(page, 800);
      return page.evaluate((row) => {
        const company = _padron?.[row];
        return { cashback: company?.config ?? "", firstOfficer: company?.asesores[0]?.nombre };
      }, index);
    },
  };
}

/** Runs in the page: the generator lives in a panel that may not be built yet. */
function showGeneratorHost(): void {
  let host = document.querySelector<HTMLElement>("#padron-gen");
  if (!host) {
    host = document.createElement("div");
    host.id = "padron-gen";
    document.body.append(host);
  }
  host.style.display = "block";
  _pgOpen = true;
}

function createGenerator(page: Page) {
  return {
    showGenerator: async () => {
      await page.evaluate(showGeneratorHost);
      await page.evaluate(() => {
        _pgRender();
      });
      await sleep(page, SETTLE_MS);
    },
    showGeneratorAndLoad: async () => {
      await page.evaluate(showGeneratorHost);
      await page.evaluate(() => {
        loadPadron(true, () => {
          _pgRender();
        });
      });
    },
    hideGenerator: () =>
      page.evaluate(() => {
        _pgOpen = false;
      }),
    generatorText: () =>
      page.evaluate(() => document.querySelector<HTMLElement>("#padron-gen")?.innerText ?? ""),
    generatorRowCount: () => page.locator("#pg-list .usr-row").count(),
    openGeneratorWith: async (companies: CompanyRecord[]) => {
      await page.evaluate(() => {
        _padEdit = null;
        const editor = document.querySelector<HTMLElement>("#padron-editor");
        if (editor) editor.style.display = "none";
        if (!_pgOpen) _pgToggle();
      });
      await sleep(page, 400);
      await page.evaluate((rows) => {
        _padron = _padSane(rows);
        _pgSel = {};
        _pgRender();
      }, companies.map(legacyCompany));
    },
    tickInGenerator: (rows: number[]) =>
      page.evaluate((ticked) => {
        const firstRow = document.querySelector("#pg-list .usr-row");
        for (const row of ticked) _pgSet(row, true);
        return {
          repainted: document.querySelector("#pg-list .usr-row") !== firstRow,
          counter: document.querySelector("#pg-count")?.textContent ?? "",
        };
      }, rows),
    filterGenerator: async (text: string) => {
      await page.evaluate((query) => {
        _pgFiltrar(query);
      }, text);
      await sleep(page, 50);
      return page.evaluate(() => _pgFiltrados().map((row) => _padron?.[row]?.empresa ?? ""));
    },
    generateFlyers: (companies: CompanyRecord[]) => generateFlyers(page, companies),
  };
}

const SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function encodeSheet(page: Page, lines: string[][]): Promise<Buffer> {
  const encoded = await page.evaluate(async (rows) => {
    await _lib("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Hoja1");
    return XLSX.write(book, { type: "base64", bookType: "xlsx" });
  }, lines);
  return Buffer.from(encoded, "base64");
}

async function readDownloadedSheet(page: Page, trigger: () => Promise<void>) {
  await page.evaluate(() => _lib("xlsx"));
  const [download] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const bytes = await readFile(await download.path());
  const cells = await page.evaluate((encoded) => {
    const book = XLSX.read(encoded, { type: "base64" });
    const sheet = book.Sheets[book.SheetNames[0] ?? ""];
    return sheet ? XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false }) : [];
  }, bytes.toString("base64"));
  const [head = [], ...rows] = cells;
  return { name: download.suggestedFilename(), head, rows };
}

function createDatabaseScreen(page: Page) {
  const tab = (label: string) => page.locator("#bd-tabs .stab", { hasText: label });
  return {
    closeRegistry: async () => {
      await page.evaluate(() => {
        closeMiPadron(true);
      });
    },
    databaseTabs: () => page.locator("#bd-tabs .stab:visible").allInnerTexts(),
    chooseDatabaseTab: async (label: string) => {
      await tab(label).click();
      await sleep(page, SETTLE_MS);
    },
    registryStatus: async () => (await page.locator("#padron-stat").textContent()) ?? "",
    uploadRegistrySheet: async (lines: string[][]) => {
      const buffer = await encodeSheet(page, lines);
      await page.setInputFiles("#padron-xls", { name: "e.xlsx", mimeType: SHEET_MIME, buffer });
      await sleep(page, SETTLE_MS);
    },
    dismissImport: () => page.locator("#pad-upd .pu-no").click(),
    downloadRegistrySheet: (kind: "companies" | "template") =>
      readDownloadedSheet(page, async () => {
        const label = kind === "companies" ? "Descargar Excel" : "Plantilla vacía";
        await page.locator("#at-varios button", { hasText: label }).click();
      }),
    templateName: async () => {
      await page.evaluate(() => {
        openMiPadron();
      });
      await sleep(page, SETTLE_MS);
      const { name } = await readDownloadedSheet(page, async () => {
        await page.locator("#at-varios button", { hasText: "Plantilla vacía" }).click();
      });
      await page.evaluate(() => {
        closeMiPadron(true);
      });
      return name;
    },
    openInlineEditor: async () => {
      await page.locator("#padron-edit-btn").click();
      await page.locator("#padron-edit-list").waitFor();
    },
    saveInlineEditor: async () => {
      await page.locator("#padron-editor .btn-submit").click();
      await page.locator("#padron-editor").waitFor({ state: "hidden" });
    },
    renameInEditor: async (row: number, name: string) => {
      await page
        .locator(`#padron-edit-list .pad-erow[data-i="${String(row)}"] input`)
        .first()
        .fill(name);
    },
    advisorsInDatabase: () =>
      page
        .locator("#asesores-list input")
        .evaluateAll((fields) =>
          fields.map((field) => (field instanceof HTMLInputElement ? field.value : "")),
        ),
    editAdvisorInDatabase: async (row: number, name: string) => {
      await page.locator("#asesores-list .as-erow").nth(row).locator("input").nth(1).fill(name);
    },
    saveAdvisorsInDatabase: () => page.locator("#asesores-save").click(),
    openOtherUsersCompanies: async () => {
      await page.locator('.stab[data-tab="padronotros"]').click();
      await sleep(page, SETTLE_MS);
    },
    otherUsersOffered: () =>
      page
        .locator("#po-user option")
        .evaluateAll((options) =>
          options.flatMap((option) =>
            option instanceof HTMLOptionElement && option.value ? [option.text] : [],
          ),
        ),
    chooseOtherUser: async (name: string) => {
      await page.locator("#po-user").selectOption({ label: name });
      await sleep(page, SETTLE_MS);
    },
    otherUserCompanies: () => page.locator("#po-list .usr-row .usr-name").allInnerTexts(),
    otherUserScreenHasEditing: async () =>
      (await page.locator("#at-padronotros .pad-erow, #at-padronotros input[type=file]").count()) >
      0,
  };
}

function createEditor(page: Page) {
  return {
    openRegistry: async () => {
      await page.evaluate(() => {
        openMiPadron();
      });
      await sleep(page, SETTLE_MS);
    },
    offerCurrentFlyerAsCategory: (kind?: string) =>
      page.evaluate((rubro) => {
        const option = _FG_OPTS[0] ?? 0;
        window._padRubroOpts = () => [option];
        window._optVigente = (candidate) => candidate;
        if (rubro) _OPC[_optN(option)] = { ..._OPC[_optN(option)], rubro };
        _padEditRenderList();
        return option;
      }, kind),
    openEditorWith: (companies: CompanyRecord[]) =>
      page.evaluate((rows) => {
        _padEdit = _padSane(rows).map((row) => _padCloneRow(row));
        _padEditAsOpen = {};
        _padEditQ = "";
        const editor = document.querySelector<HTMLElement>("#padron-editor");
        if (editor) editor.style.display = "block";
        _padEditRenderShell();
        _padEditRenderList();
      }, companies.map(legacyCompany)),
    filterEditor: (text: string) =>
      page.evaluate((query) => {
        _padEditFilter(query);
      }, text),
    chooseCategoryFlyer: (row: number) =>
      page.evaluate((index) => {
        _padEditRubro(index, "opcion", String(_padEditOpciones().rub[0]));
      }, row),
    capFields: (row: number) =>
      page.evaluate((index) => {
        const line = document.querySelector(`#padron-edit-list .pad-erow[data-i="${index}"]`);
        if (!line) return null;
        return [...line.querySelectorAll<HTMLInputElement>(".pad-tope")].map((field) => ({
          placeholder: field.placeholder,
          value: field.value,
          disabled: field.disabled,
        }));
      }, row),
    writeCaps: (row: number, caps: string[]) =>
      page.evaluate(
        ({ index, values }) => {
          const fields = document.querySelectorAll<HTMLInputElement>(
            `#padron-edit-list .pad-erow[data-i="${index}"] .pad-tope`,
          );
          for (const [position, value] of values.entries()) {
            const field = fields[position];
            if (field) field.value = value;
          }
          _padEditRubro(index, "topes");
        },
        { index: row, values: caps },
      ),
    editorCategory: async (row: number) =>
      readCategory(await page.evaluate((index) => _padEdit?.[index]?.rubro ?? {}, row)),
    expandOfficers: (rows: number[]) =>
      page.evaluate((expanded) => {
        _padEditAsOpen = Object.fromEntries(expanded.map((row) => [row, true]));
        _padEditRenderList();
      }, rows),
    expandedCompanies: () =>
      page.evaluate(() =>
        Object.keys(_padEditAsOpen)
          .map(Number)
          .filter((row) => _padEditAsOpen[row])
          .map((row) => _padEdit?.[row]?.empresa ?? ""),
      ),
    officerFieldsShown: () => page.locator("#padron-edit-list .pad-eas-row").count(),
    removeFromEditor: async (row: number) => {
      await page.evaluate((index) => {
        _padEditRemoveRow(index);
      }, row);
      await page.locator(CONFIRM_BUTTON).click();
    },
  };
}

function createSheets(page: Page) {
  return {
    sheetColumns: () => page.evaluate(() => _PAD_HEAD),
    exportAndReadBack: (companies: CompanyRecord[]) =>
      page.evaluate((rows) => {
        const lines = _padToAoa(_padSane(rows));
        const [head = [], ...body] = lines;
        const cells = body.map((line) =>
          ["rubro", "tope_combustible", "tope_supermercado"].map(
            (column) => line[head.indexOf(column)] ?? "",
          ),
        );
        const unchanged = body.map((line, position) => {
          const read = _padRow(Object.fromEntries(head.map((key, at) => [key, line[at]])));
          const before = _padRubroSane(rows[position]?.rubro);
          const after = read.rubro;
          return (
            before.importe === after?.importe &&
            before.importe2 === after?.importe2 &&
            before.txt === after?.txt
          );
        });
        return { cells, unchanged };
      }, companies.map(legacyCompany)),
    capsOfSheetRow: async (cells: Record<string, string>) =>
      readCategory(await page.evaluate((row) => _padRow(row).rubro ?? {}, cells)),
    validateSheet: (rows: { cells: Record<string, string>; readerRow?: number }[]) =>
      page.evaluate((sheet) => {
        const raw = sheet.map(({ cells, readerRow }) => {
          const row = { ...cells };
          if (readerRow !== undefined) {
            Object.defineProperty(row, "__rowNum__", { value: readerRow, enumerable: false });
          }
          return row;
        });
        const validation = _padValidate(raw);
        return {
          firstCompanyCap: validation.rows[0]?.rubro.importe ?? "",
          problems: validation.problemas.map(({ txt }) => txt),
        };
      }, rows),
  };
}

function createProposals(page: Page) {
  return {
    pendingProposals: async () => {
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            _propCargarPendientes(resolve);
          }),
      );
      await page.evaluate(() => {
        if (!document.querySelector("#at-propuestas")) {
          const host = document.createElement("div");
          host.id = "at-propuestas";
          document.body.append(host);
        }
        _propRenderPendientes();
      });
      await sleep(page, 400);
      return page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("#prop-list .prop-card")].map((card) => ({
          text: card.innerText,
          canAskBack: card.innerText.includes("Repreguntar"),
        })),
      );
    },
  };
}

async function answerProposal(page: Page, button: string, text: string): Promise<void> {
  await page.evaluate(() => {
    openMiPadron("propuestas");
  });
  const card = page.locator("#prop-list .prop-card").first();
  await card.getByRole("button", { name: button, exact: true }).click();
  await card.locator("textarea").fill(text);
  await card.locator(".prop-acc .prop-acts button").first().click();
}

function createHunterList(page: Page) {
  return {
    loadHunterList: () =>
      page.evaluate(() => {
        if (!document.querySelector("#hun-list")) {
          for (const id of ["hun-list", "hun-estado"]) {
            const host = document.createElement("div");
            host.id = id;
            document.body.append(host);
          }
        }
        _hunMeta = { 9: true };
        _hunMetaOk = true;
        _hunMetaFalla = false;
        _hunRows = null;
        _hunErr = false;
        _hunCargando = false;
        _hunCargar(true);
      }),
    waitForHunterConnectionProblem: async () => {
      await page.waitForFunction(() => _hunErr, null, { timeout: LOAD_TIMEOUT_MS });
      await sleep(page, SETTLE_MS);
    },
    hunterList: () =>
      page.evaluate(() => ({
        text: document.querySelector<HTMLElement>("#hun-list")?.innerText ?? "",
        loadedCompanies: _hunRows === null ? null : _hunRows.length,
        failed: _hunErr,
        emptyNotices: document.querySelectorAll("#hun-list .hun-nada").length,
      })),
    retryHunterList: () =>
      page.evaluate(() => {
        _hunReintentar();
      }),
    waitForHunterCompanies: async (count: number) => {
      await page.waitForFunction((n) => _hunRows?.length === n, count, {
        timeout: LOAD_TIMEOUT_MS,
      });
      await sleep(page, SETTLE_MS);
    },
    checkHunterFlyers: () =>
      page.evaluate(async () => {
        _hunMeta = {};
        _hunMetaOk = false;
        _hunMetaFalla = false;
        await new Promise<void>((resolve) => {
          _hunMetasCargar(resolve);
        });
        return { failed: _hunMetaFalla, hasFlyer: { ..._hunMeta } };
      }),
  };
}

export function createLegacyCompanyRegistryDriver(page: Page): CompanyRegistryDriver {
  return {
    ...createCompanyLoading(page),
    ...createSearch(page),
    ...createCompanyApplying(page),
    ...createUpdateDialog(page),
    ...createGenerator(page),
    ...createEditor(page),
    ...createDatabaseScreen(page),
    ...createSheets(page),
    ...createProposals(page),
    answerProposal: (button, text) => answerProposal(page, button, text),
    ...createHunterList(page),
  };
}
