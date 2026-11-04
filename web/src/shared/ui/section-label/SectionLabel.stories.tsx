import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionLabel } from "./SectionLabel.tsx";

const meta = {
  title: "Shared/UI/SectionLabel",
  component: SectionLabel,
  args: { children: "Usuarios del sistema" },
} satisfies Meta<typeof SectionLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Section: Story = {};
export const Panel: Story = { args: { kind: "panel", children: "Flyer Galicia 5.5" } };
