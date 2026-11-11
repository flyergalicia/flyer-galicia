import type { Meta, StoryObj } from "@storybook/react-vite";
import { PalettePicker } from "./PalettePicker.tsx";

const meta = {
  title: "Shared/UI/PalettePicker",
  component: PalettePicker,
} satisfies Meta<typeof PalettePicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InTheCurrentLook: Story = {};
