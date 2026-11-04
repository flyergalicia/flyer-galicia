import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, type BadgeTone } from "./Badge.tsx";

const meta = {
  title: "Shared/UI/Badge",
  component: Badge,
  args: { tone: "green", children: "Activo" },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

const toneStory = (tone: BadgeTone, children: string): Story => ({ args: { tone, children } });

export const Active: Story = toneStory("green", "Activo");
export const Inactive: Story = toneStory("red", "Inactivo");
export const Admin: Story = toneStory("blue", "Admin");
export const Advisor: Story = toneStory("purple", "Asesor");
export const Vip: Story = toneStory("gold", "VIP");
export const Pending: Story = toneStory("amber", "Pendiente");
export const Pro: Story = toneStory("teal", "Pro");
export const Hunter: Story = toneStory("violet", "Hunter");
export const Leader: Story = toneStory("navy", "Líder");
export const Valid: Story = toneStory("valid", "Vigente");
export const Ending: Story = toneStory("ending", "Vence este mes");
export const Expired: Story = toneStory("expired", "Vencida");
export const Review: Story = toneStory("review", "Revisar");
export const NotFound: Story = toneStory("none", "No encontrada");
export const Outside: Story = toneStory("outside", "Fuera de la provincia");
export const Soon: Story = toneStory("soon", "Próximamente");
export const Uppercase: Story = { args: { tone: "purple", uppercase: true, children: "Asesor" } };
export const Chip: Story = { args: { tone: "valid", size: "chip", children: "Vigente: 751" } };
