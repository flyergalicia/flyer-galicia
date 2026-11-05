// How Estudio reaches the flyer editor, which is another screen and may not be on the page yet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ToastProvider } from "../toast/ToastProvider.tsx";
import { type DesignDeskWorks, useAttachDesignDesk, useDesignDesk } from "./design-desk.ts";
import { createDesignDeskHub } from "./design-desk-hub.ts";
import { DesignDeskHost } from "./DesignDeskHost.tsx";

function works(): DesignDeskWorks {
  return {
    openDesign: vi.fn<DesignDeskWorks["openDesign"]>(() => Promise.resolve()),
    closeDesign: vi.fn<DesignDeskWorks["closeDesign"]>(),
    applySavedSet: vi.fn<DesignDeskWorks["applySavedSet"]>(() => Promise.resolve()),
    showFlyer: vi.fn<DesignDeskWorks["showFlyer"]>(() => Promise.resolve()),
  };
}

const load = () => Promise.reject(new Error("Not used"));
type Call = () => void;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the hub", () => {
  it("with the editor on the page it goes straight there", async () => {
    const openEditor = vi.fn<Call>();
    const hub = createDesignDeskHub({ openEditor, onEditorNotThere: () => undefined });
    const editor = works();
    hub.attach(editor);
    await hub.openDesign(load);
    await hub.applySavedSet("s");
    await hub.showFlyer(9);
    hub.closeDesign("d");
    expect(editor.openDesign).toHaveBeenCalledWith(load);
    expect(editor.applySavedSet).toHaveBeenCalledWith("s");
    expect(editor.showFlyer).toHaveBeenCalledWith(9);
    expect(editor.closeDesign).toHaveBeenCalledWith("d");
    expect(openEditor).not.toHaveBeenCalled();
  });

  it("without it, it asks for it and waits", async () => {
    const openEditor = vi.fn<Call>();
    const hub = createDesignDeskHub({ openEditor, onEditorNotThere: () => undefined });
    const going = hub.openDesign(load);
    expect(openEditor).toHaveBeenCalledOnce();
    const editor = works();
    hub.attach(editor);
    await going;
    expect(editor.openDesign).toHaveBeenCalledWith(load);
  });

  it("if it never arrives it says so, and closing a design there is nothing", async () => {
    const onEditorNotThere = vi.fn<Call>();
    const hub = createDesignDeskHub({ openEditor: () => undefined, onEditorNotThere, waitMs: 10 });
    hub.closeDesign("d");
    await hub.showFlyer(9);
    await hub.applySavedSet("s");
    expect(onEditorNotThere).toHaveBeenCalledTimes(2);
  });

  it("one that left does not stay", async () => {
    const openEditor = vi.fn<Call>();
    const hub = createDesignDeskHub({ openEditor, onEditorNotThere: () => undefined, waitMs: 5 });
    const first = works();
    const leave = hub.attach(first);
    const second = works();
    hub.attach(second);
    leave();
    await hub.showFlyer(1);
    expect(second.showFlyer).toHaveBeenCalledWith(1);
    hub.attach(first)();
    await hub.showFlyer(2);
    expect(openEditor).toHaveBeenCalled();
  });
});

function Asker({ editor }: { readonly editor?: DesignDeskWorks }) {
  const desk = useDesignDesk();
  return (
    <button
      type="button"
      onClick={() => {
        void desk.showFlyer(9);
      }}
    >
      {editor ? <Attach editor={editor} /> : null}
      Ir
    </button>
  );
}

function Attach({ editor }: { readonly editor: DesignDeskWorks }) {
  useAttachDesignDesk(editor);
  return null;
}

describe("the host", () => {
  it("gives the desk to whoever asks, and the editor says it is there", async () => {
    const editor = works();
    const onNeedEditor = vi.fn<Call>();
    await render(
      <ToastProvider>
        <DesignDeskHost onNeedEditor={onNeedEditor}>
          <Asker editor={editor} />
        </DesignDeskHost>
      </ToastProvider>,
    );
    await page.getByRole("button", { name: "Ir" }).click();
    await vi.waitFor(() => {
      expect(editor.showFlyer).toHaveBeenCalledWith(9);
    });
    expect(onNeedEditor).not.toHaveBeenCalled();
  });

  it("an editor that does not arrive is said", async () => {
    const onNeedEditor = vi.fn<Call>();
    await render(
      <ToastProvider>
        <DesignDeskHost onNeedEditor={onNeedEditor} waitMs={5}>
          <Asker />
        </DesignDeskHost>
      </ToastProvider>,
    );
    await page.getByRole("button", { name: "Ir" }).click();
    expect(onNeedEditor).toHaveBeenCalledOnce();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("No se pudo abrir el armador. Revisá la conexión y probá de nuevo.");
  });

  it("asking without it says what is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Asker />)).rejects.toThrow(/DesignDeskHost/);
  });

  it("the editor alone has nobody to tell", async () => {
    await render(<Attach editor={works()} />);
    expect(document.body).toBeTruthy();
  });
});
