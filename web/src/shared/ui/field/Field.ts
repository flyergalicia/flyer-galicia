import { Input, Select, Textarea } from "./controls.tsx";
import { FieldRoot, FieldLabel, FieldMessage } from "./Field.parts.tsx";

export const Field = Object.assign(FieldRoot, {
  Label: FieldLabel,
  Input,
  Select,
  Textarea,
  Message: FieldMessage,
});
