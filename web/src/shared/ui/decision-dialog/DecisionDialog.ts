import {
  DecisionAlert,
  DecisionDialogRoot,
  DecisionField,
  DecisionFoot,
  DecisionHint,
  DecisionItem,
  DecisionList,
  DecisionNo,
  DecisionText,
  DecisionYes,
} from "./DecisionDialog.parts.tsx";

export const DecisionDialog = Object.assign(DecisionDialogRoot, {
  Text: DecisionText,
  List: DecisionList,
  Item: DecisionItem,
  Alert: DecisionAlert,
  Field: DecisionField,
  Hint: DecisionHint,
  Foot: DecisionFoot,
  No: DecisionNo,
  Yes: DecisionYes,
});
