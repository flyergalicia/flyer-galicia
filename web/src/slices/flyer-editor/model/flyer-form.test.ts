import { describe, expect, it, vi } from "vitest";
import type { FlyerValues } from "@/shared/flyer-engine/types.ts";
import { createFlyerForm, INITIAL_FORM_CONTEXT } from "./flyer-form.ts";
import { valuesForFileName } from "./file-name.ts";
import { withCompany, withNoCashback } from "./form-state.ts";

describe("the store of the form", () => {
  it("tells the flyer and whoever listens, and stops telling", () => {
    const setForm = vi.fn<(form: FlyerValues) => void>();
    const form = createFlyerForm({ setForm });
    const listener = vi.fn<() => void>();
    const stop = form.subscribe(listener);

    form.update((state) => withCompany(state, "ACME"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(setForm.mock.lastCall?.[0].empresa).toBe("ACME");
    expect(form.getState().empresa).toBe("ACME");

    stop();
    form.update((state) => withCompany(state, "BETA"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("what it draws with goes to the flyer too", () => {
    const setForm = vi.fn<(form: FlyerValues) => void>();
    const form = createFlyerForm({ setForm });
    const listener = vi.fn<() => void>();
    form.subscribe(listener);
    const context = { ...INITIAL_FORM_CONTEXT, tab: "rubros" as const };

    form.setContext(context);

    expect(form.getContext()).toBe(context);
    expect(setForm.mock.lastCall?.[0].benef).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("what the name of the file reads", () => {
  it("the company, the first officer and the cashback in use", () => {
    const form = createFlyerForm({ setForm: () => undefined });
    form.update((state) => withCompany(state, "ACME"));
    expect(valuesForFileName(form.getState(), form.getContext())).toEqual({
      empresa: "ACME",
      nombre: "",
      config: "BAU",
    });
    expect(valuesForFileName(withNoCashback(form.getState()), form.getContext()).config).toBe(
      "Sin cashback",
    );
    expect(valuesForFileName({ ...form.getState(), cashback: 99 }, form.getContext()).config).toBe(
      "",
    );
  });
});
