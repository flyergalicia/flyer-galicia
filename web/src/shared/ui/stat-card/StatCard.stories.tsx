import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatCard } from "./StatCard.tsx";

const meta = {
  title: "Shared/UI/StatCard",
  component: StatCard,
  args: { label: "Total usuarios", value: 5 },
} satisfies Meta<typeof StatCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Green: Story = { args: { tone: "green", label: "Activos", value: 4 } };
export const Red: Story = { args: { tone: "red", label: "Admins", value: 1 } };
export const Blue: Story = { args: { tone: "blue", label: "Flyers generados", value: 0 } };
export const Yellow: Story = { args: { tone: "yellow", label: "Pendientes aprobación", value: 1 } };
