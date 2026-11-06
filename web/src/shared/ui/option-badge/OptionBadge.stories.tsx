import type { Meta, StoryObj } from "@storybook/react-vite";
import { OptionBadge } from "./OptionBadge.tsx";

const meta = {
  title: "Shared/UI/OptionBadge",
  component: OptionBadge,
  args: { option: 9, label: "Combustible", color: "#2e7d32" },
} satisfies Meta<typeof OptionBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
