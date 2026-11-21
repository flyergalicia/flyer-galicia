// What the search of screens asks of the editor: a panel, "Cambiar logos", the menu "Otros" or a flyer
// of the bar. Each one does what its button does.
import {
  type EditorPanel,
  isEditorPanel,
  LOGO_EDITING_PLACE,
  optionOfPlace,
  OTHERS_PLACE,
} from "@/shared/domain/editor-panels.ts";
import { MENU_OPEN, usePlaceDesk, usePlaceRequests } from "@/shared/lib/places/place-desk.ts";
import { useEnterLogoEditing } from "@/slices/logo-editor/index.ts";

interface EditorPlaceWays {
  readonly showPanel: (panel: EditorPanel) => void;
  /** What touching a flyer of the bar does. */
  readonly chooseOption: (option: number) => void;
}

export function useEditorPlaces({ showPanel, chooseOption }: EditorPlaceWays): void {
  const desk = usePlaceDesk();
  const enterLogoEditing = useEnterLogoEditing();
  usePlaceRequests("flyer-editor", (place) => {
    const option = optionOfPlace(place);
    if (option !== null) {
      chooseOption(option);
      return;
    }
    if (isEditorPanel(place)) {
      showPanel(place);
      return;
    }
    showPanel("individual");
    if (place === LOGO_EDITING_PLACE) enterLogoEditing();
    if (place === OTHERS_PLACE) desk?.ask("flyer-others", MENU_OPEN);
  });
}
