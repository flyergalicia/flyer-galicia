import type { Meta, StoryObj } from "@storybook/react-vite";
import { App } from "./App.tsx";

const meta = {
  title: "App/App",
  component: App,
} satisfies Meta<typeof App>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: {
    environment: {
      ok: true,
      value: { supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "public-key" },
    },
  },
};

export const MissingEnvironment: Story = {
  args: {
    environment: { ok: false, missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] },
  },
};
