import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./Avatar.tsx";

const meta = {
  title: "Shared/UI/Avatar",
  component: Avatar,
  args: { initials: "AP", color: "#00695c" },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const Small: Story = { args: { size: "sm" } };
