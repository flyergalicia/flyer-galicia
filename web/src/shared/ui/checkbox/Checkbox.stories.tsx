import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./Checkbox.tsx";

const meta = {
  title: "Shared/UI/Checkbox",
  component: Checkbox,
  args: { children: "Una sola fila por marca" },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
