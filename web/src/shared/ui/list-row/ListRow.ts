import {
  ListRowRoot,
  ListRowMain,
  ListRowTitle,
  ListRowMeta,
  ListRowAside,
} from "./ListRow.parts.tsx";

export const ListRow = Object.assign(ListRowRoot, {
  Main: ListRowMain,
  Title: ListRowTitle,
  Meta: ListRowMeta,
  Aside: ListRowAside,
});
