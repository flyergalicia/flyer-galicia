import type { Meta, StoryObj } from "@storybook/react-vite";
import { ZoomControls } from "./ZoomControls.tsx";

const nothing = () => undefined;

const meta = {
  title: "Shared/UI/ZoomControls",
  component: ZoomControls,
  args: { percent: 100, onOut: nothing, onIn: nothing, onReset: nothing },
} satisfies Meta<typeof ZoomControls>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AtItsSize: Story = {};
export const Zoomed: Story = { args: { percent: 125 } };
