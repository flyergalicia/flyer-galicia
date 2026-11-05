import { useEffect, useRef } from "react";

/** What an action that outlives a render reads: always the value of the last one. */
export function useLatest<Value>(value: Value) {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  return latest;
}
