import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./Switch.tsx";

const meta = {
  title: "Shared/UI/Switch",
  component: Switch,
  args: { checked: true, onChange: () => undefined, label: "Mostrar en el flyer" },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {};
export const Off: Story = { args: { checked: false } };
export const Disabled: Story = { args: { disabled: true } };
export const InARow: Story = { args: { children: "Oficiales por sede" } };
export const InARowOff: Story = { args: { checked: false, children: "Oficiales por sede" } };
