import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "../avatar/Avatar.tsx";
import { Badge } from "../badge/Badge.tsx";
import { ListRow } from "./ListRow.ts";

const meta = {
  title: "Shared/UI/ListRow",
  component: ListRow,
  args: { children: null },
} satisfies Meta<typeof ListRow>;

export default meta;

type Story = StoryObj<typeof meta>;

const content = (
  <>
    <Avatar initials="AP" color="#00695c" />
    <ListRow.Main>
      <ListRow.Title>Asesor Prueba</ListRow.Title>
      <ListRow.Meta>asesor.prueba@bancogalicia.com.ar</ListRow.Meta>
    </ListRow.Main>
    <ListRow.Aside>
      <Badge tone="green">Activo</Badge>
    </ListRow.Aside>
  </>
);

export const Regular: Story = { render: () => <ListRow>{content}</ListRow> };
export const Compact: Story = { render: () => <ListRow density="compact">{content}</ListRow> };
