import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { App } from "./App.tsx";

describe("App", () => {
  it("shows the ready state when the environment is complete", async () => {
    const screen = await render(
      <App
        environment={{
          ok: true,
          value: { supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "public-key" },
        }}
      />,
    );

    await expect.element(screen.getByRole("heading", { name: "Flyer Galicia" })).toBeVisible();
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("names what is missing when the environment is incomplete", async () => {
    const screen = await render(
      <App environment={{ ok: false, missing: ["VITE_SUPABASE_URL"] }} />,
    );

    await expect.element(screen.getByRole("alert")).toMatchTextContent(/VITE_SUPABASE_URL/);
  });
});
