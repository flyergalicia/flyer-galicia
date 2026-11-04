import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "./Icon.tsx";

const meta = {
  title: "Shared/UI/Icon",
  component: Icon,
  args: { name: "download" },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FollowsTheText: Story = {};
export const WithASize: Story = { args: { name: "database", size: 24 } };
