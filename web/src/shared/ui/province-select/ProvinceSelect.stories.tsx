import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ProvinceSelect } from "./ProvinceSelect.tsx";

const PROVINCES = ["BUENOS AIRES", "CAPITAL FEDERAL", "CORDOBA", "MENDOZA", "NEUQUEN"];

function Example({ start = "" }: { readonly start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <ProvinceSelect
      provinces={PROVINCES}
      value={value}
      allLabel="Todas las provincias"
      onChange={setValue}
    />
  );
}

const meta = {
  title: "Shared/UI/ProvinceSelect",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const None: Story = {};
export const One: Story = { args: { start: "MENDOZA" } };
export const Several: Story = { args: { start: "BUENOS AIRES;CAPITAL FEDERAL" } };
export const Disabled: Story = {
  render: () => (
    <ProvinceSelect
      provinces={[]}
      value=""
      allLabel="Todas las provincias"
      disabled
      disabledLabel="Actualizá el catálogo para filtrar por provincia"
      onChange={() => undefined}
    />
  ),
};
