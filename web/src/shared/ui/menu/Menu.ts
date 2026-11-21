import {
  MenuRoot,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuSeparator,
  MenuLabel,
  MenuHead,
} from "./Menu.parts.tsx";

export const Menu = Object.assign(MenuRoot, {
  Trigger: MenuTrigger,
  List: MenuList,
  Item: MenuItem,
  Separator: MenuSeparator,
  Label: MenuLabel,
  Head: MenuHead,
});
