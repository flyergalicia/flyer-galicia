import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Tabs } from "./Tabs.ts";
import type { TabsVariant } from "./Tabs.parts.tsx";

function Example({ variant }: { readonly variant: TabsVariant }) {
  const [value, setValue] = useState("agenda");
  return (
    <Tabs value={value} onChange={setValue} variant={variant}>
      <Tabs.List label="Ejemplo">
        <Tabs.Tab value="empresas">Mis empresas</Tabs.Tab>
        <Tabs.Tab value="agenda">Agenda</Tabs.Tab>
        <Tabs.Tab value="gestiones" count={2}>
          Gestiones
        </Tabs.Tab>
        <Tabs.Tab value="tablero" disabled>
          Tablero
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="agenda">Lo que hay en Agenda</Tabs.Panel>
    </Tabs>
  );
}

const meta = {
  title: "Shared/UI/Tabs",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Segmented: Story = { args: { variant: "segmented" } };
export const Pills: Story = { args: { variant: "pills" } };
export const PillsInAWindow: Story = { args: { variant: "pills-window" } };
export const Underline: Story = { args: { variant: "underline" } };
export const Line: Story = { args: { variant: "line" } };
