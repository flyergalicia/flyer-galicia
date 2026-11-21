import { useEffect } from "react";
import { usePlaceDesk } from "../places/place-desk.ts";
import { notePlaceDesk } from "./place-desk-on-page.ts";

/** Test support: draws nothing, it only leaves the desk of the page where a test can ask. */
export function PlaceDeskReader() {
  const desk = usePlaceDesk();
  useEffect(() => {
    notePlaceDesk(desk);
    return () => {
      notePlaceDesk(null);
    };
  }, [desk]);
  return null;
}
