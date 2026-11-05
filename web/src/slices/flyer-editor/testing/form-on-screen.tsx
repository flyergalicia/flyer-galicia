// Test support: the form with everything it reads, over a simulated cloud.
import type { ReactNode } from "react";
import { vi } from "vitest";
import { render } from "vitest-browser-react";
import { workspaceOnScreen } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import type { FlyerForm } from "../model/flyer-form.ts";
import { FormStage } from "./FormStage.tsx";

type Row = Readonly<Record<string, unknown>>;

export interface FormCloud extends AppAnswers {
  readonly companies?: readonly Row[];
  readonly advisors?: readonly Row[] | Answer;
  /** Faculties beyond those of the profile. */
  readonly faculties?: Readonly<Record<string, boolean>>;
  readonly role?: string;
}

function advisorsAnswer(advisors: FormCloud["advisors"]): Answer {
  return typeof advisors === "function" ? advisors : () => jsonResponse(advisors ?? []);
}

/** The harness of a person who has the session open. */
export function formHarness({ companies, advisors, faculties, role, ...answers }: FormCloud = {}) {
  const harness = createAppHarness({
    ...answers,
    profile: { ...ADVISOR, role: role ?? "asesor" },
    files: {
      "_facultades.json": { roles: { [role ?? "asesor"]: faculties ?? {} } },
      ...answers.files,
    },
    tables: {
      padron_empresas: () => jsonResponse(companies ?? []),
      asesores_guardados: advisorsAnswer(advisors),
      ...answers.tables,
    },
  });
  harness.storeSession();
  return harness;
}

/** Renders the children with the form above them, and gives its store once it is on screen. */
export async function openWithForm(children: ReactNode, cloud: FormCloud = {}) {
  const harness = formHarness(cloud);
  let form: FlyerForm | null = null;
  const screen = await render(
    harness.wrap(
      <FormStage
        onForm={(onScreen) => {
          form = onScreen;
        }}
      >
        {children}
      </FormStage>,
    ),
  );
  const onScreen = () => {
    if (!form) throw new Error("The form is not on screen");
    return form;
  };
  await vi.waitFor(() => {
    onScreen();
    workspaceOnScreen();
  });
  return { screen, harness, form: onScreen, workspace: workspaceOnScreen };
}
